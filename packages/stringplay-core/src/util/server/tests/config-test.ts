import type { Attendee, ConsoleData, EventType, PublicEvent } from "../../../types/api-types";
import { WithId, ObjectId } from "mongodb";
import assert from "assert";
import { Id } from "../../../types/util-types";
import { toTroupe, toTroupeDashboard, toTroupeLimits, toEventType, toPublicEvent, toAttendee } from "../../api-transform";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, DEFAULT_MATCHERS, INVITED_TROUPE_LIMIT, MAX_PAGE_SIZE } from "../../constants";
import { randomElement, verifyMemberPropertyType, getDefaultMemberPropertyValue } from "../../helper";
import { TroupeSchema, BaseMemberPropertyTypes, VariableMemberPropertyTypes, BasePointTypes, VariablePointTypes, TroupeDashboardSchema, LimitSchema, EventTypeSchema, EventSchema, MemberSchema, BaseMemberProperties, VariableMemberProperties, BaseMemberPoints, VariableMemberPoints, EventsAttendedBucketSchema, FieldToPropertyMap, MemberPropertyValue, EventDataSource, FieldMatcher } from "../../../types/core-types";

/** Configuration for setting up the database with test data. This implementation doesn't use `ObjectId` */
export interface SystemSetupConfig {
    troupes?: { 
        [customTroupeId: string]: Partial<
            Omit<WithId<TroupeSchema>, "pointTypes" | "memberPropertyTypes">
            & Id 
            & {
                memberPropertyTypes: Partial<BaseMemberPropertyTypes> & VariableMemberPropertyTypes,
                pointTypes: Partial<BasePointTypes> & VariablePointTypes, 
                
                /** Populated once setup is complete */
                troupe: WithId<TroupeSchema>,

                /** Populated once setup is complete */
                dashboard: WithId<TroupeDashboardSchema>,

                /** Populated once setup is complete */
                limits: WithId<LimitSchema>,
            }
        >
    };
    eventTypes?: { 
        [customEventTypeId: string]: Partial<
            WithId<EventTypeSchema>
            & Id 
            & { 
                customTroupeId: string,

                /** Populated once setup is complete */
                eventType: WithId<EventTypeSchema>,
            }
        > 
    };
    events?: { 
        [customEventId: string]: Partial<
            WithId<EventSchema>
            & Id 
            & {
                customTroupeId: string,
                customEventTypeId: string,

                /** Populated once setup is complete */
                event: WithId<EventSchema>,
            }
        >
    };
    members?: { 
        [customMemberId: string]: Partial<
            Omit<WithId<MemberSchema>, "properties" | "points">
            & Id 
            & { 
                customTroupeId: string,
                properties: Partial<BaseMemberProperties> & VariableMemberProperties,
                points: Partial<BaseMemberPoints> & VariableMemberPoints,
                customEventAttendedIds: string[],

                /** Uses custom event IDs as keys */
                eventsAttended: WithId<EventsAttendedBucketSchema>["events"],

                /** Populated once setup is complete */
                member: WithId<MemberSchema>,
            }
        >
    };
}

function generateRandomFieldToPropertyMap() {
    const map: FieldToPropertyMap = {};
    const properties = Object.keys(BASE_MEMBER_PROPERTY_TYPES);
    const numFields = Math.floor(Math.random() * properties.length);
    for(let i = 0; i < numFields; i++) {
        const index = Math.floor(Math.random() * properties.length);
        const field = "How much wood can a woodchuck chuck if a woodchuck could chuck would?";
        const property = properties.splice(index, 1)[0];
        map[new ObjectId().toHexString()] = { field, property, matcherId: null, override: false };
    }
    return map;
}

/** 
 * Populates an existing system setup config
 */
export function populateConfig(config: SystemSetupConfig, populateFieldToPropertyMap?: boolean) {
    config = {
        troupes: config.troupes || {},
        eventTypes: config.eventTypes || {},
        events: config.events || {},
        members: config.members || {},
    }
    const customTroupeIds = Object.keys(config.troupes!);

    // Create the troupe
    const testTroupes: WithId<TroupeSchema>[] = [];
    const testDashboards: WithId<TroupeDashboardSchema>[] = [];
    const testLimits: WithId<LimitSchema>[] = [];
    for(const customTroupeId in config.troupes) {
        const request = config.troupes[customTroupeId];
        request._id = new ObjectId();
        request.id = request._id.toHexString();

        const fieldMatchers: FieldMatcher[] = DEFAULT_MATCHERS;

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
            fieldMatchers,
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

        const newLimits: WithId<LimitSchema> = {
            _id: new ObjectId(),
            troupeId: request.id,
            hasInviteCode: true,
            ...INVITED_TROUPE_LIMIT,
        }

        request.troupe = newTroupe;
        request.dashboard = newDashboard;
        request.limits = newLimits;
        testTroupes.push(newTroupe);
        testDashboards.push(newDashboard);
        testLimits.push(newLimits);
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

        const baseFieldToPropertyMap = populateFieldToPropertyMap ? generateRandomFieldToPropertyMap() : {};

        const newEvent: WithId<EventSchema> = {
            _id: request._id,
            troupeId: troupe._id.toHexString(),
            lastUpdated: request.lastUpdated || new Date(),
            title: request.title || "Test Event - " + customEventId,
            source: request.source || "" as EventDataSource,
            synchronizedSource: request.synchronizedSource || "" as EventDataSource,
            sourceUri: request.sourceUri || "https://example.com/" + customEventId,
            synchronizedSourceUri: request.synchronizedSourceUri || "https://example.com/" + customEventId,
            startDate: request.startDate || new Date(),
            eventTypeId: eventType ? eventType._id.toHexString() : undefined,
            eventTypeTitle: eventType ? eventType.title : undefined,
            value: eventType ? eventType.value : request.value || Math.round(Math.random() * 25),
            fieldToPropertyMap: { ...baseFieldToPropertyMap, ...(request.fieldToPropertyMap || {}) },
            synchronizedFieldToPropertyMap: { ...baseFieldToPropertyMap, ...(request.synchronizedFieldToPropertyMap || {}) },
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

    return { testTroupes, testEvents, testAudience, testEventsAttended, testDashboards, testLimits };
}

/** Returns a console for the specified custom troupe ID from the config */
export function populateConfigAsOneConsole(config: SystemSetupConfig, customTroupeId: string, configPopulated = true, populateFieldToPropertyMap?: boolean): ConsoleData {
    if(!configPopulated) populateConfig(config, populateFieldToPropertyMap);

    const troupe = toTroupe(config.troupes![customTroupeId].troupe!, config.troupes![customTroupeId].id!);
    const dashboard = toTroupeDashboard(config.troupes![customTroupeId].dashboard!, config.troupes![customTroupeId].dashboard!._id.toHexString());
    const limits = toTroupeLimits(config.troupes![customTroupeId].limits!, config.troupes![customTroupeId].limits!._id.toHexString());

    const eventTypes: EventType[] = [];
    for(const customEventTypeId in config.eventTypes) {
        const { customTroupeId: ctid, eventType, id } = config.eventTypes[customEventTypeId];
        if(ctid == customTroupeId) {
            eventTypes.push(toEventType(eventType!, id!));
        }
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
        attendees,
        limits,
    };
}

export type ConfigToConsoleMap = { [customTroupeId: string]: ConsoleData };

/** Returns a map from custom troupe IDs to its corresponding console */
export function populateConfigAsConsoles(config: SystemSetupConfig, populateFieldToPropertyMap?: boolean): ConfigToConsoleMap {
    populateConfig(config, populateFieldToPropertyMap);
    
    const configToConsoleMap: ConfigToConsoleMap = {};
    for(const customTroupeId in config.troupes) {
        configToConsoleMap[customTroupeId] = populateConfigAsOneConsole(config, customTroupeId);
    }

    return configToConsoleMap;
}

export const defaultConfig: SystemSetupConfig = {
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
        "cool events": { value: 10, customTroupeId: "A" },
        "alright events": { value: 3, customTroupeId: "A" },
        "uncool events": { value: -7, customTroupeId: "A" },
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

export const noMembersConfig: SystemSetupConfig = {
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
        "cool events": { value: 10, customTroupeId: "A" },
        "alright events": { value: 3, customTroupeId: "A" },
        "uncool events": { value: -7, customTroupeId: "A" },
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

export const onlyEventTypesConfig: SystemSetupConfig = {
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
        "cool events": { 
            value: 10, 
            sourceFolderUris: [ "https://drive.google.com/drive/folders/1gQAhRgA7RzOPe_7YWdjniBiK8Q97yV8D" ],
            customTroupeId: "A",
        },
    },
}