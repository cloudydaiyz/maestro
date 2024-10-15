import { WithId } from "mongodb";
import { Troupe } from "./api-types";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberSchema } from "./core-types";
import { WeakPartial } from "./util-types";

export type CreateTroupeRequest = Pick<
    Troupe,
    "name"
>;

// Additional statistics for the event type to help with tie breaking
type TieBreakerStatistics = Partial<{
    totalFiles: number,
}>;

export type DiscoveryEventType = WithId<EventTypeSchema> & TieBreakerStatistics;

// Maps folder IDs to the event type they were discovered for
export type FolderToEventTypeMap = { [folderId: string]: DiscoveryEventType };

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
    }
}

export interface AttendeeDataMap { 
    [memberId: string]: {
        member: WithId<MemberSchema>,
        eventsAttended: (EventsAttendedBucketSchema["events"][string] & { eventId: string })[],
        eventsAttendedDocs: WithId<EventsAttendedBucketSchema>[],
        delete: boolean,
        fromColl: boolean
    }
}