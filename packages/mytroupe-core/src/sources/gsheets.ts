// Google Sheets event data source

import { DataService } from "../types/service-types";

export class GoogleSheetsDataService implements DataService {
    retrieveFormData(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    synchronizeFieldToPropertyMap(): void {
        throw new Error("Method not implemented.");
    }
    retrieveResponses(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    synchronizeMembers(): void {
        throw new Error("Method not implemented.");
    }
}