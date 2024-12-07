import type { WithId } from "mongodb";
import type { Troupe } from "./api-types";
import type { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, GlobalLimit, MemberSchema, TroupeLimit } from "./core-types";

// Additional API request types

/** Creates a new Troupe. All troupes start off the same and are initialized upon user creation. */
export type CreateTroupeRequest = Pick<
    Troupe,
    "name"
>;

/** Used by the sync service to queue a troupe for sync */
export type SyncRequest = {
    troupeId: string
};

/** Used by the scheduled task service to perform a specific task on a regular interval */
export type ScheduledTaskRequest = {
    taskType: "sync"
}

// Other service types

/** Event type with additional statistics for the event type to help with tie breaking */
export type DiscoveryEventType = WithId<EventTypeSchema> & TieBreakerStatistics;

/** Additional statistics for the event type to help with tie breaking */
type TieBreakerStatistics = {
    totalFiles: number,
};

/** Maps folder IDs to the event type they were discovered for */ 
export type FolderToEventTypeMap = { 
    [folderId: string]: DiscoveryEventType 
};

export type GoogleFormsQuestionToTypeMap = {
    [questionId: string]: {
        string?: true,
        number?: true,
        date?: true,
        boolean?: {
            true: string | number,
            false: string | number,
        },
    }
};

export type GoogleSheetsQuestionToTypeMap = {
    [column: number]: {
        string?: true,
        number?: true,
        date?: true,
    }
}

export interface EventDataMap { 
    [sourceUri: string]: {
        event: WithId<EventSchema>,
        delete: boolean,
        fromColl: boolean,
    },
}

export interface AttendeeDataMap { 
    [memberId: string]: {
        member: WithId<MemberSchema>,
        eventsAttended: EventsAttendedList,
        eventsAttendedDocs: WithId<EventsAttendedBucketSchema>[],
        delete: boolean,
        fromColl: boolean
    }
}
export type EventsAttendedList = (EventsAttendedBucketSchema["events"][string] & { eventId: string })[];

export type GlobalLimitSpecifier = Partial<Record<keyof GlobalLimit, number>>;
export type TroupeLimitSpecifier = Partial<Record<keyof TroupeLimit, number>>;
export type LimitContext = { [troupeId: string]: number };