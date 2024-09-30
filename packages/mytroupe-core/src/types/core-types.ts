// Data schema for the core data types

import { ObjectId } from "mongodb";

export interface TroupeSchema {
    _id: ObjectId,
    lastUpdated: Date, // last time the troupe was updated
    name: string, // name of the troupe
    logSheetUri: string, // spreadsheet URI to post log data to
    originEventId?: string, // event that takes precedence during member property mapping
    refreshLock: boolean, // lock to prevent refreshing conflict
    eventTypes: EventTypeSchema[], // all event types for troupe (MAX: 10)
    adminCode: string, // heightened permissions for troupe

    memberProperties: BaseMemberProperties & { // valid properties for members
        [key: string]: MemberPropertyType,
    },
    pointTypes: BasePointTypes & { // point types for troupe
        [key: string]: PointData,
    },

    // == FUTURE ==
    // demo: boolean, // whether or not this troupe is being used in a demo
    // demoActionsLeft: number, // number of demo actions left
}

// Modifiers: ? = optional, ! = required
type MemberPropertyType = "string?" | "string!" 
    | "number?" | "number!"
    | "boolean?" | "boolean!"
    | "date?" | "date!";

export interface PointData {
    startDate: Date,
    endDate: Date,
}

export interface BaseMemberProperties {
    "First Name": "string!",
    "Middle Name": "string?",
    "Last Name": "string!",
    "Member ID": "string!",
    "Email": "string!",
    "Birthday": "date!",
}

export interface BasePointTypes {
    "Total": PointData,
}

export interface EventTypeSchema {
    _id: ObjectId, // unique ID for the event type
    lastUpdated: Date, // last time the event type was updated
    title: string, // title of the event type
    points: number, // points for the event type
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

    // oneof type or points to calculate value associated with the event
    typeId?: string,
    typePoints?: number,
    points?: number,

    fieldToPropertyMapping: { // mapping of form fields to member properties
        [fieldId: string]: string,
    },
}

export interface MemberSchema {
    _id: ObjectId,
    troupeId: string, // ID of the troupe the member belongs to
    lastUpdated: Date, // last time the member was updated
    properties: { // member properties
        [key: string]: {
            value: string | number | boolean | Date,
            override: boolean, // whether or not the value was manually overridden
        },
    },
    eventsAttended: { // event IDs
        eventId: string,
        points: number,
    }[],
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
        points: number,
    }[],
    page: number,
}

export interface TroupeDashboardSchema {
    troupeId: string, // ID of the troupe the dashboard belongs to
    lastUpdated: Date, // last time the dashboard was updated
    nextMonthsBirthdays: { // upcoming birthdays
        frequency: BirthdayUpdateFrequency,
        desiredFrequency: BirthdayUpdateFrequency,
        members: {
            id: string,
            firstName: string,
            lastName: string,
            data: number,
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

type BirthdayUpdateFrequency = "daily" | "weekly" | "monthly";

export interface EventTypeStatistic {
    id: string,
    title: string,
    data: number,
}