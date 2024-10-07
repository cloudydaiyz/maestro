// Troupe log sheet in Google Sheets

import { WithId } from "mongodb";
import { TroupeSchema, EventSchema, MemberSchema, EventsAttendedBucketSchema } from "../../types/core-types";
import { TroupeLogService } from "../base-service";

export class GoogleSheetsLogService extends TroupeLogService {
    constructor() { super() }

    // Creating a new spreadsheet
    // Copy the file, move it to the appropriate folder and rename it
    // https://developers.google.com/drive/api/reference/rest/v3/files/copy

    // https://developers.google.com/drive/api/reference/rest/v3/files/update
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

    // Delete spreadsheet
    // https://developers.google.com/drive/api/reference/rest/v3/files/delete

    // Updating the spreadsheet
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

    // Get spreadsheet values (for validation)
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/get
    // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/batchGet

    initLog(troupe: WithId<TroupeSchema>): Promise<string> {
        throw new Error("Method not implemented.");
    }

    deleteLog(troupeId: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    
    protected updateLogHelper(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<MemberSchema>[], eventsAttendedSchema: WithId<EventsAttendedBucketSchema>[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
}