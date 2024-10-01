// To use for API endpoints

import { BaseMemberProperties, BasePointTypes, MemberPropertyType, PointData, VariableMemberProperties, VariablePointTypes } from "./core-types";

export interface Troupe {
    id: string,
    lastUpdated: string, // last time the troupe was updated
    name: string, // name of the troupe
    logSheetUri: string, // Google Spreadsheet ID to post log data to
    originEventId?: string, // event that takes precedence during member property mapping
    refreshLock: boolean, // lock to prevent refreshing conflict
    eventTypes: EventType[], // all event types for troupe (MAX: 10)
    adminCode: string, // heightened permissions for troupe

    memberProperties: BaseMemberProperties & { // valid properties for members
        [key: string]: MemberPropertyType,
    },
    pointTypes: BasePointTypes & { // point types for troupe
        [key: string]: PointData,
    },
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
 */
export interface UpdateTroupeRequest {
    troupeId: string,
    name?: string,

    /**
     * If any of the following properties equals what the troupe already has, the
     * update will delete the field from the troupe
     * 
     * e.g. If originEventId = "A", and the provided update = "A", the originEventId
     * will be deleted from the troupe
     */
    originEventId?: string,
    memberProperties?: VariableMemberProperties,
    pointTypes?: VariablePointTypes,
}

/**
 * -`updated`: list of properties that were updated
 * 
 * -`removed`: list of properties that were removed
 */
export interface UpdateTroupeResponse {
    updated: string[],
    removed: string[],
}

/**
 * Updates an event type. Caveats:
 * 
 * - `title` and `points` are updated immediately. `points` are updated for the
 *   event type across all events and members.
 * - `sourceFolderUris` are updated immediately, but the data resulting from the
 *   update doesn't get changed until the next refresh.
 */
export interface UpdateEventTypeRequest {
    troupeId: string,
    eventTypeId: string,
    title?: string,
    points?: number,
    sourceFolderUris?: string[],
}