import { Collection, MongoClient } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { EventSchema, GroupSchema, MemberSchema } from "./types/core-types";

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
    groupColl: Collection<GroupSchema>;
    memberColl: Collection<MemberSchema>;
    eventColl: Collection<EventSchema>;
    connection: Promise<MongoClient>;
    
    constructor() {
        this.client = new MongoClient(MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        this.groupColl = this.client.db(DB_NAME).collection("groups");
        this.memberColl = this.client.db(DB_NAME).collection("members");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.connection = this.client.connect();
    }
}