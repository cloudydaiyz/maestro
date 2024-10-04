import { drive_v3, sheets_v4 } from "googleapis";
import { getDrive, getSheets } from "./cloud/gcp";
import { EventDataSource, EventSchema, EventTypeSchema, MemberSchema, TroupeSchema } from "./types/core-types";
import { MyTroupeService } from "./service";
import { MyTroupeCore } from "./index";
import assert from "assert";
import { DRIVE_FOLDER_MIME, DRIVE_FOLDER_REGEX, DRIVE_FOLDER_URL_TEMPL, EVENT_MIME_TYPES, FORMS_URL_TEMPL, MIME_QUERY, SHEETS_URL_TEMPL } from "./util/constants";
import { ObjectId, WithId } from "mongodb";
import { getUrl } from "./util/helper";
import { DiscoveryEventType, FolderToEventTypeMap, ReverseDiscoveryEventType } from "./types/service-types";

export class MyTroupeSyncService extends MyTroupeCore {
    ready: Promise<void>;
    drive!: drive_v3.Drive;
    sheets!: sheets_v4.Sheets;

    // Output variables
    troupe: WithId<TroupeSchema> | null;
    events: { [sourceUri: string]: WithId<EventSchema> };

    constructor() {
        super();
        this.troupe = null;
        this.events = {};
        this.ready = this.init();
    }

    async init() {
        this.drive = await getDrive();
        this.sheets = await getSheets();
    }

    /**
     * Synchronize the troupe with all of its source uris for events and event types, then
     * updates the audience and log sheet with the new information.
     * - Doesn't delete events previously discovered, even if not found in parent
     *   event type folder
     * - Delete members that are no longer in the source folder & have no overridden properties
     * - NOTE: Populate local variables with synchronized information to update the database
     */
    async sync(troupeId: string): Promise<void> {
        assert(!(await this.getTroupeSchema(troupeId)).syncLock, 
            "Troupe is already being synced");

        // Lock the troupe
        this.troupe = await this.troupeColl.findOneAndUpdate(
            { troupeId },
            { $set: { syncLock: true } },
            { returnDocument: "after" }
        );
        assert(this.troupe, "Failed to lock troupe for sync");

        // Perform sync
        await this.discoverEvents()
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

    /** Discovers events found from the given event types in the troupe */
    async discoverEvents(): Promise<void> {
        assert(this.troupe, "Troupe not set");
        const troupeId = this.troupe!._id.toHexString();

        for await(const event of this.eventColl.find({ troupeId })) {
            event.synchronizedSource = event.source;
            event.synchronizedSourceUri = event.sourceUri;
            event.synchronizedFieldToPropertyMap = event.fieldToPropertyMap;
            this.events[event.sourceUri] = event;
        }

        // To help with tie breaking, keep track of the folders that have been discovered
        const folderToEventTypeMap: FolderToEventTypeMap = {};

        // Populate the array with the IDs of all the event type folders for this troupe
        const foldersToExplore: string[] = [];
        for(const eventType of this.troupe.eventTypes) {
            const discoveryEventType = { ...eventType, totalFiles: 0 };

            for(const folder in eventType.sourceFolderUris) {
                const folderId = DRIVE_FOLDER_REGEX.exec(folder)!.groups!["folderId"];
                const winningEventType = this.performEventTypeTieBreaker(
                    folderToEventTypeMap, folderId, discoveryEventType
                );

                // Update the winning event type and add the folder to the list of folders to explore
                winningEventType.totalFiles += 1;
                folderToEventTypeMap[folderId] = winningEventType;
                foldersToExplore.push(folderId);
            }
        }

        const discoveredFolders: string[] = [];
        while(foldersToExplore.length > 0) {
            const folderId = foldersToExplore.pop()!;
            let winningEventType = folderToEventTypeMap[folderId];

            if(discoveredFolders.includes(folderId)) continue;
            discoveredFolders.push(folderId);

            // Get the folder's children
            let q = `(${MIME_QUERY.join(" or ")}) and '${folderId}' in parents`;
            const response = await this.drive.files.list(
                { q, fields: "files(id, name, mimeType)", }
            );

            // Go through the files in the Google Drive folders
            const files = response.data.files;
            if(files && files.length) {
                for(const file of files) {
                    let source: EventDataSource = "";
                    let sourceUri = "";

                    if(file.mimeType === DRIVE_FOLDER_MIME) {
                        winningEventType = this.performEventTypeTieBreaker(
                            folderToEventTypeMap, folderId, folderToEventTypeMap[folderId]
                        );

                        // Update the winning event type and add the folder to the list of folders to explore
                        winningEventType.totalFiles += 1;
                        folderToEventTypeMap[folderId] = winningEventType;
                        foldersToExplore.push(folderId);
                        continue;
                    } else if(file.mimeType === EVENT_MIME_TYPES[0]) {
                        source = "Google Forms";
                        sourceUri = getUrl(FORMS_URL_TEMPL, file.id!);
                    } else if(file.mimeType === EVENT_MIME_TYPES[1]) {
                        source = "Google Sheets";
                        sourceUri = getUrl(SHEETS_URL_TEMPL, file.id!);
                    } else {
                        continue;
                    }

                    // Convert the winning event type to a regular event type
                    const eventType: ReverseDiscoveryEventType = winningEventType;
                    delete eventType.totalFiles;

                    // Add the event to the collection of events if it's not already added
                    if(sourceUri in this.events) {
                        const event: WithId<EventSchema> = {
                            _id: new ObjectId(),
                            troupeId,
                            lastUpdated: new Date(),
                            title: file.name!,
                            source,
                            synchronizedSource: source,
                            sourceUri,
                            synchronizedSourceUri: sourceUri,
                            startDate: file.createdTime
                                ? new Date(file.createdTime)
                                : new Date(),
                            value: 0,
                            eventTypeId: eventType._id.toHexString(),
                            fieldToPropertyMap: {},
                            synchronizedFieldToPropertyMap: {},
                        };
                        this.events[sourceUri] = event;
                    } else {
                        const event = this.events[sourceUri];
                        if(!event.eventTypeId) {
                            event.eventTypeId = eventType._id.toHexString();
                            event.value = winningEventType.value;
                        }
                    }
                }
            }
        }
    }

    protected performEventTypeTieBreaker(map: FolderToEventTypeMap, folderId: string, 
        eventType: DiscoveryEventType): DiscoveryEventType {
        const existingEventType = map[folderId];
        return !existingEventType
            ? eventType
            : existingEventType.totalFiles < eventType.totalFiles
            ? existingEventType
            : eventType;
    }

    async discoverAndRefreshAudience() {
        // go through event sign ups to discover audience, mark them as discovered, and update existing audience points
        // validate that new audience members have the required properties AFTER audience discovery from ALL events
            // drop invalid audience members
        
        // save the updated audience (updated points & new members)
    }

    private async discoverAudience(event: EventSchema) {
        // return audience members from event
    }

    async persistSync() {
        // update audience members & events
        // update dashboard with statistics from event & audience update

        // $documents stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/documents/
        // $out stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/out/ 
    }

    async refreshLogSheet() {
        // get the current log sheet
        // obtain the new values for the sheet
        // calculate the diff & generate updates
        // execute update
    }
}