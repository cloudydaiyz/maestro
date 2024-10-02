// Public facing types to use for API endpoints

import { ObjectId, WithId } from "mongodb";
import { EventSchema, EventTypeSchema, FieldToPropertyMap, MemberPropertyType, MemberPropertyValue, MemberSchema, TroupeSchema, VariableMemberProperties, VariablePointTypes, EventDataSource } from "./core-types";
import { Id, Replace } from "./util-types";

// == Public Types ==

export type Troupe = Replace<
    Omit<TroupeSchema, "eventTypes" | "_id" | "refreshLock">, 
    Date | ObjectId, 
    string
> & Id & { eventTypes: EventType[] }

export type Event = Replace<EventSchema, Date, string> & Id;

export type EventType = Replace<EventTypeSchema, Date, string> & Id;

export type Member = Replace<MemberSchema, Date, string> & Id;

// == API Request Types ==

/**
 * Update Troupe properties. Caveats:
 * - Cannot modify BaseMemberProperties or BasePointTypes. 
 * - Member properties cannot be required until there's at least 1 event that uses it.
 * - New member properties and point types for members get calculated on the next refresh
 * - Cannot have more than `MAX_MEMBER_PROPERTIES` member properties or `MAX_POINT_TYPES` 
 *   point types
 */
export type UpdateTroupeRequest = {
    troupeId: string,
    name?: string,
    /** Set as an empty string to remove. */ 
    originEventId?: string, 
    updateMemberProperties?: VariableMemberProperties,
    removeMemberProperties?: string[],
    updatePointTypes?: VariablePointTypes,
    removePointTypes?: string[],
}

/**
 * If manually added, event starts with empty field to property map and unvalidated
 * sourceUri (the URI is only checked to see whether it's a valid `DataSource`). During 
 * refresh, if the sourceUri is invalid, the event is deleted, and the field to property 
 * map is updated. User may only update the existing fields in the field to property map,
 * even if they know the ID of other fields in the source.
 */
export type CreateEventRequest = Omit<
    Event,
    "id" | "lastUpdated" | "fieldToPropertyMap" | "source"
>;

export type UpdateEventRequest = {
    troupeId: string,
    eventId: string,
    /** Must be non-empty. */
    title?: string,
    startDate?: string,
    /** Set as an empty string to remove. */ 
    endDate?: string, 
    /** Must be a valid {@link EventDataSource}. */
    sourceUri?: string,
    typeId?: string,
    value?: number,
    updateFields?: {
        [fieldId: string]: string,
    },
    /** Removes properties associated with fields */
    removeFields?: string[],
}

/**
 * Updates or creates a new event type. Caveats:
 * - `title` and `points` are updated immediately. `points` are updated for the
 *   event type across all events and members.
 * - `sourceFolderUris` are updated immediately, but the data resulting from the
 *   update doesn't get changed until the next refresh.
 */
export type UpdateEventTypeRequest = {
    troupeId: string,
    eventTypeId: string,
    title?: string,
    value?: number,
    addSourceFolderUris?: string[],
    deleteSourceFolderUris?: string[],
}

export type UpdateMemberRequest = {
    troupeId: string,
    memberId: string,
    updateProperties?: {
        [key: string]: Replace<MemberPropertyValue, Date, string>,
    }
    deleteProperties?: string[],
}