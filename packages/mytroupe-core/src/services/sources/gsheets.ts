// Google Sheets event data source

import { WithId } from "mongodb";
import { EventSchema, TroupeSchema } from "../../types/core-types";
import { EventDataService, EventMap, MemberMap } from "../../types/service-types";
import { SHEETS_REGEX } from "../../util/constants";

export class GoogleSheetsEventDataService implements EventDataService {
    ready: Promise<void>;
    troupe: WithId<TroupeSchema>;
    events: EventMap;
    members: MemberMap;

    constructor(troupe: WithId<TroupeSchema>, events: EventMap, members: MemberMap) {
        this.troupe = troupe;
        this.events = events;
        this.members = members;
        this.ready = Promise.resolve();
    }

    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {
        const spreadsheetId = SHEETS_REGEX.exec(event.sourceUri)!.groups!["spreadsheetId"];
        
    };
}