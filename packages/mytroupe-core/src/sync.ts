import { drive_v3, sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "./cloud/gcp";
import { EventMimeTypes, EventSchema, EventTypeSchema, MemberSchema } from "./types/core-types";
import { MyTroupeService } from "./service";
import { MyTroupeCore } from "./index";
import assert from "assert";
import { DRIVE_FOLDER_MIME, DRIVE_FOLDER_REGEX, DRIVE_FOLDER_URL_TEMPL } from "./util/constants";
import { WithId } from "mongodb";
import { getUrl } from "./util/helper";

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
        const troupe = await this.getTroupeSchema(troupeId);
        assert(!troupe.syncLock, "Troupe is already being synced");

        // Lock the troupe
        const updateResult1 = await this.troupeColl.updateOne(
            { troupeId },
            { $set: { syncLock: true } }
        );
        assert(updateResult1.modifiedCount === 1, "Failed to lock troupe for sync");

        // Perform sync
        await this.discoverEvents(troupeId)
            .then(this.discoverAndRefreshAudience)
            .then(this.persistSync)
            .then(this.refreshLogSheet);
        
        // Unlock the troupe
        const updateResult2 = await this.troupeColl.updateOne(
            { troupeId },
            { $set: { syncLock: false } }
        );
        assert(updateResult2.modifiedCount === 1, "Failed to unlock troupe after sync");
    }

     // for each event type:
        // for each drive folder:
            // if the folder has already been discovered, perform tie breaker
            // otherwise, go through its children, mark them as discovered and associate with event type
                // if the child is a folder, add it to the list of folders to explore
                // for the event date, use the latest date in the file name, otherwise use the creation date
    async discoverEvents(troupeId: string): Promise<string> {
        const troupe = await this.getTroupeSchema(troupeId);

        const events: { [sourceUri: string]: WithId<EventSchema> } = {};
        for await(const event of this.eventColl.find({ troupeId })) {
            events[event.sourceUri] = event;
        }

        // Populate the array with the IDs of all the event type folders for this troupe
        let foldersToExplore: string[] = [];
        for(const eventType of troupe.eventTypes) {
            foldersToExplore.concat(
                eventType.sourceFolderUris.map(uri => 
                    DRIVE_FOLDER_REGEX.exec(uri)!.groups!["folderId"]
                )
            );
        }

        const mimeQuery: string[] = [];
        for(const mimeType of EventMimeTypes) {
            mimeQuery.push(`mimeType = '${mimeType}'`);
        }

        const discoveredFolders: string[] = [];
        const readPromises: Promise<void>[] = [];
        while(foldersToExplore.length > 0) {
            const folderId = foldersToExplore.pop()!;
            if(discoveredFolders.includes(folderId)) continue;
            discoveredFolders.push(folderId);

            // Get the folder's children
            let q = `(${mimeQuery.join(" or ")}) and '${folderId}' in parents`;
            const response = await this.drive.files.list(
                { q, fields: "files(id, name, mimeType)", }
            );

            // Go through the files in the Google Drive folders
            const files = response.data.files;
            if(files && files.length) {
                for(const file of files) {
                    if(file.mimeType === DRIVE_FOLDER_MIME) {
                        foldersToExplore.push(getUrl(DRIVE_FOLDER_URL_TEMPL, file.id!));
                    } else if(file.mimeType === EventMimeTypes[0]) {
                        // readGoogleForm(file.name!, file.id!);
                    } else if(file.mimeType === EventMimeTypes[1]) {
                        // readGoogleSheet(file.name!, file.id!);
                    }
                }
            }
        }
        await Promise.all(readPromises);

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