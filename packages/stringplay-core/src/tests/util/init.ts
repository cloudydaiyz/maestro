import { ObjectId, WithId } from 'mongodb';
import { BaseDbService } from "../../services/base";
import { EventSchema, EventTypeSchema, EventsAttendedBucketSchema, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../../types/core-types";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_PAGE_SIZE } from "../../util/constants";
import { getDefaultMemberPropertyValue, randomElement, verifyMemberPropertyType } from "../../util/helper";
import { StringplayApiService } from "../../services/api";
import { DbSetupConfig, defaultConfig } from "./db-config";
import { cleanDbConnections, cleanLogs, startDb, stopDb } from "../../util/resources";
import assert from "assert";

export default function () {

    // Start the server
    beforeAll(async () => {
        await startDb();

        // Test that the default config is working properly
        const config = await dbSetup(defaultConfig);
        const api = await StringplayApiService.create();
        
        await Promise.all([
            expect(api.getEvents(config.troupes!["A"].id!)).resolves.toHaveLength(7),
            expect(api.getAudience(config.troupes!["A"].id!)).resolves.toHaveLength(5),
        ]);
        api.close();
    });
    
    // Delete all data from the database
    afterEach(async () => {
        const cleanupService = await BaseDbService.create();

        // Delete all collections
        await Promise.all([
            cleanupService.troupeColl.deleteMany({}),
            cleanupService.dashboardColl.deleteMany({}),
            cleanupService.eventColl.deleteMany({}),
            cleanupService.audienceColl.deleteMany({}),
            cleanupService.eventsAttendedColl.deleteMany({}),
        ]);
        await cleanDbConnections();
    });

    // Stop the server
    afterAll(async () => {
        await cleanLogs();
        await stopDb();
    });

    return { dbSetup };
};

/**
 * Setup the database with the given configuration, opting out of interaction with
 * external services (Google Sheets, Google Forms, etc.)
 */
async function dbSetup(config: DbSetupConfig) {
    config = {
        troupes: config.troupes || {},
        eventTypes: config.eventTypes || {},
        events: config.events || {},
        members: config.members || {},
    }
    const db = await BaseDbService.create();

    const customTroupeIds = Object.keys(config.troupes!);

    // Create the troupe
    const testTroupes: WithId<TroupeSchema>[] = [];
    const testDashboards: WithId<TroupeDashboardSchema>[] = [];
    for(const customTroupeId in config.troupes) {
        const request = config.troupes[customTroupeId];
        request._id = new ObjectId();
        request.id = request._id.toHexString();

        const newTroupe: WithId<TroupeSchema> = {
            _id: request._id,
            lastUpdated: request.lastUpdated || new Date(),
            name: request.name || "Test Troupe - " + customTroupeId,
            logSheetUri: request.logSheetUri || "https://example.com",
            syncLock: request.syncLock || false,
            eventTypes: [],
            memberPropertyTypes: { ...BASE_MEMBER_PROPERTY_TYPES, ...request.memberPropertyTypes },
            synchronizedMemberPropertyTypes: BASE_MEMBER_PROPERTY_TYPES,
            pointTypes: { ...BASE_POINT_TYPES_OBJ, ...request.pointTypes },
            synchronizedPointTypes: BASE_POINT_TYPES_OBJ,
        };

        const newDashboard: WithId<TroupeDashboardSchema> = {
            _id: new ObjectId(),
            troupeId: request.id,
            lastUpdated: new Date(),
            upcomingBirthdays: {
                frequency: "monthly",
                desiredFrequency: "monthly",
                members: [],
            },
            totalMembers: 0,
            totalEvents: 0,
            totalAttendees: 0,
            totalEventTypes: 0,
            avgAttendeesPerEvent: 0,
            avgAttendeesByEventType: {},
            attendeePercentageByEventType: {},
            eventPercentageByEventType: {},
            totalAttendeesByEventType: {},
            totalEventsByEventType: {},
        }

        request.troupe = newTroupe;
        testTroupes.push(newTroupe);
        testDashboards.push(newDashboard);
    }

    for(const customEventTypeId in config.eventTypes) {
        const request = config.eventTypes[customEventTypeId];
        request._id = new ObjectId();
        request.id = request._id.toHexString();

        const customTroupeId = request.customTroupeId || randomElement(customTroupeIds);
        const troupe = config.troupes![customTroupeId]?.troupe;
        assert(troupe, `Invalid troupe ID specified for test config. Event Type ID: ${customEventTypeId}, Troupe ID: ${customTroupeId}`);

        const newEventType: WithId<EventTypeSchema> = {
            _id: request._id,
            lastUpdated: request.lastUpdated || new Date(),
            title: request.title || "Test Event Type - " + customEventTypeId,
            value: request.value || Math.round(Math.random() * 25),
            sourceFolderUris: request.sourceFolderUris || [],
            synchronizedSourceFolderUris: request.synchronizedSourceFolderUris || [],
        };
        
        request.eventType = newEventType;
        troupe.eventTypes.push(newEventType);
    }

    const testEvents: WithId<EventSchema>[] = [];
    for(const customEventId in config.events) {
        const request = config.events[customEventId];
        request._id = new ObjectId();
        request.id = request._id.toHexString();

        const customTroupeId = request.customTroupeId || randomElement(customTroupeIds);
        const troupe = config.troupes![customTroupeId]?.troupe;
        const customEventTypeId = request.customEventTypeId;
        const eventType = customEventTypeId ? config.eventTypes![customEventTypeId]?.eventType : undefined;
        assert(troupe, `Invalid troupe ID specified for test config. Event ID: ${customEventId}, Troupe ID: ${customTroupeId}`);
        assert(!customEventTypeId || eventType, `Invalid event type ID specified for test config. Event ID: ${customEventId}, Event Type ID: ${customEventTypeId}`);

        const newEvent: WithId<EventSchema> = {
            _id: request._id,
            troupeId: troupe._id.toHexString(),
            lastUpdated: request.lastUpdated || new Date(),
            title: request.title || "Test Event - " + customEventId,
            source: request.source || "",
            synchronizedSource: request.synchronizedSource || "",
            sourceUri: request.sourceUri || "https://example.com/" + customEventId,
            synchronizedSourceUri: request.synchronizedSourceUri || "https://example.com/" + customEventId,
            startDate: request.startDate || new Date(),
            eventTypeId: eventType ? eventType._id.toHexString() : undefined,
            eventTypeTitle: eventType ? eventType.title : undefined,
            value: eventType ? eventType.value : request.value || Math.round(Math.random() * 25),
            fieldToPropertyMap: request.fieldToPropertyMap || {},
            synchronizedFieldToPropertyMap: request.synchronizedFieldToPropertyMap || {},
        };

        request.event = newEvent;
        testEvents.push(newEvent);
    }

    const testAudience: WithId<MemberSchema>[] = [];
    const testEventsAttended: WithId<EventsAttendedBucketSchema>[] = [];
    for(const customMemberId in config.members) {
        const request = config.members[customMemberId];
        request._id = new ObjectId();
        request.id = request._id.toHexString();

        const customTroupeId = request.customTroupeId || randomElement(customTroupeIds);
        const troupe = config.troupes![customTroupeId]?.troupe;
        assert(troupe, `Invalid troupe ID specified for test config. Member ID: ${customMemberId}, Troupe ID: ${customTroupeId}`);

        // Ensure the request has the correct properties if additional are specified by troupe config
        // Point calculations happen further down
        request.points = request.points || {};
        for(const pointType in troupe.pointTypes) {
            request.points[pointType] = request.points[pointType] || 0;
        }
        
        // Ensure the request has the correct properties if additional are specified by troupe config
        const baseMemberPropertyDefaults: {[key: string]: MemberPropertyValue} = {
            "Member ID": customMemberId,
            "First Name": "Member",
            "Last Name": crypto.randomUUID(),
            "Email": customMemberId + "@stringplay.com",
            "Birthday": new Date(),
        };

        request.properties = request.properties || {};
        for(const property in troupe.memberPropertyTypes) {
            const propertyType = troupe.memberPropertyTypes[property];
            const currentMemberProperty = request.properties[property];

            if(currentMemberProperty) {
                assert(
                    verifyMemberPropertyType(currentMemberProperty.value, propertyType), 
                    "Invalid specified member property"
                );
            }

            request.properties[property] = currentMemberProperty || { 
                value: property in baseMemberPropertyDefaults ? baseMemberPropertyDefaults[property]
                    : getDefaultMemberPropertyValue(propertyType),
                override: false 
            };
        }

        // Initialize the new member and add it to the test documents
        const newMember: WithId<MemberSchema> = {
            _id: request._id,
            troupeId: troupe._id.toHexString(),
            lastUpdated: request.lastUpdated || new Date(),
            properties: {
                ...request.properties,
                "Member ID": request.properties?.["Member ID"] || { value: customMemberId, override: false },
                "First Name": request.properties?.["First Name"] || { value: "Member", override: false },
                "Last Name": request.properties?.["Last Name"] || { value: crypto.randomUUID(), override: false },
                "Email": request.properties?.["Email"] || { value: customMemberId + "@stringplay.com", override: false },
                "Birthday": request.properties?.["Birthday"] || { value: new Date(), override: false },
            },
            points: {
                ...request.points,
                "Total": request.points?.["Total"] || 0,
            },
        };
        request.member = newMember;
        testAudience.push(newMember);

        // Create a single bucket with all the events attended, populated with the events from the request
        request.eventsAttended = {};
        const customEventsAttended = request.customEventAttendedIds || [];

        const eventIds: string[] = [];
        for(const customEventId of customEventsAttended) {
            const event = config.events![customEventId]?.event;
            assert(event, `Invalid event attended specified for test config. Member ID: ${customMemberId}, Custom Event ID: ${customEventId}`);
                
            // Update the events attended and increment the member's points if the event is not already in the list
            const eventId = event._id.toHexString();
            if(!(eventId in request.eventsAttended)) {
                request.eventsAttended[eventId] = {
                    typeId: event.eventTypeId,
                    value: event.value,
                    startDate: event.startDate,
                };

                for(const pointType in troupe.pointTypes) {
                    const pointTypeData = troupe.pointTypes[pointType];
                    if(pointTypeData.startDate <= event.startDate && (!pointTypeData.endDate || pointTypeData.endDate >= event.startDate)) {
                        newMember.points[pointType] = (newMember.points[pointType] || 0) + event.value;
                    }
                }
            }
            eventIds.push(eventId);
        }

        // Split the collected events into separate buckets and add them to the test documents
        let newEventsAttended: WithId<EventsAttendedBucketSchema> = {
            _id: new ObjectId(),
            troupeId: config.troupes![customTroupeId].id!,
            memberId: request.id,
            events: {},
            page: 0,
        };
        let pageSize = 0;

        for(const eventId of eventIds) {
            newEventsAttended.events[eventId] = request.eventsAttended[eventId];
            pageSize++;

            if(pageSize == MAX_PAGE_SIZE) {
                testEventsAttended.push(newEventsAttended);
                newEventsAttended = {
                    _id: new ObjectId(),
                    troupeId: newEventsAttended.troupeId,
                    memberId: newEventsAttended.memberId,
                    events: {},
                    page: newEventsAttended.page + 1,
                }
                pageSize = 0;
            }
        }

        if(pageSize > 0) testEventsAttended.push(newEventsAttended);
    }

    const operations: Promise<any>[] = [];
    if(testTroupes.length > 0) operations.push(db.troupeColl.insertMany(testTroupes));
    if(testEvents.length > 0) operations.push(db.eventColl.insertMany(testEvents));
    if(testAudience.length > 0) operations.push(db.audienceColl.insertMany(testAudience));
    if(testEventsAttended.length > 0) operations.push(db.eventsAttendedColl.insertMany(testEventsAttended));
    if(testDashboards.length > 0) operations.push(db.dashboardColl.insertMany(testDashboards));

    await Promise.all(operations).then(() => db.close());
    return config;
}