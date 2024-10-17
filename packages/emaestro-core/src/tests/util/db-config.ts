import { WithId } from "mongodb";
import { BaseMemberPoints, BaseMemberProperties, BaseMemberPropertyTypes, BasePointTypes, EventSchema, EventTypeSchema, EventsAttendedBucketSchema, MemberSchema, TroupeSchema, VariableMemberPoints, VariableMemberProperties, VariableMemberPropertyTypes, VariablePointTypes } from "../../types/core-types";
import { Id } from "../../types/util-types";

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

export const noMembersConfig: DbSetupConfig = {
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

export const onlyEventTypesConfig: DbSetupConfig = {
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