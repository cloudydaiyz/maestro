import { Collection, MongoClient } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { EventSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";

// To help catch and relay client-based errors
export class TrouperError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TrouperError";
    }
}

// Implementation for client-facing controller methods
class TrouperCore {
    client: MongoClient;
    troupeColl: Collection<TroupeSchema | TroupeDashboardSchema>;
    audienceColl: Collection<MemberSchema>;
    eventColl: Collection<EventSchema>;
    connection: Promise<MongoClient>;
    
    constructor() {
        this.client = new MongoClient(MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        this.troupeColl = this.client.db(DB_NAME).collection("troupes");
        this.audienceColl = this.client.db(DB_NAME).collection("audience");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.connection = this.client.connect();
    }

    async initiateRefresh() {

    }

    async getTroupe() {

    }

    // Update name, originEventId, memberProperties, or pointTypes
    // Can't make a member property required until there's at least 1 event that uses it
    async updateTroupe() {

    }

    // Update title, points, or sourceFolderUris
    // Triggers refresh on delete sourceFolderUri or create
    async updateEventType() {

    }

    // Pick whether to replace event type with another type, or assign points
    async deleteEventType() {

    }

    // Retrieve all members
    async getAudience() {

    }

    // Update property for single member
    async updateMemberProperty() {

    }

    // Delete a member
    async deleteMemberProperty() {

    }

    // Retrieve all events
    async getEvents() {

    }

    // Update title, sourceUri, timeline, type info, point info, or field to property mapping
    // Triggers refresh
    async updateEvent() {

    }

    // Triggers refresh
    async deleteEvent() {

    }
}

// Additional functionality for other backend services
class TrouperService extends TrouperCore {
    constructor() { super() }

    async refresh() {
        // event collection
        // point calculation
        // database update
            // delete members that are no longer in the source folder & have no overridden properties
        // sheet update
    }

    async createTroupe() {

    }

    async deleteTroupe() {

    }

    async resetTroupe() {

    }
}