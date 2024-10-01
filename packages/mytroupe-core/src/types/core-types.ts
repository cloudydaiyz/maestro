// Data schema for the core data types

import { ObjectId, WithId } from "mongodb";

export interface TroupeSchema {
    lastUpdated: Date, // last time the troupe was updated
    name: string, // name of the troupe
    logSheetUri: string, // Google Spreadsheet ID to post log data to
    originEventId?: string, // event that takes precedence during member property mapping
    refreshLock: boolean, // lock to prevent refreshing conflict
    eventTypes: WithId<EventTypeSchema>[], // all event types for troupe (MAX: 10)
    adminCode: string, // heightened permissions for troupe

    memberProperties: BaseMemberProperties & VariableMemberProperties, // valid properties for members
    pointTypes: BasePointTypes & VariablePointTypes, // point types for troupe
}

type Troupe2 = TroupeSchema[keyof TroupeSchema];

// Modifiers: ? = optional, ! = required
export type MemberPropertyType = "string?" | "string!" 
    | "number?" | "number!"
    | "boolean?" | "boolean!"
    | "date?" | "date!";

export interface PointData {
    startDate: Date,
    endDate: Date,
}

export interface BaseMemberProperties {
    "First Name": "string!",
    "Last Name": "string!",
    "Email": "string!",
    "Birthday": "date!",
}

export interface VariableMemberProperties {
    [key: string]: MemberPropertyType,
}

export interface BasePointTypes {
    "Total": PointData,
}

export interface VariablePointTypes {
    [key: string]: PointData,
}

export interface EventTypeSchema {
    lastUpdated: Date, // last time the event type was updated
    title: string, // title of the event type
    value: number, // points for the event type
    sourceFolderUris: string[]; // URIs to the source folders for the event type
}

export interface EventSchema {
    troupeId: string, // ID of the troupe the event belongs to
    lastUpdated: Date, // last time the event was updated
    title: string, // name of the event
    sourceUri?: string, // source URI of the data for the event (Google Forms / Google Sheets)
    timeline: { // start and end date of the event
        startDate: Date,
        endDate?: Date,
    },

    // calculate value associated with the event, optionally associated with event type
    typeId?: string,
    value: number,

    fieldToPropertyMapping: { // mapping of form fields to member properties
        [fieldId: string]: string,
    },
}

export interface MemberSchema {
    troupeId: string, // ID of the troupe the member belongs to
    lastUpdated: Date, // last time the member was updated
    properties: { // member properties
        [key: string]: {
            value: string | number | boolean | Date | null,
            override: boolean, // whether or not the value was manually overridden
        },
    },
    totalEventsAttended: number,
    points: { // points for each type specified in the troupe schema
        [key: string]: number,
    },
}

export interface EventsAttendedBucketSchema {
    memberId: string, // ID of the member the bucket belongs to
    lastUpdated: Date, // last time the bucket was updated
    eventsAttended: {
        eventId: string,
        startDate: Date,
        value: number,
    }[],
    page: number,
}

export interface TroupeDashboardSchema {
    troupeId: string, // ID of the troupe the dashboard belongs to
    lastUpdated: Date, // last time the dashboard was updated
    upcomingBirthdays: { // upcoming birthdays
        frequency: BirthdayUpdateFrequency,
        desiredFrequency: BirthdayUpdateFrequency,
        members: {
            id: string,
            firstName: string,
            lastName: string,
            birthday: Date,
        }[],
    },
    totalMembers: number,
    totalEvents: number,
    avgPointsPerEvent: number,
    avgAttendeesPerEvent: number,
    avgAttendeesPerEventType: EventTypeStatistic[],
    attendeePercentageByEventType: EventTypeStatistic[],
    eventPercentageByEventType: EventTypeStatistic[],
}

type BirthdayUpdateFrequency = "weekly" | "monthly";

export interface EventTypeStatistic {
    id: string,
    title: string,
    data: number,
}