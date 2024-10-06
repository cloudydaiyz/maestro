// Google Sheets event data source

import { WithId } from "mongodb";
import { EventSchema } from "../../types/core-types";
import { DataService } from "../../types/service-types";

export class GoogleSheetsDataService implements DataService {
    ready: Promise<void>;

    constructor() {
        this.ready = Promise.resolve();
    }
    
    async discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void> {

    };
}