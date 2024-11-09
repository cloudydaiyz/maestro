import type { BaseMemberPoints, BaseMemberProperties, BaseMemberPropertyTypes, BasePointTypes, EventSchema, EventTypeSchema, EventsAttendedBucketSchema, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema, VariableMemberPoints, VariableMemberProperties, VariableMemberPropertyTypes, VariablePointTypes } from "../types/core-types";
import type { Attendee, ConsoleData, EventType, PublicEvent } from "../types/api-types";
import type { ObjectId, WithId } from "mongodb";
import type { Id } from "../types/util-types";

import { randomElement, verifyMemberPropertyType, getDefaultMemberPropertyValue, generatePseudoObjectId } from "./helper";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_PAGE_SIZE } from "./constants";
import { toAttendee, toEventType, toPublicEvent, toTroupe, toTroupeDashboard } from "./api-transform";

import { assert } from "./helper";

/** 
 * Configuration for setting up the database with test data. 
 * Using `ObjectId` as the generic type adds `ObjectId`s to each of the entities in this config when populated. 
 * Otherwise, the `ObjectId`s will be omitted.
 */
export interface SystemSetupConfig<T extends ObjectId | null> {
    troupes?: { 
        [customTroupeId: string]: Partial<
            (Omit<T extends ObjectId ? WithId<TroupeSchema> : TroupeSchema, "pointTypes" | "memberPropertyTypes">)
            & Id 
            & {
                memberPropertyTypes: Partial<BaseMemberPropertyTypes> & VariableMemberPropertyTypes,
                pointTypes: Partial<BasePointTypes> & VariablePointTypes, 
                
                /** Populated once after setup is complete */
                troupe: T extends ObjectId ? WithId<TroupeSchema> : TroupeSchema,

                /** Populated once after setup is complete */
                dashboard: T extends ObjectId ? WithId<TroupeDashboardSchema> : TroupeDashboardSchema,
            }
        >
    };
    eventTypes?: { 
        [customEventTypeId: string]: Partial<
            (T extends ObjectId ? WithId<EventTypeSchema> : EventTypeSchema) 
            & Id 
            & { 
                customTroupeId: string,

                /** Populated once after setup is complete */
                eventType: T extends ObjectId ? WithId<EventTypeSchema> : EventTypeSchema,
            }
        > 
    };
    events?: { 
        [customEventId: string]: Partial<
            (T extends ObjectId ? WithId<EventSchema> : EventSchema) 
            & Id 
            & {
                customTroupeId: string,
                customEventTypeId: string,

                /** Populated once after setup is complete */
                event: T extends ObjectId ? WithId<EventSchema> : EventSchema,
            }
        >
    };
    members?: { 
        [customMemberId: string]: Partial<
            (Omit<T extends ObjectId ? WithId<MemberSchema> : MemberSchema, "properties" | "points">) 
            & Id 
            & { 
                customTroupeId: string,
                properties: Partial<BaseMemberProperties> & VariableMemberProperties,
                points: Partial<BaseMemberPoints> & VariableMemberPoints,
                customEventAttendedIds: string[],

                /** Uses custom event IDs as keys */
                eventsAttended: EventsAttendedBucketSchema["events"],

                /** Populated once after setup is complete */
                member: T extends ObjectId ? WithId<MemberSchema> : MemberSchema,
            }
        >
    };
}

/**
 * Populates the config with entity data.
 * - Troupe event type array will be empty, unless `populateConfigWithIds` is called
 */
export function populateConfig(config: SystemSetupConfig<null>) {
    config = {
        troupes: config.troupes || {},
        eventTypes: config.eventTypes || {},
        events: config.events || {},
        members: config.members || {},
    }
    const customTroupeIds = Object.keys(config.troupes!);

    // Create the troupe
    const configTroupes: TroupeSchema[] = [];
    const configDashboards: TroupeDashboardSchema[] = [];
    for(const customTroupeId in config.troupes) {
        const request = config.troupes[customTroupeId];
        // request._id = new ObjectId();
        // request.id = request._id.toHexString();
        request.id = generatePseudoObjectId();

        const newTroupe: TroupeSchema = {
            // _id: request._id,
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

        const newDashboard: TroupeDashboardSchema = {
            // _id: new ObjectId(),
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
        request.dashboard = newDashboard;
        configTroupes.push(newTroupe);
        configDashboards.push(newDashboard);
    }
    
    for(const customEventTypeId in config.eventTypes) {
        const request = config.eventTypes[customEventTypeId];
        // request._id = new ObjectId();
        // request.id = request._id.toHexString();
        request.id = generatePseudoObjectId();

        const customTroupeId = request.customTroupeId || randomElement(customTroupeIds);
        const troupe = config.troupes![customTroupeId]?.troupe;
        assert(troupe, `Invalid troupe ID specified for test config. Event Type ID: ${customEventTypeId}, Troupe ID: ${customTroupeId}`);

        const newEventType: EventTypeSchema = {
            // _id: request._id,
            lastUpdated: request.lastUpdated || new Date(),
            title: request.title || "Test Event Type - " + customEventTypeId,
            value: request.value || Math.round(Math.random() * 25),
            sourceFolderUris: request.sourceFolderUris || [],
            synchronizedSourceFolderUris: request.synchronizedSourceFolderUris || [],
        };
        
        request.eventType = newEventType;
        // troupe.eventTypes.push(newEventType);
    }

    const configEvents: EventSchema[] = [];
    for(const customEventId in config.events) {
        const request = config.events[customEventId];
        // request._id = new ObjectId();
        // request.id = request._id.toHexString();
        request.id = generatePseudoObjectId();

        const customTroupeId = request.customTroupeId || randomElement(customTroupeIds);
        const troupe = config.troupes![customTroupeId]?.troupe;
        const customEventTypeId = request.customEventTypeId;
        const eventType = customEventTypeId ? config.eventTypes![customEventTypeId]?.eventType : undefined;
        assert(troupe, `Invalid troupe ID specified for test config. Event ID: ${customEventId}, Troupe ID: ${customTroupeId}`);
        assert(!customEventTypeId || eventType, `Invalid event type ID specified for test config. Event ID: ${customEventId}, Event Type ID: ${customEventTypeId}`);

        const newEvent: EventSchema = {
            // _id: request._id,
            // troupeId: troupe._id.toHexString(),
            troupeId: config.troupes![customTroupeId].id!,
            lastUpdated: request.lastUpdated || new Date(),
            title: request.title || "Test Event - " + customEventId,
            source: request.source || "",
            synchronizedSource: request.synchronizedSource || "",
            sourceUri: request.sourceUri || "https://example.com/" + customEventId,
            synchronizedSourceUri: request.synchronizedSourceUri || "https://example.com/" + customEventId,
            startDate: request.startDate || new Date(),
            // eventTypeId: eventType ? eventType._id.toHexString() : undefined,
            eventTypeId: eventType ? config.eventTypes![customEventTypeId!].id : undefined,
            eventTypeTitle: eventType ? eventType.title : undefined,
            value: eventType ? eventType.value : request.value || Math.round(Math.random() * 25),
            fieldToPropertyMap: request.fieldToPropertyMap || {},
            synchronizedFieldToPropertyMap: request.synchronizedFieldToPropertyMap || {},
        };

        request.event = newEvent;
        configEvents.push(newEvent);
    }

    const configAudience: MemberSchema[] = [];
    const configEventsAttended: EventsAttendedBucketSchema[] = [];
    for(const customMemberId in config.members) {
        const request = config.members[customMemberId];
        // request._id = new ObjectId();
        // request.id = request._id.toHexString();
        request.id = generatePseudoObjectId();

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
        const newMember: MemberSchema = {
            // _id: request._id,
            // troupeId: troupe._id.toHexString(),
            troupeId: config.troupes![customTroupeId].id!,
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
        configAudience.push(newMember);

        // Create a single bucket with all the events attended, populated with the events from the request
        request.eventsAttended = {};
        const customEventsAttended = request.customEventAttendedIds || [];

        const eventIds: string[] = [];
        for(const customEventId of customEventsAttended) {
            const event = config.events![customEventId]?.event;
            assert(event, `Invalid event attended specified for test config. Member ID: ${customMemberId}, Custom Event ID: ${customEventId}`);
                
            // Update the events attended and increment the member's points if the event is not already in the list
            // const eventId = event._id.toHexString();
            const eventId = config.events![customEventId].id!;
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
        let newEventsAttended: EventsAttendedBucketSchema = {
            // _id: new ObjectId(),
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
                configEventsAttended.push(newEventsAttended);
                newEventsAttended = {
                    // _id: new ObjectId(),
                    troupeId: newEventsAttended.troupeId,
                    memberId: newEventsAttended.memberId,
                    events: {},
                    page: newEventsAttended.page + 1,
                }
                pageSize = 0;
            }
        }

        if(pageSize > 0) configEventsAttended.push(newEventsAttended);
    }

    return { configTroupes, configEvents, configAudience, configEventsAttended, configDashboards };
}

/** Returns a console for the specified custom troupe ID from the config */
export function populateConfigAsOneConsole(config: SystemSetupConfig<null>, customTroupeId: string, configPopulated = true): ConsoleData {
    if(!configPopulated) populateConfig(config);

    const troupe = toTroupe(config.troupes![customTroupeId].troupe!, config.troupes![customTroupeId].id!);
    const dashboard = toTroupeDashboard(config.troupes![customTroupeId].dashboard!, config.troupes![customTroupeId].id!);

    const eventTypes: EventType[] = [];
    for(const customEventTypeId in config.eventTypes) {
        const { customTroupeId: ctid, eventType, id } = config.eventTypes[customEventTypeId];
        if(ctid == customTroupeId) eventTypes.push(toEventType(eventType!, id!));
    }

    const events: PublicEvent[] = [];
    for(const customEventId in config.events) {
        const { customTroupeId: ctid, event, id } = config.events[customEventId];
        if(ctid == customTroupeId) events.push(toPublicEvent(event!, id!));
    }

    const attendees: Attendee[] = [];
    for(const customMemberId in config.members) {
        const { customTroupeId: ctid, member, eventsAttended, id } = config.members[customMemberId];
        if(ctid == customTroupeId) {
            attendees.push(toAttendee(
                {...member!, eventsAttended: eventsAttended! }, 
                id!
            ));
        }
    }

    return {
        troupe,
        dashboard,
        eventTypes,
        events,
        attendees
    };
}

export type ConfigToConsoleMap = { [customTroupeId: string]: ConsoleData };

/** Returns a map from custom troupe IDs to its corresponding console */
export function populateConfigAsConsoles(config: SystemSetupConfig<null>): ConfigToConsoleMap {
    populateConfig(config);
    
    const configToConsoleMap: ConfigToConsoleMap = {};
    for(const customTroupeId in config.troupes) {
        configToConsoleMap[customTroupeId] = populateConfigAsOneConsole(config, customTroupeId);
    }

    return configToConsoleMap;
}

export const defaultConfig: SystemSetupConfig<ObjectId | null> = {
    troupes: { 
        "A": { 
            name: "test troupe", 
            pointTypes: { 
                "Fall": { startDate: new Date(1728870141961), endDate: new Date(1733017341961) },
            },
            memberPropertyTypes: {
                "New Prop": "string?",
            }
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
        "fifth": { title: "test event 5", customTroupeId: "A", customEventTypeId: "alright events", startDate: new Date(1728850141961) },
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

export const noMembersConfig: SystemSetupConfig<ObjectId | null> = {
    troupes: { 
        "A": { 
            name: "test troupe", 
            pointTypes: { 
                "Fall": { startDate: new Date(1728870141961), endDate: new Date(1733017341961) },
            },
            memberPropertyTypes: {
                "New Prop": "string?",
            }
        } 
    },
    eventTypes: {
        "cool events": { value: 10 },
        "alright events": { value: 3 },
        "uncool events": { value: -7 },
    },
    events: { 
        "first": { title: "test event 1", customTroupeId: "A", customEventTypeId: "cool events", source: "Google Forms", sourceUri: "https://docs.google.com/forms/d/1zmXsG53ymMTY16OoPR0VD7mqqP94HcPILskiOA7lOA4" }, 
        "second": { title: "test event 2", customTroupeId: "A", customEventTypeId: "alright events", startDate: new Date(1728880141961), source: "Google Sheets", sourceUri: "https://docs.google.com/spreadsheets/d/1Ita-QOxFBd37i-_7xxKtTOh4FghBknFY5WO9Yrqc2nE/edit" },
        "third": { title: "test event 3", customTroupeId: "A", customEventTypeId: "uncool events" },
        "fourth": { title: "test event 4 (special)", customTroupeId: "A", value: 4, startDate: new Date(1728850141961) },
        "fifth": { title: "test event 5", customTroupeId: "A", customEventTypeId: "alright events", startDate: new Date(1728850141961) },
        "sixth": { title: "test event 6 (special)", customTroupeId: "A", value: -2 },
        "seventh": { title: "test event 7 (special)", customTroupeId: "A", value: 7 },
    },
}

export const onlyEventTypesConfig: SystemSetupConfig<ObjectId | null> = {
    troupes: { 
        "A": { 
            name: "test troupe", 
            pointTypes: { 
                "Fall": { startDate: new Date(1728870141961), endDate: new Date(1733017341961) },
            },
            memberPropertyTypes: {
                "New Prop": "string?",
            }
        } 
    },
    eventTypes: {
        "cool events": { value: 10, sourceFolderUris: [ "https://drive.google.com/drive/folders/1gQAhRgA7RzOPe_7YWdjniBiK8Q97yV8D" ] },
    },
}