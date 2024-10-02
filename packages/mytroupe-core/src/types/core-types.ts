// Data schema for the core data types

import { ObjectId, WithId } from "mongodb";

export interface TroupeSchema {
    lastUpdated: Date,
    name: string,
    logSheetUri: string,
    /** Event that takes precedence during member property mapping */ 
    originEventId?: string, 
    /** Lock to prevent sync conflict */
    syncLock: boolean, 
    eventTypes: WithId<EventTypeSchema>[], // all event types for troupe (MAX: 10)
    /** Valid properties for members */
    memberProperties: BaseMemberProperties & VariableMemberProperties, 
    /** Valid point types for the troupe */
    pointTypes: BasePointTypes & VariablePointTypes, 
}

// Modifiers: ? = optional, ! = required
export type MemberPropertyType = "string?" | "string!" 
    | "number?" | "number!"
    | "boolean?" | "boolean!"
    | "date?" | "date!";

export type MemberPropertyValue = string | number | boolean | Date | null;

export interface BaseMemberProperties {
    "First Name": "string!",
    "Last Name": "string!",
    "Email": "string!",
    "Birthday": "date!",
}

export interface VariableMemberProperties {
    [key: string]: MemberPropertyType,
}

export interface PointData {
    startDate: Date,
    endDate: Date,
}

export interface BasePointTypes {
    "Total": PointData,
}

export interface VariablePointTypes {
    [key: string]: PointData,
}

export interface EventSchema {
    /** ID of the troupe the event belongs to */ 
    troupeId: string, 
    lastUpdated: Date,
    title: string,
    source: EventDataSource,
    /** Source URI of the data for the event. Must be a valid {@link EventDataSource}. */
    sourceUri: string,
    startDate: Date,
    endDate?: Date,
    typeId?: string,
    value: number,
    /** One-to-one mapping of form fields IDs to member properties. */ 
    fieldToPropertyMap: FieldToPropertyMap 
}

export type EventDataSource = "Google Forms" | "Google Sheets";

export interface FieldToPropertyMap {
    [fieldId: string]: {
        field: string,
        property: string | null,
    },
}

export interface EventTypeSchema {
    lastUpdated: Date, 
    title: string, 
    /** Points for the event type */
    value: number, 
    sourceFolderUris: string[];
}

export interface MemberSchema {
    troupeId: string,
    lastUpdated: Date,
    properties: { 
        [key: string]: {
            value: MemberPropertyValue,
            override: boolean,
        },
    },
    totalEventsAttended: number,
    points: {
        [key: string]: number,
    },
}

export interface EventsAttendedBucketSchema {
    memberId: string,
    lastUpdated: Date,
    eventsAttended: {
        eventId: string,
        startDate: Date,
        value: number,
    }[],
    page: number,
}

export interface TroupeDashboardSchema {
    troupeId: string,
    lastUpdated: Date,
    upcomingBirthdays: {
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