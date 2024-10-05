import { WithId } from "mongodb";
import { Troupe } from "./api-types";
import { EventTypeSchema } from "./core-types";
import { WeakPartial } from "./util-types";

export type CreateTroupeRequest = Omit<
    Troupe, 
    "id" | "lastUpdated" | "syncLock" | "eventTypes" | "logSheetUri"
> & { email: string, password: string };

export type UserSchema = {
    troupeId: string,
    emails: string[],
    password: string,
}

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