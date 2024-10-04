// Data schema for the core data types

import { ObjectId, WithId } from "mongodb";
import { BASE_MEMBER_PROPERTIES_OBJ, BASE_POINT_TYPES_OBJ, BIRTHDAY_UPDATE_FREQUENCIES, EVENT_DATA_SOURCES, FORMS_REGEX, MEMBER_PROPERTY_TYPES, SHEETS_REGEX } from "../util/constants";

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
export type BaseMemberProperties = typeof BASE_MEMBER_PROPERTIES_OBJ;
export type MemberPropertyType = typeof MEMBER_PROPERTY_TYPES[number];
export type MemberPropertyValue = string | number | boolean | Date | null;

export interface VariableMemberProperties {
    [key: string]: MemberPropertyType,
}

// Point types
export interface PointData {
    startDate: Date,
    endDate: Date,
}

export type BasePointTypes = typeof BASE_POINT_TYPES_OBJ

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

export type EventDataSource = typeof EVENT_DATA_SOURCES[number];

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

type BirthdayUpdateFrequency = typeof BIRTHDAY_UPDATE_FREQUENCIES[number];

export interface EventTypeStatistic {
    id: string,
    title: string,
    data: number,
}