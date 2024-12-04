// Google Forms data source

import { ObjectId, WithId } from "mongodb";
import { EventDataMap, GoogleFormsQuestionToTypeMap, AttendeeDataMap } from "../../../types/service-types";
import { BaseMemberProperties, EventsAttendedBucketSchema, EventSchema, MemberPropertyValue, MemberSchema, TroupeLimit, TroupeSchema, VariableMemberProperties } from "../../../types/core-types";
import { forms_v1 } from "googleapis";
import { getForms } from "../../../cloud/gcp";
import { GaxiosResponse } from "gaxios";
import assert from "assert";
import { getEventDataSourceId, getMatcherIndex } from "../../../util/helper";
import { DateParser } from "../../../util/server/date-parser";
import { EventDataService } from "../base";

export class GoogleFormsEventDataService extends EventDataService {
    forms!: forms_v1.Forms;

    questionData?: GaxiosResponse<forms_v1.Schema$Form>;
    responseData?: GaxiosResponse<forms_v1.Schema$ListFormResponsesResponse>;
    containsMemberId?: true;

    constructor(troupe: WithId<TroupeSchema>, events: EventDataMap, members: AttendeeDataMap,
        currentLimits: TroupeLimit, incrementLimits: Partial<TroupeLimit>) { 
        super(troupe, events, members, currentLimits, incrementLimits);
    };

    async init(): Promise<void> {
        this.forms = await getForms();
    }

    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {
        const formId = getEventDataSourceId("Google Forms", event.sourceUri)!;
        const questionToTypeMap: GoogleFormsQuestionToTypeMap = {};
        const eventData = this.eventMap[event.sourceUri];
        assert(eventData, "Improperly structured event data");

        // Retrieve form data
        try {
            this.questionData = await this.forms.forms.get({ formId });
            assert(this.questionData.data.items, "No questions found in form");
        } catch(e) {
            console.log("Error getting form data for Google Form " + formId + 
                " (Event ID: " + eventData.event._id.toHexString() + "). Skipping...");
            console.log(e);
            return;
        }

        // Retrieve the event and responses responses if the event isn't flagged for deletion
        await this.synchronizeEvent(event, this.questionData.data.items, questionToTypeMap);

        if(this.containsMemberId) {
            try {
                this.responseData = await this.forms.forms.responses.list({ formId });
                assert(this.responseData.data.responses, "No responses found in form");
            } catch(e) {
                console.log("Error getting form data for Google Form " + formId + 
                    " (Event ID: " + eventData.event._id.toHexString() + "). Skipping...");
                console.log("Problem:", e);
                return;
            }
            await this.synchronizeAudience(event, lastUpdated, this.responseData.data.responses, questionToTypeMap);
        }
    }

    // Synchronize the event's field to property map with the form data
    protected async synchronizeEvent(event: WithId<EventSchema>, items: forms_v1.Schema$Item[], 
        questionToTypeMap: GoogleFormsQuestionToTypeMap): Promise<void> {
        const allFields = Object.keys(event.fieldToPropertyMap);
        const includedFields: string[] = [];

        // Extract the event's field to property map from event questions
        for(const item of items) {
            const field = item.title;
            const fieldId = item.questionItem?.question?.questionId;
            const question = item.questionItem;
            if(!field || !fieldId || !question || !question.question) continue;

            // If there's no existing property, see if the troupe has a matcher that
            // matches with the field for this event
            const matcherId = getMatcherIndex(this.troupe, field);
            const matcherProperty = matcherId !== null ? this.troupe.fieldMatchers[matcherId].memberProperty : null;
            let property = event.fieldToPropertyMap[fieldId]?.property || matcherProperty;

            // Init the updated field to property map
            let override = event.fieldToPropertyMap[fieldId]?.override;
            event.fieldToPropertyMap[fieldId] = { field, override, matcherId, property: null };
            includedFields.push(fieldId);
            if(!property) continue;

            // Ensure the given property is valid for the question, otherwise set the event property to null
            questionToTypeMap[fieldId] = {};
            const propertyType = this.troupe.memberPropertyTypes[property].slice(0, -1);
            if(question.question.textQuestion) {
                // Allowed types: string
                if(propertyType == "string") {
                    questionToTypeMap[fieldId].string = true;
                } else {
                    property = null;
                }
            } else if(question.question.choiceQuestion) {
                if(question.question.choiceQuestion.type != "RADIO" 
                    && question.question.choiceQuestion.type != "DROP_DOWN") {
                    property = null;
                }
                
                // Allowed types = string, number, date, boolean
                if(propertyType == "string") {
                    questionToTypeMap[fieldId].string = true;
                } else if(propertyType == "number") {
                    // Ensure all properties are numbers
                    const validType = question.question.choiceQuestion.options?.every(
                        option => !Number.isNaN(Number(option.value))
                    );

                    if(!validType) {
                        property = null;
                    } else {
                        questionToTypeMap[fieldId].number = true;
                    }
                } else if(propertyType == "date") {
                    // Ensure all properties are dates
                    const validType = question.question.choiceQuestion.options?.every(
                        option => option.value && !Number.isNaN(Date.parse(option.value))
                    );

                    if(!validType) {
                        property = null;
                    } else {
                        questionToTypeMap[fieldId].date = true;
                    }
                } else if(propertyType == "boolean") {
                    // Ensure all properties are booleans
                    const validType = question.question.choiceQuestion.options?.length === 2
                        && question.question.choiceQuestion.options.every(
                            option => option.value
                        );

                    if(!validType) {
                        property = null;
                    } else {
                        questionToTypeMap[fieldId].boolean = {
                            true: question.question.choiceQuestion.options![0].value!,
                            false: question.question.choiceQuestion.options![1].value!,
                        };
                    }
                } else {
                    property = null;
                }
            } else if(question.question.scaleQuestion) {

                // Allowed types: string, number, boolean
                if(propertyType == "string") {
                    questionToTypeMap[fieldId].string = true;
                } else if(propertyType == "number") {
                    questionToTypeMap[fieldId].number = true;
                } else if(propertyType == "boolean") {
                    const validType = question.question.scaleQuestion.high 
                        && question.question.scaleQuestion.low == 1
                        && question.question.scaleQuestion.high - question.question.scaleQuestion.low == 1;

                    if(!validType) {
                        property = null;
                    } else {
                        questionToTypeMap[fieldId].boolean = {
                            true: question.question.scaleQuestion.high!,
                            false: question.question.scaleQuestion.low!,
                        };
                    }
                } else {
                    property = null;
                }
            } else if(question.question.dateQuestion) {

                if(propertyType == "string") {
                    questionToTypeMap[fieldId].string = true;
                } else if(propertyType == "date") {
                    questionToTypeMap[fieldId].date = true; 
                } else {
                    property = null;
                }
            } else if(question.question.timeQuestion) {

                if(propertyType == "string") {
                    questionToTypeMap[fieldId].string = true;
                } else {
                    property = null;
                }
            } else {
                property = null;
            }

            if(property == "Member ID") this.containsMemberId = true;
            event.fieldToPropertyMap[fieldId].property = property;
        }

        // Delete any fields that are no longer in the form
        for(const fieldId of allFields) {
            if(!includedFields.includes(fieldId)) {
                delete event.fieldToPropertyMap[fieldId];
            }
        }
    }

    // Synchronize member information with form response data
    protected async synchronizeAudience(event: WithId<EventSchema>, lastUpdated: Date, 
        responses: forms_v1.Schema$FormResponse[], questionToTypeMap: GoogleFormsQuestionToTypeMap): Promise<void> {
        const troupeId = this.troupe._id.toHexString();
        const eventId = event._id.toHexString();

        for(const response of responses) {

            // Initialize member properties
            const properties = {} as BaseMemberProperties & VariableMemberProperties;
            for(const prop in this.troupe.memberPropertyTypes) {
                properties[prop] = { value: null, override: false };
            }

            // Initialize a new member
            let member: WithId<MemberSchema> = {
                _id: new ObjectId(),
                troupeId,
                lastUpdated,
                properties,
                points: { "Total": 0 },
            };
            let eventsAttended: typeof this.attendeeMap[string]["eventsAttended"] = [];
            let eventsAttendedDocs: WithId<EventsAttendedBucketSchema>[] = [];
            let fromColl = false;
            let isNewMember = true;

            for(const questionId in response.answers) {
                const answer = response.answers[questionId];
                const type = questionToTypeMap[questionId];
                const property = event.fieldToPropertyMap[questionId]?.property;
                const isOriginEvent = this.troupe.originEventId != event._id.toHexString();
                if(!type || !property 
                    || !answer.textAnswers 
                    || !answer.textAnswers.answers
                    || answer.textAnswers.answers.length == 0
                    || !isOriginEvent && member.properties[property].override) 
                    continue;
                
                let value: MemberPropertyValue;
                if(answer.textAnswers.answers[0].value) {
                    if(type.string) {
                        value = answer.textAnswers.answers[0].value;
                    } else if(type.boolean) {
                        value = answer.textAnswers.answers[0].value == type.boolean.true;
                    } else if(type.date) {
                        const parsed = DateParser.parse(answer.textAnswers.answers[0].value);
                        if(!parsed) continue;
                        value = parsed.toDate();
                    } else if(type.number) {
                        value = Number(answer.textAnswers.answers[0].value);
                    } else {
                        continue;
                    }

                    // If the member already exists, use the existing member and copy over any new properties
                    const existingMember = this.attendeeMap[value as string];
                    if(property == "Member ID" && existingMember) {
                        for(const prop in member.properties) {
                            if(!existingMember.member.properties[prop]?.override) {
                                existingMember.member.properties[prop] = member.properties[prop];
                            }
                        }

                        member = existingMember.member;
                        eventsAttended = existingMember.eventsAttended;
                        eventsAttendedDocs = existingMember.eventsAttendedDocs;
                        fromColl = existingMember.fromColl;
                        isNewMember = false;
                    }
                    member.properties[property] = { value, override: isOriginEvent };
                }
            }

            // Eliminate duplicate updates
            if(eventsAttended.find(e => e.eventId == eventId)) return;

            // Only update points if the member hasn't attended this event BEFORE this sync
            for(const pointType in this.troupe.pointTypes) {
                const range = this.troupe.pointTypes[pointType];
                if(!member.points[pointType]) member.points[pointType] = 0;
                if(lastUpdated >= range.startDate && lastUpdated <= range.endDate) {
                    member.points[pointType] += event.value;
                }
            }

            eventsAttended.push({
                eventId,
                typeId: event.eventTypeId,
                value: event.value,
                startDate: event.startDate,
            });
            
            if(isNewMember) {
                if(this.currentLimits.membersLeft === this.incrementLimits.membersLeft) {
                    continue;
                }
                this.incrementLimits.membersLeft! -= 1;
            }

            // Add the member to the list of members. Member ID already proven
            // to exist in event from discoverAndRefreshAudience method
            this.attendeeMap[member.properties["Member ID"].value] = { 
                member,
                eventsAttended,
                eventsAttendedDocs,
                fromColl,
                delete: false,
            };
        }
    }
}