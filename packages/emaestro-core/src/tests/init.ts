import "dotenv/config";

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MONGODB_PASS, MONGODB_USER } from '../util/env';
import { MongoClient, ObjectId, WithId } from 'mongodb';
import { BaseService } from "../services/base-service";
import { BaseMemberPoints, BaseMemberProperties, BaseMemberPropertyTypes, BasePointTypes, EventSchema, EventTypeSchema, EventsAttendedBucketSchema, MemberSchema, TroupeSchema, VariableMemberPoints, VariableMemberProperties, VariableMemberPropertyTypes, VariablePointTypes } from "../types/core-types";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_PAGE_SIZE } from "../util/constants";
import assert from "assert";
import { randomElement } from "../util/helper";
import { Id } from "../types/util-types";

/**
 * Configuration for setting up the database with test data
 */
export interface DbSetupConfig {
    troupes?: { 
        [customTroupeId: string]: Partial<Omit<WithId<TroupeSchema>, "pointTypes" | "memberPropertyTypes"> & Id & {
            memberPropertyTypes: Partial<BaseMemberPropertyTypes> & VariableMemberPropertyTypes,
            pointTypes: Partial<BasePointTypes> & VariablePointTypes, 
            troupe: WithId<TroupeSchema>,
        }>
    };
    eventTypes?: { 
        [customEventTypeId: string]: Partial<WithId<EventTypeSchema> & Id & { 
            customTroupeId: string,
            eventType: WithId<EventTypeSchema>,
        }> 
    };
    events?: { 
        [customEventId: string]: Partial<WithId<EventSchema> & Id & {
            customTroupeId: string,
            customEventTypeId: string,
            event: WithId<EventSchema>,
        }>
    };
    members?: { 
        [customMemberId: string]: Partial<Omit<WithId<MemberSchema>, "properties" | "points"> & Id & { 
            customTroupeId: string,
            properties: Partial<BaseMemberProperties> & VariableMemberProperties,
            points: Partial<BaseMemberPoints> & VariableMemberPoints,
            customEventAttendedIds: string[],

            /** Uses custom event IDs as keys */
            eventsAttended: EventsAttendedBucketSchema["events"]
            member: WithId<MemberSchema>,
        }> 
    };
}

export const defaultConfig: DbSetupConfig = {
    troupes: { 
        "A": { 
            name: "test troupe", 
            pointTypes: { 
                "Fall": { startDate: new Date(1728870141961), endDate: new Date(1733017341961) },
            },
        } 
    },
    eventTypes: {
        "cool events": { value: 10 },
        "alright events": { value: 3 },
        "uncool events": { value: -7 },
    },
    events: { 
        "first": { title: "test event 1", customTroupeId: "A", customEventTypeId: "cool events" }, 
        "second": { title: "test event 2", customTroupeId: "A", customEventTypeId: "alright events", startDate: new Date(1728880141961) },
        "third": { title: "test event 3", customTroupeId: "A", customEventTypeId: "uncool events" },
        "fourth": { title: "test event 4 (special)", customTroupeId: "A", value: 4, startDate: new Date(1728850141961) },
        "fifth": { title: "test event 5", customTroupeId: "A", customEventTypeId: "alright events" },
        "sixth": { title: "test event 4 (special)", customTroupeId: "A", value: -2 },
        "seventh": { title: "test event 4 (special)", customTroupeId: "A", value: 7 },
    },
    members: {
        "1": { 
            properties: { 
                "First Name": { value: "John", override: false }, 
                "Last Name": { value: "Doe", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "third"],
        },
        "2": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "second", "third", "fourth", "fifth"],
        },
        "3": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["second", "fourth", "seventh"],
        },
        "4": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["third", "fourth", "fifth", "sixth"],
        },
        "5": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"],
        },
    }
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
    const setup = await BaseService.create();

    const customTroupeIds = Object.keys(config.troupes!);

    // Create the troupe
    const testTroupes: WithId<TroupeSchema>[] = [];
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

        request.troupe = newTroupe;
        testTroupes.push(newTroupe);
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
            sourceUri: request.sourceUri || "https://example.com",
            synchronizedSourceUri: request.synchronizedSourceUri || "https://example.com",
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
                "Email": request.properties?.["Email"] || { value: customMemberId + "@emaestro.com", override: false },
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

        const customEventIds: string[] = [];
        for(const customEventId of customEventsAttended) {
            const event = config.events![customEventId]?.event;
            assert(event, `Invalid event attended specified for test config. Member ID: ${customMemberId}, Event ID: ${customEventId}`);
                
            // Update the events attended and increment the member's points if the event is not already in the list
            if(!(customEventId in request.eventsAttended)) {
                request.eventsAttended[customEventId] = {
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
            customEventIds.push(customEventId);
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

        for(const customEventId of customEventIds) {
            const eventId = config.events![customEventId].id!;
            newEventsAttended.events[eventId] = request.eventsAttended[customEventId];
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
    if(testTroupes.length > 0) operations.push(setup.troupeColl.insertMany(testTroupes));
    if(testEvents.length > 0) operations.push(setup.eventColl.insertMany(testEvents));
    if(testAudience.length > 0) operations.push(setup.audienceColl.insertMany(testAudience));
    if(testEventsAttended.length > 0) operations.push(setup.eventsAttendedColl.insertMany(testEventsAttended));

    await Promise.all(operations);
    await setup.close();
    return config;
}

export default function () {
    let mongod: MongoMemoryReplSet;
    const resources: BaseService[] = [];

    // Start the server
    beforeAll(async () => {
        mongod = await MongoMemoryReplSet.create({ replSet: { auth: { enable: true, customRootName: MONGODB_USER, customRootPwd: MONGODB_PASS } } });
        const uri = mongod.getUri();

        // Connect to and ping the server to ensure everything is setup
        const client = new MongoClient(uri, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        client.on("connecting", () => console.log("Connecting to MongoDB..."));
        client.on("connected", () => console.log("Connected to MongoDB"));
        client.on("error", (err) => console.error("Connection error:", err));

        await client.connect();
        await client.db("admin").command({ ping: 1 });
        await client.close();

        process.env.MONGODB_URI = uri;
    });
    
    // Delete all data from the database
    afterEach(async () => {
        const cleanupService = await BaseService.create();
        resources.push(cleanupService);

        // Delete all collections
        await Promise.all([
            cleanupService.troupeColl.deleteMany({}),
            cleanupService.dashboardColl.deleteMany({}),
            cleanupService.eventColl.deleteMany({}),
            cleanupService.audienceColl.deleteMany({}),
            cleanupService.eventsAttendedColl.deleteMany({}),
        ]);

        await Promise.all(resources.map(r => r.close()));
    });

    // Stop the server
    afterAll(async () => {
        await mongod.stop();
    });

    return { resources, dbSetup };
};