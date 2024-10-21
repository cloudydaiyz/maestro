// Public facing types to use for API endpoints

import { ObjectId, WithId } from "mongodb";
import { EventSchema, EventTypeSchema, FieldToPropertyMap, MemberPropertyType, MemberPropertyValue, MemberSchema, TroupeSchema, VariableMemberPropertyTypes, VariablePointTypes, EventDataSource, VariableMemberProperties, BaseMemberPropertyTypes, MemberPropertyTypeToValue } from "./core-types";
import { Id, NullOptional, Replace, WeakPartial } from "./util-types";

/** Converts T to a JSON serializable format */
export type ApiType<T> = NullOptional<Replace<T, string|boolean|number|null|undefined, string>>;

// == Public Types ==

export type Troupe = ApiType<Omit<TroupeSchema, "eventTypes" | "syncLock">> & Id & { eventTypes: EventType[] }

export type PublicEvent = ApiType<EventSchema> & Id;

export type EventType = ApiType<EventTypeSchema> & Id;

export type Member = ApiType<MemberSchema> & Id;

// == API Request Types ==

/**
 * Update Troupe properties. Caveats:
 * - Cannot modify BaseMemberProperties or BasePointTypes. 
 * - Member properties cannot be required until there's at least 1 event that uses it.
 * - New member properties and point types for members get calculated on the next sync
 * - Cannot have more than `MAX_MEMBER_PROPERTIES` member properties or `MAX_POINT_TYPES` 
 *   point types
 */
export type UpdateTroupeRequest = ApiType<{
    name?: string,
    /** Set as an empty string to remove. */ 
    originEventId?: string, 
    updateMemberProperties?: VariableMemberPropertyTypes,
    removeMemberProperties?: string[],
    updatePointTypes?: VariablePointTypes,
    removePointTypes?: string[],
}>

/**
 * If manually added, event starts with empty field to property map and unvalidated
 * sourceUri (the URI is only checked to see whether it's a valid `DataSource`). During 
 * sync, if the sourceUri is invalid, the event is deleted, and the field to property 
 * map is updated. User may only update the existing fields in the field to property map,
 * even if they know the ID of other fields in the source.
 */
export type CreateEventRequest = ApiType<WeakPartial<
    Pick<
        PublicEvent,
        "title" | "sourceUri" | "startDate" | "eventTypeId" | "value"
    >, 
    "value"
>>;

/** Updates an event */
export type UpdateEventRequest = ApiType<{
    title?: string,
    startDate?: string,
    /** Must be a valid {@link EventDataSource}. */
    sourceUri?: string,
    eventTypeId?: string,
    value?: number,
    /** Updates properties associated with fields. Cannot create new entries. */
    updateProperties?: {
        [fieldId: string]: string,
    },
    /** Removes properties associated with fields */
    removeProperties?: string[],
}>;

/** Creates a new event type */
export type CreateEventTypeRequest = ApiType<Pick<
    EventType,
    "title" | "value" | "sourceFolderUris"
>>;

/**
 * Updates an event type. Caveats:
 * - `title` and `points` are updated immediately. `points` are updated for the
 *   event type across all events and members.
 * - `sourceFolderUris` are updated immediately, but the data resulting from the
 *   update doesn't get changed until the next sync.
 */
export type UpdateEventTypeRequest = ApiType<{
    title?: string,
    value?: number,
    addSourceFolderUris?: string[],
    removeSourceFolderUris?: string[],
}>;

/**
 * Creates a new member. All required member properties defined by the troupe must be set.
 */
export type CreateMemberRequest = ApiType<{
    properties: {
        [prop in keyof BaseMemberPropertyTypes]: MemberPropertyTypeToValue[BaseMemberPropertyTypes[prop]];
    } & {
        [prop: string]: MemberPropertyValue;
    }
}>;

export type CMR = ApiType<{
    properties: {
        [prop in keyof BaseMemberPropertyTypes]: MemberPropertyTypeToValue[BaseMemberPropertyTypes[prop]];
    } & {
        [prop: string]: MemberPropertyValue;
    }
}>;

/** Updates and/or removes member property values from member */
export type UpdateMemberRequest = ApiType<{
    updateProperties?: {
        [key: string]: NullOptional<{
            value?: MemberPropertyValue,
            override?: boolean,
        }>
    },
    removeProperties?: string[],
}>;