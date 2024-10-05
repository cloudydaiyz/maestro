import { drive_v3, forms_v1, sheets_v4 } from "googleapis";
import { getDrive, getForms, getSheets } from "./cloud/gcp";
import { BaseMemberProperties, EventDataSource, EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberPropertyValue, MemberSchema, TroupeSchema, VariableMemberProperties } from "./types/core-types";
import { MyTroupeService } from "./service";
import { MyTroupeCore } from "./index";
import { DRIVE_FOLDER_MIME, DRIVE_FOLDER_REGEX, DRIVE_FOLDER_URL_TEMPL, EVENT_DATA_SOURCE_MIME_TYPES, EVENT_DATA_SOURCE_URLS, EVENT_DATA_SOURCES, FORMS_REGEX, FORMS_URL_TEMPL, MIME_QUERY, SHEETS_URL_TEMPL } from "./util/constants";
import { ObjectId, WithId } from "mongodb";
import { getUrl } from "./util/helper";
import { DiscoveryEventType, FolderToEventTypeMap, GoogleFormsQuestionToTypeMap } from "./types/service-types";
import { GaxiosResponse, GaxiosError } from "gaxios";
import assert from "assert";

export class MyTroupeSyncService extends MyTroupeService {
    ready: Promise<void>;
    drive!: drive_v3.Drive;
    sheets!: sheets_v4.Sheets;
    forms!: forms_v1.Forms;

    // Output variables
    troupe: WithId<TroupeSchema> | null;
    events: { [sourceUri: string]: WithId<EventSchema> };
    members: { [memberId: string]: WithId<MemberSchema> };
    eventsAttended: { [memberId: string]: WithId<EventsAttendedBucketSchema>[] };

    constructor() {
        super();
        this.troupe = null;
        this.events = {};
        this.members = {};
        this.eventsAttended = {};
        this.ready = this.init();
    }

    async init() {
        this.drive = await getDrive();
        this.sheets = await getSheets();
        this.forms = await getForms();
    }

    /**
     * Synchronize the troupe with all of its source uris for events and event types, then
     * updates the audience and log sheet with the new information.
     * 
     * - Doesn't delete events previously discovered, even if not found in parent
     *   event type folder
     * - Delete members that are no longer in the source folder & have no overridden properties
     * - NOTE: Populate local variables with synchronized information to update the database
     */
    async sync(troupeId: string): Promise<void> {
        assert(!(await this.getTroupeSchema(troupeId)).syncLock, 
            "Troupe is already being synced");

        // Lock the troupe
        this.troupe = await this.troupeColl.findOneAndUpdate(
            { troupeId },
            { $set: { syncLock: true } },
            { returnDocument: "after" }
        );
        assert(this.troupe, "Failed to lock troupe for sync");

        // Perform sync
        await this.discoverEvents()
            .then(this.discoverAndRefreshAudience)
            .then(this.persistSync)
            .then(this.refreshLogSheet);
        
        // Unlock the troupe
        const updateResult2 = await this.troupeColl.updateOne(
            { troupeId },
            { $set: { syncLock: false } }
        );
        assert(updateResult2.modifiedCount === 1, "Failed to unlock troupe after sync");
    }

    /** Discovers events found from the given event types in the troupe */
    protected async discoverEvents(): Promise<void> {
        const troupeId = this.troupe!._id.toHexString();

        // Initialize events
        for await(const event of this.eventColl.find({ troupeId })) {
            event.synchronizedSource = event.source;
            event.synchronizedSourceUri = event.sourceUri;
            event.synchronizedFieldToPropertyMap = event.fieldToPropertyMap;
            this.events[event.sourceUri] = event;
        }

        // To help with tie breaking, keep track of the folders that have been discovered
        const folderToEventTypeMap: FolderToEventTypeMap = {};

        // Populate the array with the IDs of all the event type folders for this troupe
        const foldersToExplore: string[] = [];
        for(const eventType of this.troupe!.eventTypes) {
            const discoveryEventType = { ...eventType, totalFiles: 0 };

            for(const folder in eventType.sourceFolderUris) {
                const folderId = DRIVE_FOLDER_REGEX.exec(folder)!.groups!["folderId"];
                const winningEventType = this.performEventTypeTieBreaker(
                    folderToEventTypeMap, folderId, discoveryEventType
                );

                // Update the winning event type and add the folder to the list of folders to explore
                winningEventType.totalFiles! += 1;
                folderToEventTypeMap[folderId] = winningEventType;
                foldersToExplore.push(folderId);
            }
        }

        // Iterate through all discovered folders and their children for events
        const discoveredFolders: string[] = [];
        while(foldersToExplore.length > 0) {
            const folderId = foldersToExplore.pop()!;
            let winningEventType = folderToEventTypeMap[folderId];

            if(discoveredFolders.includes(folderId)) continue;
            discoveredFolders.push(folderId);

            // Get the folder's children
            let q = `(${MIME_QUERY.join(" or ")}) and '${folderId}' in parents`;
            let response: GaxiosResponse<drive_v3.Schema$FileList>;
            try {
                response = await this.drive.files.list(
                    { q, fields: "files(id, name, mimeType)", }
                );
            } catch(e) {
                console.log("Error getting data for folder " + folderId);

                // Remove the folder from the map and the list of folders to explore
                folderToEventTypeMap[folderId].sourceFolderUris = 
                    folderToEventTypeMap[folderId].sourceFolderUris.filter(id => id != folderId);
                delete folderToEventTypeMap[folderId];
                discoveredFolders.pop();
                continue;
            }

            // Go through the files in the Google Drive folders
            const files = response.data.files;
            if(files && files.length) {
                for(const file of files) {
                    let source: EventDataSource = "";
                    let sourceUri = "";
                    const eventDataSource = EVENT_DATA_SOURCE_MIME_TYPES.indexOf(
                        file.mimeType! as typeof EVENT_DATA_SOURCE_MIME_TYPES[number]
                    );

                    if(file.mimeType === DRIVE_FOLDER_MIME) {
                        winningEventType = this.performEventTypeTieBreaker(
                            folderToEventTypeMap, folderId, folderToEventTypeMap[folderId]
                        );

                        // Update the winning event type and add the folder to the list of folders to explore
                        winningEventType.totalFiles! += 1;
                        folderToEventTypeMap[folderId] = winningEventType;
                        foldersToExplore.push(folderId);
                        continue;
                    } else if(EVENT_DATA_SOURCE_MIME_TYPES
                        .includes(file.mimeType! as typeof EVENT_DATA_SOURCE_MIME_TYPES[number])) {
                        
                        file.mimeType = EVENT_DATA_SOURCE_MIME_TYPES[eventDataSource];
                        source = EVENT_DATA_SOURCES[eventDataSource];
                        sourceUri = getUrl(EVENT_DATA_SOURCE_URLS[eventDataSource], file.id!);
                    } else {
                        continue;
                    }

                    // Convert the winning event type back to a regular event type
                    delete winningEventType.totalFiles;

                    // Add the event to the collection of events if it's not already added
                    if(sourceUri in this.events) {
                        const event: WithId<EventSchema> = {
                            _id: new ObjectId(),
                            troupeId,
                            lastUpdated: new Date(),
                            title: file.name!,
                            source,
                            synchronizedSource: source,
                            sourceUri,
                            synchronizedSourceUri: sourceUri,
                            startDate: file.createdTime
                                ? new Date(file.createdTime)
                                : new Date(),
                            value: 0,
                            eventTypeId: winningEventType._id.toHexString(),
                            fieldToPropertyMap: {},
                            synchronizedFieldToPropertyMap: {},
                        };
                        this.events[sourceUri] = event;
                    } else {
                        const event = this.events[sourceUri];
                        if(!event.eventTypeId) {
                            event.eventTypeId = winningEventType._id.toHexString();
                            event.value = winningEventType.value;
                        }
                    }
                }
            }
        }
    }

    /** Performs tie breaker between the given event type and the event type in the map */
    private performEventTypeTieBreaker(map: FolderToEventTypeMap, folderId: string, 
        eventType: DiscoveryEventType): DiscoveryEventType {
        const existingEventType = map[folderId];
        return !existingEventType
            ? eventType
            : existingEventType.totalFiles! < eventType.totalFiles!
            ? existingEventType
            : eventType;
    }
    
    /** 
     * Goes through event sign ups to discover audience, mark them as discovered, 
     * and update existing audience points. Drops invalid audience members.
     * */
    protected async discoverAndRefreshAudience() {
        const troupeId = this.troupe!._id.toHexString();
        const lastUpdated = new Date();

        // Initialize audience members
        for await(const member of this.audienceColl.find({ troupeId })) {
            this.members[member.properties["Member ID"].value] = member;

            // Reset points for each point type in the member
            member.points = { "Total": 0 };
            for(const pointType in Object.keys(this.troupe!.pointTypes)) {
                member.points[pointType] = 0;
            }

            // Reset properties for each non overridden property in the member
            const baseProps: VariableMemberProperties = {};
            for(const prop in this.troupe!.memberPropertyTypes) {
                if(prop in member.properties && member.properties[prop].override) {
                    baseProps[prop] = member.properties[prop];
                }
            }
            member.properties = baseProps as MemberSchema["properties"];
            member.lastUpdated = lastUpdated;
        }
        
        // Discover audience members from all events
        const audienceDiscovery = [];
        for(const event of Object.values(this.events)) {

            // Invariant: All events must have one field for the Member ID defined 
            // or else no member information can be collected from it
            if(!Object.values(event.fieldToPropertyMap)
                .some(mapping => mapping.property === "Member ID")) {
                continue;
            }
            audienceDiscovery.push(this.discoverAudience(event, lastUpdated));
        }
        await Promise.all(audienceDiscovery);
    }

    /**
     * Helper for {@link MyTroupeSyncService.discoverAndRefreshAudience}. Discovers
     * audience information from a single event.
     */
    private async discoverAudience(event: EventSchema, lastUpdated: Date): Promise<void> {
        const troupeId = this.troupe!._id.toHexString();

        if(event.source === "Google Forms") {
            const formId = FORMS_REGEX.exec(event.sourceUri)!.groups!["formId"];
            const questionToTypeMap: GoogleFormsQuestionToTypeMap = {};

            // Retrieve form data
            let questionData;
            try {
                questionData = await this.forms.forms.get({ formId });
                assert(questionData.data.items, "No questions found in form");
            } catch(e) {
                console.log("Error getting form data for " + formId);
                console.log(e);
                delete this.events[event.sourceUri];
                return;
            }

            // Synchronize the field to property map with the form data
            for(const item of questionData.data.items) {
                const field = item.title;
                const fieldId = item.questionItem?.question?.questionId;
                const question = item.questionItem;
                if(!field || !fieldId || !question || !question.question) continue;

                let property = event.fieldToPropertyMap[fieldId]?.property;
                event.fieldToPropertyMap[fieldId] = { field, property: null };
                if(!property) continue;

                // Ensure the given property is valid for the question, otherwise
                // set the event property to null
                const propertyType = this.troupe!.memberPropertyTypes[property].slice(0, -1);
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

            // Retrieve responses
            let responseData;
            try {
                responseData = await this.forms.forms.responses.list({ formId });
                assert(responseData.data.responses, "No responses found in form");
            } catch(e) {
                console.log("Error getting response data for " + formId);
                console.log(e);
                return;
            }

            // Synchronize member information with form response data
            for(const response of responseData.data.responses) {
                let member: WithId<MemberSchema> = {
                    _id: new ObjectId(),
                    troupeId,
                    lastUpdated,
                    properties: {} as BaseMemberProperties & VariableMemberProperties,
                    points: { "Total": 0 },
                };

                for(const questionId in response.answers) {
                    const answer = response.answers[questionId];
                    const type = questionToTypeMap[questionId];
                    const property = event.fieldToPropertyMap[questionId]?.property;
                    if(!type || !property || !answer.textAnswers 
                        || !answer.textAnswers.answers
                        || answer.textAnswers.answers.length == 0
                        || member.properties[property]?.override) 
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

                        if(property == "Member ID") {
                            const existingMember = this.members[value as string];

                            // If the member already exists, use the existing member
                            if(existingMember) {
                                // Copy over properties
                                for(const prop in member.properties) {
                                    if(!existingMember.properties[prop]) {
                                        existingMember.properties[prop] = member.properties[prop];
                                    }
                                }
                                member = existingMember;
                            }
                        }

                        member.properties[property] = { value, override: false };
                    }
                }

                // Update the member's points
                for(const pointType in this.troupe!.pointTypes) {
                    const range = this.troupe!.pointTypes[pointType];
                    if(lastUpdated >= range.startDate && lastUpdated <= range.endDate) {
                        member.points[pointType] += event.value;
                    }
                }

                // Add the member to the list of members. Member ID already proven
                // to exist in event from discoverAndRefreshAudience method
                this.members[member.properties["Member ID"].value] = member;
            }
        }
    }

    protected async persistSync() {
        // update audience members & events
        // update dashboard with statistics from event & audience update

        // $documents stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/documents/
        // $merge stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/merge/
    }

    protected async refreshLogSheet() {
        // get the current log sheet
        // obtain the new values for the sheet
        // calculate the diff & generate updates
        // execute update
    }
}