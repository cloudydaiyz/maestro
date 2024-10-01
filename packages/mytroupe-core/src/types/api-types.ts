// Public facing types to use for API endpoints

import { ObjectId } from "mongodb";
import { TroupeSchema, VariableMemberProperties, VariablePointTypes } from "./core-types";
import { Replace } from "./util-types";

export type ModifiedTroupeSchema = Replace<
    Omit<TroupeSchema, "eventTypes" | "_id">, 
    Date | ObjectId, 
    string
>;

export interface Troupe extends ModifiedTroupeSchema {
    id: string,
    eventTypes: EventType[], // all event types for troupe (MAX: 10)
}

export interface EventType {
    id: string, // unique ID for the event type
    lastUpdated: string, // last time the event type was updated
    title: string, // title of the event type
    value: number, // points for the event type
    sourceFolderUris: string[]; // URIs to the source folders for the event type
}

/**
 * Update Troupe properties. Caveats:
 * 
 * - Cannot modify BaseMemberProperties or BasePointTypes. 
 * 
 * - Member properties cannot be required until there's at least 1 event that uses it.
 * 
 * - New member properties and point types for members get calculated on the next refresh
 * 
 * - Cannot have more than `MAX_MEMBER_PROPERTIES` member properties
 * 
 * - Cannot have more than `MAX_POINT_TYPES` point types
 * 
 * Additionally, if any of the following properties equals what the troupe already has, 
 * the update will delete the field from the troupe: `originEventId`, `memberProperties`, 
 * `pointTypes`
 * 
 * e.g. If originEventId = "A", and the provided update = "A", the originEventId will be deleted 
 * from the troupe
 */
export interface UpdateTroupeRequest {
    troupeId: string,
    name?: string,
    originEventId?: string,
    memberProperties?: VariableMemberProperties,
    pointTypes?: VariablePointTypes,
}

export interface UpdateTroupeResponse {
    /** list of properties that were updated */
    updated: string[],
    /** list of properties that were removed  */
    removed: string[],
}

/**
 * Updates an event type. Caveats:
 * 
 * - `title` and `points` are updated immediately. `points` are updated for the
 *   event type across all events and members.
 * 
 * - `sourceFolderUris` are updated immediately, but the data resulting from the
 *   update doesn't get changed until the next refresh.
 * 
 * - If a field in `sourceFolderUris` equals what the event type already has, the
 *   field will be deleted from the event type.
 */
export interface UpdateEventTypeRequest {
    troupeId: string,
    eventTypeId: string,
    title?: string,
    points?: number,
    sourceFolderUris?: string[],
}

export interface UpdateEventTypeResponse {
    /** list of properties that were updated */
    updated: string[],
    /** list of properties that were removed  */
    removed: string[],

    /** list of added source folder uris */
    newUris: string[],
    /** list of removed source folder uris */
    removedUris: string[],
}