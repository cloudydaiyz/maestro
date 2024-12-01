// Data schema for the core data types, to be stored in the app's database

import type { WithId } from "mongodb";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, BIRTHDAY_UPDATE_FREQUENCIES, EVENT_DATA_SOURCES, MEMBER_PROPERTY_TYPES } from "../util/constants";
import type { Mutable } from "./util-types";

// == TROUPE ==

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
    memberPropertyTypes: BaseMemberPropertyTypes & VariableMemberPropertyTypes, 
    synchronizedMemberPropertyTypes: BaseMemberPropertyTypes & VariableMemberPropertyTypes,
    /** Valid point types for the troupe */
    pointTypes: BasePointTypes & VariablePointTypes, 
    synchronizedPointTypes: BasePointTypes & VariablePointTypes, 
    /** Field matchers for the troupe */
    fieldMatchers: FieldMatcher[],
}

// == MEMBER PROPERTY TYPES ==

// Modifiers: ? = optional, ! = required
export type MemberPropertyType = typeof MEMBER_PROPERTY_TYPES[number];
export type BaseMemberPropertyTypes = typeof BASE_MEMBER_PROPERTY_TYPES;
export interface VariableMemberPropertyTypes {
    [key: string]: MemberPropertyType,
}

// Base type for the MemberPropertyTypeToValue interface
export type MemberPropertyTypeToValueBase = {
    [key in typeof MEMBER_PROPERTY_TYPES[number]]: unknown
}

// Maps MemberPropertyType to its corresponding value type
export interface MemberPropertyTypeToValue extends MemberPropertyTypeToValueBase {
    "string?": string | null,
    "string!": string,
    "number?": number | null,
    "number!": number,
    "boolean?": boolean | null,
    "boolean!": boolean,
    "date?": Date | null,
    "date!": Date,
}

// Must not have a type of "unknown"
export type MemberPropertyValue = MemberPropertyTypeToValue[MemberPropertyType];

// == FIELD MATCHER ==

export interface FieldMatcher {
    /** Condition used to match */
    matchCondition: FieldMatcherCondition,
    /** Unique regex used with fields to confirm a match for this matcher */
    fieldExpression: string,
    /** Member property in the troupe that this matcher applies to */
    memberProperty: string,
    /** Filters applied to the field expression */
    filters: FieldMatcherFilter[],
    /** Unique number indicating the precedence this matcher has in the troupe */
    priority: number,
}

export type FieldMatcherCondition = "contains" | "exact";
export type FieldMatcherFilter = "nocase" /** | "trim" | "nowhite" */;

// == POINT TYPES ==

export type BasePointTypes = typeof BASE_POINT_TYPES_OBJ;

export interface VariablePointTypes {
    [key: string]: PointData,
}

export interface PointData {
    startDate: Date,
    endDate: Date,
}

export type BaseMemberPoints = Mutable<{ [key in keyof BasePointTypes]: number }>;
export type VariableMemberPoints = { [key: string]: number; };

// == EVENT ==

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
    eventTypeTitle?: string,
    value: number,
    /** One-to-one mapping of form fields IDs to member properties. */ 
    fieldToPropertyMap: FieldToPropertyMap,
    synchronizedFieldToPropertyMap: FieldToPropertyMap,
}

export type EventDataSource = typeof EVENT_DATA_SOURCES[number];

export interface FieldToPropertyMap {
    [fieldId: string | number]: {
        /** Form field data (e.g. the question being asked) */ 
        field: string, 
        /** See {@link BaseMemberProperties} and {@link VariableMemberProperties} */ 
        property: string | null, 
        /** ID of the associated FieldMatcher, if applicable */
        matcherId: number | null,
        /** Whether to prioritize this property during the field matching process, if available */
        override: boolean,
    },
}

// == EVENT TYPES ==

export interface EventTypeSchema {
    lastUpdated: Date, 
    title: string, 
    /** Points for the event type */
    value: number, 
    sourceFolderUris: string[],
    synchronizedSourceFolderUris: string[],
}

// == MEMBER ==

export interface MemberSchema {
    troupeId: string,
    lastUpdated: Date,
    /** Uses synchronized member properties */
    properties: BaseMemberProperties & VariableMemberProperties,
    points: BaseMemberPoints & VariableMemberPoints,
}

// Invariant: Members can attend an event at most once
export interface EventsAttendedBucketSchema {
    troupeId: string,
    memberId: string,
    events: {
        [eventId: string]: {
            typeId?: string,
            value: number,
            startDate: Date,
        },
    },
    page: number,
}

// Attendee = Member + Events Attended
export interface AttendeeSchema extends MemberSchema {
    eventsAttended: EventsAttendedBucketSchema["events"],
}

// Base type for the BaseMemberProperties interface
export type BaseMemberProperties = {
    [key in keyof typeof BASE_MEMBER_PROPERTY_TYPES]: {
        value: MemberPropertyTypeToValue[typeof BASE_MEMBER_PROPERTY_TYPES[key]],
        override: boolean,
    }
}

export type VariableMemberProperties = {
    [property: string]: {
        value: MemberPropertyValue,
        /** True if this property was manually overridden; this takes precedence
         *  over the origin event.  */
        override: boolean,
    },
}

// == DASHBOARD ==

export interface TroupeDashboardSchema {
    lastUpdated: Date,
    troupeId: string,

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
    totalAttendees: number,
    totalEvents: number,
    totalEventTypes: number,
    avgAttendeesPerEvent: number,

    totalAttendeesByEventType: ValueStatistics,
    totalEventsByEventType: ValueStatistics,
    avgAttendeesByEventType: ValueStatistics,
    attendeePercentageByEventType: PercentageStatistics,
    eventPercentageByEventType: PercentageStatistics,
}

type BirthdayUpdateFrequency = typeof BIRTHDAY_UPDATE_FREQUENCIES[number];

export interface ValueStatistics {
    [id: string]: {
        title: string,
        value: number,
    },
}

export interface PercentageStatistics {
    [id: string]: {
        title: string,
        value: number,
        percent: number,
    }
}

// == USERS ==

export interface UserSchema {
    username: string,
    email: string,
    hashedPassword: string,
    troupeId: string,
    troupeAccess: {
        troupeId: string,
        accessLevel: number,
    }[],
    createdAt: Date,
}

// == INVITE CODES ==

export interface InviteCodeSchema {
    inviteCodes: string[],
    usedInviteCodes: {
        [troupeId: string]: string,
    },
}

// == LIMITS ==

export type LimitCollectionSchema = GlobalLimitSchema | LimitSchema;

export interface GlobalLimitSchema {
    docType: "globalLimit",
    uninvitedUsersLeft: number,
}

export type GlobalLimit = Omit<GlobalLimitSchema, "docType">;

export interface LimitSchema {
    docType: "troupeLimit",
    troupeId: string,
    hasInviteCode: boolean,

    modifyOperationsLeft: number,
    manualSyncsLeft: number,

    memberPropertyTypesLeft: number,
    pointTypesLeft: number,
    fieldMatchersLeft: number,

    eventTypesLeft: number,
    sourceFolderUrisLeft: number,

    eventsLeft: number,
    membersLeft: number,
}

export type TroupeLimit = Omit<LimitSchema, "docType"|"troupeId"|"hasInviteCode">;