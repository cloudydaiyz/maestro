// Initialization for all services

import { Collection, MongoClient, WithId } from "mongodb";
import { EventsAttendedBucketSchema, EventSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "../util/env";
import { DB_NAME } from "../util/constants";

export class BaseService {
    client: MongoClient;
    connection: Promise<MongoClient>;
    troupeColl: Collection<TroupeSchema>;
    dashboardColl: Collection<TroupeDashboardSchema>;
    eventColl: Collection<EventSchema>;
    audienceColl: Collection<MemberSchema>;
    eventsAttendedColl: Collection<EventsAttendedBucketSchema>;
    
    constructor() {
        this.client = new MongoClient(MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        this.connection = this.client.connect();
        this.troupeColl = this.client.db(DB_NAME).collection("troupes");
        this.dashboardColl = this.client.db(DB_NAME).collection("dashboards");
        this.audienceColl = this.client.db(DB_NAME).collection("audience");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.eventsAttendedColl = this.client.db(DB_NAME).collection("eventsAttended");
    }
}

// Handles event/member data retrieval and synchronization from a data source
export interface EventDataService {
    ready: Promise<void>;
    discoverAudience: (event: WithId<EventSchema>, lastUpdated: Date) => Promise<void>;
}