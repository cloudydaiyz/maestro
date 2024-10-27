import init from "../util/init";
import { defaultConfig, noMembersConfig, onlyEventTypesConfig } from "../util/db-config";

import { describe } from "@jest/globals";
import { arrayToObject, deleteFromArray, objectToArray, shuffleArray } from "../../util/helper";
import { GoogleSheetsLogService } from "../../services/logs/gsheets-log";
import { ObjectId, WithId } from "mongodb";
import { AttendeeSchema, EventSchema, EventsAttendedBucketSchema } from "../../types/core-types";
import { TroupeSyncService } from "../../services/sync";
import { TroupeApiService } from "../../services/api";
import { PublicEvent, UpdateEventRequest } from "../../types/api-types";
import { TroupeCoreService } from "../../services/core";

const { dbSetup } = init();

describe("troupe sync service", () => {
    it("should sync correctly", async () => {
        const config = await dbSetup(onlyEventTypesConfig);
        const troupeId = config.troupes!["A"].id!;
        const memberPropertyTypes = config.troupes!["A"].troupe!.memberPropertyTypes;

        const syncService = await TroupeSyncService.create();
        const apiService = await TroupeApiService.create();

        // Sync the troupe and ensure no errors are thrown
        await expect(syncService.sync(troupeId, true)).resolves.not.toThrow();
        
        // Get all events and ensure they all have at least one field
        const events = await apiService.getEvents(troupeId);
        expect(events.length).toBeGreaterThan(0);
        events.forEach(e => expect(Object.keys(e.fieldToPropertyMap).length).toBeGreaterThan(0));
        console.log(events);

        const memberProperties = Object.keys(memberPropertyTypes);
        const numRequiredProperties = memberProperties.filter(p => memberPropertyTypes[p].endsWith("!")).length;

        // Assign random member properties to each of the events and
        // ensure at least one event exists that collects all required member properties
        let validMemberEventExists = false;
        const updateEvents: Promise<PublicEvent>[] = [];
        for(const event of events) {

            // Shuffle the member properties and ensure required properties are last
            let shuffledMemberProperties = shuffleArray(deleteFromArray(memberProperties, "Member ID"));
            shuffledMemberProperties.sort((propA, propB) => {
                const [requiredA, requiredB] = [memberPropertyTypes[propA].endsWith("!"), memberPropertyTypes[propB].endsWith("!")];
                if(requiredA && requiredB) return 0;
                if(requiredA) return 1;
                if(requiredB) return -1;
                return Math.random() - 0.5;
            });

            // Check if the event will collect all required properties
            const eventFields = Object.keys(event.fieldToPropertyMap);
            if(eventFields.length >= numRequiredProperties) validMemberEventExists = true;

            // Assign random properties to each field, then update the event
            let memberIdSet = false;
            const updateProperties: UpdateEventRequest["updateProperties"] = {};
            for(const fieldId of eventFields) {
                if(!memberIdSet) {
                    updateProperties[fieldId] = "Member ID";
                    memberIdSet = true;
                } else {
                    updateProperties[fieldId] = shuffledMemberProperties.pop()!;
                }
            }
            updateEvents.push(apiService.updateEvent(troupeId, event.id, { updateProperties }));
        }
        
        // Ensure at least one event exists that collects all required member properties and
        // sync the troupe again to collect members from the events
        expect(validMemberEventExists).toBe(true);
        const eventUpdates = await Promise.all(updateEvents);
        eventUpdates.forEach(e => console.log(e));
        await expect(syncService.sync(troupeId, true)).resolves.not.toThrow();

        // Ensure at least one member's information is collected
        const audience = await apiService.getAudience(troupeId);
        expect(audience.length).toBeGreaterThan(0);

        // Ensure all audience members have the required properties
        for(const member of audience) {
            for(const prop of memberProperties) {
                if(memberPropertyTypes[prop].endsWith("!")) {
                    expect(member.properties[prop].value).not.toBeNull();
                }
            }
        }
    });

    it("should update sync log correctly", async () => {
        const logService = new GoogleSheetsLogService();
        const config = await dbSetup(onlyEventTypesConfig);
        const troupeId = config.troupes!["A"].id!;
        const memberPropertyTypes = config.troupes!["A"].troupe!.memberPropertyTypes;

        const syncService = await TroupeSyncService.create();
        const apiService = await TroupeApiService.create();
        const coreService = await TroupeCoreService.create();

        // Create a new log for the updated troupe
        const currentLog = await coreService.newTroupeLog(troupeId);

        // Sync the troupe and ensure no errors are thrown
        await expect(syncService.sync(troupeId)).resolves.not.toThrow();

        // Get all events and ensure they all have at least one field
        const events = await apiService.getEvents(troupeId);
        expect(events.length).toBeGreaterThan(0);
        events.forEach(e => expect(Object.keys(e.fieldToPropertyMap).length).toBeGreaterThan(0));

        const memberProperties = Object.keys(memberPropertyTypes);
        const numRequiredProperties = memberProperties.filter(p => memberPropertyTypes[p].endsWith("!")).length;

        // Assign random member properties to each of the events and
        // ensure at least one event exists that collects all required member properties
        let validMemberEventExists = false;
        const updateEvents: Promise<PublicEvent>[] = [];
        for(const event of events) {

            // Shuffle the member properties and ensure required properties are last
            let shuffledMemberProperties = shuffleArray(deleteFromArray(memberProperties, "Member ID"));
            shuffledMemberProperties.sort((propA, propB) => {
                const [requiredA, requiredB] = [memberPropertyTypes[propA].endsWith("!"), memberPropertyTypes[propB].endsWith("!")];
                if(requiredA && requiredB) return 0;
                if(requiredA) return 1;
                if(requiredB) return -1;
                return Math.random() - 0.5;
            });

            // Check if the event will collect all required properties
            const eventFields = Object.keys(event.fieldToPropertyMap);
            if(eventFields.length >= numRequiredProperties) validMemberEventExists = true;

            // Assign random properties to each field, then update the event
            let memberIdSet = false;
            const updateProperties: UpdateEventRequest["updateProperties"] = {};
            for(const fieldId of eventFields) {
                if(!memberIdSet) {
                    updateProperties[fieldId] = "Member ID";
                    memberIdSet = true;
                } else {
                    updateProperties[fieldId] = shuffledMemberProperties.pop()!;
                }
            }
            updateEvents.push(apiService.updateEvent(troupeId, event.id, { updateProperties }));
        }
        
        // Ensure at least one event exists that collects all required member properties and
        // sync the troupe again to collect members from the events
        expect(validMemberEventExists).toBe(true);
        const eventUpdates = await Promise.all(updateEvents);
        eventUpdates.forEach(e => console.log(e));
        await expect(syncService.sync(troupeId)).resolves.not.toThrow();

        // Ensure at least one member's information is collected
        const audience = await apiService.getAudience(troupeId);
        expect(audience.length).toBeGreaterThan(0);

        // Ensure all audience members have the required properties
        for(const member of audience) {
            for(const prop of memberProperties) {
                if(memberPropertyTypes[prop].endsWith("!")) {
                    expect(member.properties[prop].value).not.toBeNull();
                }
            }
        }

        // Obtain the troupe, events, and audience
        const postSyncTroupe = await coreService.troupeColl.findOne({ _id: new ObjectId(troupeId) });
        expect(postSyncTroupe).not.toBeNull();

        const postSyncEvents = await coreService.eventColl.find({ troupeId }).toArray();
        const postSyncAudience = await coreService.audienceColl.find({ troupeId }).toArray();
        const postSyncEventsAttended = await coreService.eventsAttendedColl.find({ troupeId }).toArray();
        
        // Convert the audience data to attendee data
        const postSyncAttendees = postSyncAudience.map<WithId<AttendeeSchema>>(m => {
            const buckets = postSyncEventsAttended
                .filter(ea => ea.memberId == m._id.toHexString());
            
            let eventsAttended: EventsAttendedBucketSchema["events"] = {};
            buckets.forEach(b => {
                eventsAttended = {...eventsAttended, ...b.events};
            });

            return {...m, eventsAttended};
        });

        // Validate the log sheet
        await expect(logService.validateLog(currentLog!, postSyncTroupe!, postSyncEvents, postSyncAttendees!)).resolves.toBe(true);
    });
});