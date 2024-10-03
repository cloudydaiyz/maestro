import { drive_v3, sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "./cloud/gcp";
import { EventSchema, EventTypeSchema, MemberSchema } from "./types/core-types";
import { MyTroupeService } from "./service";
import { MyTroupeCore } from "./index";

export class MyTroupeSyncService extends MyTroupeCore {
    ready: Promise<void>;
    drive!: drive_v3.Drive;
    sheets!: sheets_v4.Sheets;
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
     * - NOTE: Populate local variables with synchronized information to update the database
     */
    async sync(troupeId: string): Promise<void> {
        return this.discoverEvents(troupeId)
            .then(this.discoverAndRefreshAudience)
            .then(this.persistSync)
            .then(this.refreshLogSheet);
    }

    async discoverEvents(troupeId: string): Promise<string> {
        // for each event type:
            // for each drive folder:
                // if the folder has already been discovered, perform tie breaker
                // otherwise, go through its children, mark them as discovered and associate with event type
                    // if the child is a folder, add it to the list of folders to explore
                    // for the event date, use the latest date in the file name, otherwise use the creation date
        
        const types = this.getTroupeSchema(troupeId);
        
        // save the newly discovered events
        return troupeId;
    }

    async discoverAndRefreshAudience(troupeId: string) {
        // go through event sign ups to discover audience, mark them as discovered, and update existing audience points
        // validate that new audience members have the required properties AFTER audience discovery from ALL events
            // drop invalid audience members
        
        // save the updated audience (updated points & new members)
        return troupeId;
    }

    private async discoverAudience(event: EventSchema) {
        // return audience members from event
    }

    async persistSync(troupeId: string) {
        // update audience members & events
        // update dashboard with statistics from event & audience update
        return troupeId;
    }

    async refreshLogSheet(troupeId: string) {
        // get the current log sheet
        // obtain the new values for the sheet
        // calculate the diff & generate updates
        // execute update
    }
}