import { drive_v3, sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "./cloud/gcp";
import { EventSchema, EventTypeSchema, MemberSchema } from "./types/core-types";
import { MyTroupeService } from "./service";

export class MyTroupeLogRefreshService extends MyTroupeService {
    ready: Promise<void>;
    drive!: drive_v3.Drive;
    sheets!: sheets_v4.Sheets;
    input?: {};
    output?: {};

    constructor() {
        super();
        this.ready = this.init();
    }

    async init() {
        this.drive = await getDrive();
        this.sheets = await getSheets();
    }

    /**
     * - Doesn't delete events previously discovered, even if not found in parent
     *   event type folder
     * - Delete members that are no longer in the source folder & have no overridden properties
     */
    async refresh() {
        // this.discoverEvents();
        // this.updateAudience();
        // this.refreshLogSheet();
        // this.prepareDatabaseUpdate();
    }

    async discoverEvents(eventTypes: EventTypeSchema[], ignoreList: any[]) {
        // for each event type:
            // for each drive folder:
                // if the folder has already been discovered, perform tie breaker
                // otherwise, go through its children, mark them as discovered and associate with event type
                    // if the child is a folder, add it to the list of folders to explore
                    // for the event date, use the latest date in the file name, otherwise use the creation date
        
        // return the newly discovered events
    }

    async updateAudience(audience: MemberSchema[], events: EventSchema[]) {
        // go through event sign ups to discover audience, mark them as discovered, and update existing audience points
        // validate that new audience members have the required properties AFTER audience discovery from ALL events
            // drop invalid audience members
        
        // return the updated audience (updated points & new members)
    }

    private async discoverAudience(event: EventSchema) {
        // return audience members from event
    }

    async refreshLogSheet() {
        // get the current log sheet
        // obtain the new values for the sheet
        // calculate the diff & generate updates
        // execute update
    }

    // Populate local variables with information to update the database
    async prepareDatabaseUpdate() {
        // update audience members & events
        // update dashboard with statistics from event & audience update
    }
}