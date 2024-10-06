// Google Forms data source

import { ObjectId, WithId } from "mongodb";
import { EventDataService, EventMap, GoogleFormsQuestionToTypeMap, MemberMap } from "../../types/service-types";
import { BaseMemberProperties, EventsAttendedBucketSchema, EventSchema, MemberPropertyValue, MemberSchema, TroupeSchema, VariableMemberProperties } from "../../types/core-types";
import { FORMS_REGEX } from "../../util/constants";
import assert from "assert";
import { forms_v1 } from "googleapis";
import { getForms } from "../../cloud/gcp";
import { GaxiosResponse } from "gaxios";

export class GoogleFormsEventDataService implements EventDataService {
    ready: Promise<void>;
    forms!: forms_v1.Forms;
    troupe: WithId<TroupeSchema>;
    events: EventMap;
    members: MemberMap;

    questionData?: GaxiosResponse<forms_v1.Schema$Form>;
    responseData?: GaxiosResponse<forms_v1.Schema$ListFormResponsesResponse>;

    constructor(troupe: WithId<TroupeSchema>, events: EventMap, members: MemberMap) { 
        this.troupe = troupe;
        this.events = events;
        this.members = members;
        this.ready = this.init() 
    };

    async init(): Promise<void> {
        this.forms = await getForms();
    }

    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {
        const formId = FORMS_REGEX.exec(event.sourceUri)!.groups!["formId"];
        const questionToTypeMap: GoogleFormsQuestionToTypeMap = {};

        // Retrieve form data
        try {
            this.questionData = await this.forms.forms.get({ formId });
            assert(this.questionData.data.items, "No questions found in form");
        } catch(e) {
            console.log("Error getting form data for " + formId);
            console.log(e);
            this.events[event.sourceUri].delete = true;
            return;
        }
        await this.synchronizeEvent(event, this.questionData.data.items, questionToTypeMap);

        // Retrieve responses
        try {
            this.responseData = await this.forms.forms.responses.list({ formId });
            assert(this.responseData.data.responses, "No responses found in form");
        } catch(e) {
            console.log("Error getting response data for " + formId);
            console.log(e);
            return;
        }
        await this.synchronizeAudience(event, lastUpdated, this.responseData.data.responses, questionToTypeMap);
    }

    // Synchronize the event's field to property map with the form data
    protected async synchronizeEvent(event: WithId<EventSchema>, items: forms_v1.Schema$Item[], 
        questionToTypeMap: GoogleFormsQuestionToTypeMap): Promise<void> {

        for(const item of items) {
            const field = item.title;
            const fieldId = item.questionItem?.question?.questionId;
            const question = item.questionItem;
            if(!field || !fieldId || !question || !question.question) continue;

            let property = event.fieldToPropertyMap[fieldId]?.property;
            event.fieldToPropertyMap[fieldId] = { field, property: null };
            if(!property) continue;

            // Ensure the given property is valid for the question, otherwise
            // set the event property to null
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

            event.fieldToPropertyMap[fieldId].property = property;
        }
    }

    // Synchronize member information with form response data
    protected async synchronizeAudience(event: WithId<EventSchema>, lastUpdated: Date, 
        responses: forms_v1.Schema$FormResponse[], questionToTypeMap: GoogleFormsQuestionToTypeMap): Promise<void> {
        const troupeId = this.troupe._id.toHexString();

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
            let eventsAttended: typeof this.members[string]["eventsAttended"] = [{
                eventId: event._id.toHexString(),
                typeId: event.eventTypeId,
                value: event.value,
                startDate: event.startDate,
            }];
            let eventsAttendedDocs: WithId<EventsAttendedBucketSchema>[] = [];
            let fromColl = false;

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
                        value = new Date(answer.textAnswers.answers[0].value);
                    } else if(type.number) {
                        value = Number(answer.textAnswers.answers[0].value);
                    } else {
                        continue;
                    }

                    // Invariant: At most one unique property per field
                    if(property == "Member ID") {
                        const existingMember = this.members[value as string];

                        // If the member already exists, use the existing member
                        if(existingMember) {
                            // Copy over properties
                            for(const prop in member.properties) {
                                if(!existingMember.member.properties[prop]) {
                                    existingMember.member.properties[prop] = member.properties[prop];
                                }
                            }
                            member = existingMember.member;
                            eventsAttended = existingMember.eventsAttended.concat(eventsAttended);
                            eventsAttendedDocs = existingMember.eventsAttendedDocs;
                            fromColl = existingMember.fromColl;
                        }
                    }

                    member.properties[property] = { value, override: isOriginEvent };
                }
            }

            // Update the member's points
            for(const pointType in this.troupe.pointTypes) {
                const range = this.troupe.pointTypes[pointType];
                if(lastUpdated >= range.startDate && lastUpdated <= range.endDate) {
                    member.points[pointType] += event.value;
                }
            }

            // Add the member to the list of members. Member ID already proven
            // to exist in event from discoverAndRefreshAudience method
            this.members[member.properties["Member ID"].value] = { 
                member, eventsAttended, eventsAttendedDocs, fromColl, delete: false 
            };
        }
    }
}