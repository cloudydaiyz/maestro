// Public facing types to use for API endpoints

import type { WithId } from "mongodb";
import type { EventSchema, EventTypeSchema, MemberPropertyValue, MemberSchema, TroupeSchema, VariableMemberPropertyTypes, VariablePointTypes, EventDataSource, BaseMemberPropertyTypes, MemberPropertyTypeToValue, TroupeDashboardSchema, AttendeeSchema } from "./core-types";
import type { Id, NullOptional, Replace, WeakPartial } from "./util-types";
import type { AxiosResponse } from "axios";

export const apiobj = {};

/** Converts T to a JSON serializable format */
export type ApiType<T> = NullOptional<Replace<T, string|boolean|number|null|undefined, string>>;

/** Defines the set of core functions used to interact with the API. */
export interface SpringplayCoreApi {

    /** Retrieves data for a user's console */
    getConsoleData(troupeId: string): Promise<ConsoleData | AxiosResponse<ConsoleData>>;

    /** Retrieves troupe dashboard */
    getDashboard(troupeId: string): Promise<TroupeDashboard | AxiosResponse<TroupeDashboard>>;

    /** Retrieves troupe or parses existing troupe into public format */ 
    getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe | AxiosResponse<Troupe>>;

    /**
     * Updates troupe and returns troupe in public format. 
     * 
     * Wait until next sync to:
     * - update properties of each member with the properties of the new origin event
     * - update the properties of members to have the correct type (in case they made a mistake)
     * - update the point types of members to have the correct type & amt of points*
     */
    updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<Troupe | AxiosResponse<Troupe>>;

    /** 
     * Creates and returns a new event in the given troupe. 
     * 
     * Wait until next sync to:
     * - Retrieve attendees and field information for the event
     */
    createEvent(troupeId: string, request: CreateEventRequest): Promise<PublicEvent | AxiosResponse<PublicEvent>>;

    /** Retrieves event or parses existing event into public format */ 
    getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent | AxiosResponse<PublicEvent>>;

    /** Retrieve all events in public format */ 
    getEvents(troupeId: string): Promise<PublicEvent[] | AxiosResponse<PublicEvent[]>>;

    /**
     * Update event in the given troupe and returns event in public format. If event has 
     * an event type but the user updates the value field, the event type for the event 
     * is removed. You cannot update with the event type and value fields at the same time.
     * 
     * Wait until next sync to:
     * - Update member properties for the event attendees
     * - Update the synchronized field to property mapping
     */
    updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<PublicEvent | AxiosResponse<PublicEvent>>;

    /**
     * Deletes an event in the given troupe. 
     * 
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for*
     */
    deleteEvent(troupeId: string, eventId: string): Promise<void | AxiosResponse<void>>;

    /**
     * Creates and returns a new event type in the given troupe. 
     * 
     * Wait until next sync to:
     * - Obtain the events from source folders for the event type
     */
    createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<EventType | AxiosResponse<EventType>>;

    /** Retrieves all event types in public format */
    getEventTypes(troupeId: string): Promise<EventType[] | AxiosResponse<EventType[]>>;

    /** 
     * Updates event type in the given troupe and returns event type in public format.
     * 
     * Wait until next sync to:
     * - Retrieve events and attendees from the updated source folder URIs
     */ 
    updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<EventType | AxiosResponse<EventType>>;

    /** Deletes an event type in the given troupe. */
    deleteEventType(troupeId: string, eventTypeId: string): Promise<void | AxiosResponse<void>>;

    /** Creates and returns a new member in the given troupe. */
    createMember(troupeId: string, request: CreateMemberRequest): Promise<Member | AxiosResponse<Member>>;

    /** Retrieve member in public format. */
    getMember(member: string | WithId<MemberSchema>, troupeId?: string): Promise<Member | AxiosResponse<Member>>;

    /** Retrieve member in public attendee format. */
    getAttendee(member: string | WithId<AttendeeSchema>, troupeId?: string): Promise<Attendee | AxiosResponse<Attendee>>;

    /** Retrieve all members in public format */ 
    getAudience(troupeId: string): Promise<Member[] | AxiosResponse<Member[]>>;

    /** Retrieve all members in public attendee format */ 
    getAttendees(troupeId: string): Promise<Attendee[] | AxiosResponse<Attendee[]>>;

    /** Update or delete (optional) properties for single member */
    updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<Member | AxiosResponse<Member>>;

    /** 
     * Deletes a member in the given troupe. Member may still be generated on sync; 
     * this removes the existing data associated with a member. 
     */
    deleteMember(troupeId: string, memberId: string): Promise<void | AxiosResponse<void>>;

    /** Places troupe into the sync queue if the sync lock is disabled. */
    initiateSync(troupeId: string): Promise<void | AxiosResponse<void>>;
}

/** Defines the set of functions used to authenticate with the API. */
export interface SpringplayAuthApi {

    /** Creates a new account with an associated troupe */
    register(username: string, email: string, password: string, troupeName: string): Promise<void | AxiosResponse<void>>;

    /** Creates a new user session and returns the associated access and refresh tokens */
    login(usernameOrEmail: string, password: string): Promise<Credentials | AxiosResponse<Credentials>>;

    /** Refreshes access credentials */
    refreshCredentials(refreshToken: string): Promise<Credentials | AxiosResponse<Credentials>>;

    /** Deletes the account & troupe associated with the account */
    deleteUser(usernameOrEmail: string, password: string): Promise<void | AxiosResponse<void>>;
}

// == Public Types ==

export type Troupe = ApiType<Omit<TroupeSchema, "eventTypes">> & Id;

export type PublicEvent = ApiType<EventSchema> & Id;

export type EventType = ApiType<EventTypeSchema> & Id;

export type Member = ApiType<MemberSchema> & Id;

export type Attendee = ApiType<Omit<AttendeeSchema, "eventsAttended">> & Id & { eventsAttended: string[] };

export type TroupeDashboard = ApiType<TroupeDashboardSchema> & Id;

export type ConsoleData = {
    dashboard: TroupeDashboard,
    troupe: Troupe,
    events: PublicEvent[],
    eventTypes: EventType[],
    attendees: Attendee[],
}

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

// == AUTH == //

export type RegisterRequest = {
    username: string,
    email: string,
    password: string,
    troupeName: string,
}

export type LoginRequest = {
    usernameOrEmail: string,
    password: string,
}

export type RefreshCredentialsRequest = {
    refreshToken: string,
}

export type DeleteUserRequest = {
    usernameOrEmail: string,
    password: string,
}

export type Credentials = { accessToken: string, refreshToken: string };

export type AccessTokenPayload = { 
    userId: string,
    troupeId: string,
    [troupeId: string]: number | string,
};

export type RefreshTokenPayload = {
    userId: string,
}

export interface AuthorizationHeader extends Record<string, any> {
    Authorization?: string,
    authorization?: string,
}