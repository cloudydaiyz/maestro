// Data schema for the core data types

import { ObjectId, WithId } from "mongodb";
import { FORMS_REGEX, SHEETS_REGEX } from "../util/constants";

// Troupe
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
    synchronizedMemberProperties: BaseMemberProperties & VariableMemberProperties,
    /** Valid point types for the troupe */
    pointTypes: BasePointTypes & VariablePointTypes, 
    synchronizedPointTypes: BasePointTypes & VariablePointTypes, 
}

// Member property types
// Modifiers: ? = optional, ! = required
export const MemberPropertyTypes = [
    "string?", "string!", 
    "number?", "number!", 
    "boolean?", "boolean!", 
    "date?", "date!"
] as const;
export type MemberPropertyType = typeof MemberPropertyTypes[number];
export type MemberPropertyValue = string | number | boolean | Date | null;

export const BaseMemberPropertiesObj = {
    "First Name": "string!",
    "Last Name": "string!",
    "Email": "string!",
    "Birthday": "date!",
} as const;
export type BaseMemberProperties = typeof BaseMemberPropertiesObj;

export interface VariableMemberProperties {
    [key: string]: MemberPropertyType,
}

// Point types
export interface PointData {
    startDate: Date,
    endDate: Date,
}

export const BasePointTypesObj = {
    "Total": {
        startDate: new Date(0),
        endDate: new Date(3000000000000),
    } as PointData,
} as const;
export type BasePointTypes = typeof BasePointTypesObj

export interface VariablePointTypes {
    [key: string]: PointData,
}

// Event
export interface EventSchema {
    /** ID of the troupe the event belongs to */ 
    troupeId: string, 
    lastUpdated: Date,
    title: string,
    source: EventDataSource,
    synchronizedSource: EventDataSource,
    /** Source URI of the data for the event. Must be a valid {@link EventDataSource}. */
    sourceUri: string,
    synchronizedSourceUri: string,
    startDate: Date,
    eventTypeId?: string,
    value: number,
    /** One-to-one mapping of form fields IDs to member properties. */ 
    fieldToPropertyMap: FieldToPropertyMap,
    synchronizedFieldToPropertyMap: FieldToPropertyMap,
}

export const EventDataSourcesRegex = [FORMS_REGEX, SHEETS_REGEX] as const;
export const EventDataSources = ["Google Forms", "Google Sheets", ""] as const;
export const EventMimeTypes = ["application/vnd.google-apps.form", "application/vnd.google-apps.spreadsheet"] as const;
export type EventDataSource = typeof EventDataSources[number];

export interface FieldToPropertyMap {
    [fieldId: string]: {
        /** Form field data (e.g. the question being asked) */ 
        field: string, 
        /** Member Property */ 
        property: string | null, 
    },
}

// Invariant: Members can attend an event at most once
export interface EventsAttendedBucketSchema {
    troupeId: string,
    memberId: string,
    events: {
        [eventId: string]: {
            value: number,
            startDate: Date,
        }
    },
    page: number,
}

// Event type
export interface EventTypeSchema {
    lastUpdated: Date, 
    title: string, 
    /** Points for the event type */
    value: number, 
    sourceFolderUris: string[],
    synchronizedSourceFolderUris: string[],
}

// Member
export interface MemberSchema {
    troupeId: string,
    lastUpdated: Date,
    /** Uses synchronized member properties */
    properties: MemberProperties,
    points: BaseMemberPoints & VariableMemberPoints,
}
export type BaseMemberPoints = { [key in keyof BasePointTypes]: number };
export type VariableMemberPoints = { [key: string]: number; };

export type MemberProperties = {
    [key: string]: {
        value: MemberPropertyValue,
        /** True if this property was manually overridden; this takes precedence
         *  over the origin event.  */
        override: boolean,
    },
}

// Dashboard
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

const BirthdayUpdateFrequencies = ["weekly", "monthly"] as const;
type BirthdayUpdateFrequency = typeof BirthdayUpdateFrequencies[number];

export interface EventTypeStatistic {
    id: string,
    title: string,
    data: number,
}