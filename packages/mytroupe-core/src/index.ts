import { Collection, MongoClient, ObjectId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME } from "./util/constants";
import { EventSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import assert from "assert";
import { CreateTroupeSchema } from "./types/api-types";
import { initTroupeSheet } from "./cloud/gcp";

// To help catch and relay client-based errors
export class MyTroupeClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MyTroupeClientError";
    }
}

// Implementation for client-facing controller methods
export class MyTroupeCore {
    client: MongoClient;
    troupeColl: Collection<TroupeSchema>;
    dashboardColl: Collection<TroupeDashboardSchema>;
    audienceColl: Collection<MemberSchema>;
    eventColl: Collection<EventSchema>;
    connection: Promise<MongoClient>;
    
    constructor() {
        this.client = new MongoClient(MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        this.troupeColl = this.client.db(DB_NAME).collection("troupes");
        this.dashboardColl = this.client.db(DB_NAME).collection("dashboards");
        this.audienceColl = this.client.db(DB_NAME).collection("audience");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.connection = this.client.connect();
    }

    // Turns on refresh lock and places troupe into the refresh queue if the lock is disabled
    async initiateRefresh(troupeId: string) {

    }

    // Retrieves the current state of the troupe
    async getTroupe(troupeId: string) {

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
    async deleteEventType(troupeId: string) {

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

    protected hello() {
        console.log("Hello");
    }
}

// Additional functionality for other backend services
export class MyTroupeService extends MyTroupeCore {
    constructor() { super() }

    async refresh() {
        // event collection
        // point calculation
        // database update
            // delete members that are no longer in the source folder & have no overridden properties
        // sheet update
    }

    async createTroupe(req: CreateTroupeSchema) {
        const logSheetUri = await initTroupeSheet();

        return this.client
            .startSession()
            .withTransaction(async () => {
                const lastUpdated = new Date();
                const troupe = await this.troupeColl.insertOne({
                    ...req,
                    logSheetUri,
                    lastUpdated,
                    eventTypes: [],
                    memberProperties: {
                        "First Name": "string!",
                        "Middle Name": "string?",
                        "Last Name": "string!",
                        "Member ID": "string!",
                        "Email": "string!",
                        "Birthday": "date!",
                    },
                    pointTypes: {
                        "Total": {
                            startDate: new Date(0),
                            endDate: new Date(3000000000000),
                        },
                    },
                    refreshLock: false,
                });
                assert(troupe.insertedId, "Failed to create troupe");
        
                const dashboard = await this.dashboardColl.insertOne({
                    troupeId: troupe.insertedId.toHexString(),
                    lastUpdated,
                    totalMembers: 0,
                    totalEvents: 0,
                    avgPointsPerEvent: 0,
                    avgAttendeesPerEvent: 0,
                    avgAttendeesPerEventType: [],
                    attendeePercentageByEventType: [],
                    eventPercentageByEventType: [],
                    upcomingBirthdays: {
                        frequency: "monthly",
                        desiredFrequency: "monthly",
                        members: [],
                    },
                });
                assert(dashboard.insertedId, "Failed to create dashboard");
                return troupe.insertedId;
            });
    }

    async deleteTroupe(troupeId: string) {
        return this.client
            .startSession()
            .withTransaction(async () => {
                return Promise.all([
                    this.troupeColl.deleteOne({ _id: new ObjectId(troupeId) }),
                    this.dashboardColl.deleteOne({ troupeId }),
                    this.audienceColl.deleteMany({ troupeId }),
                    this.eventColl.deleteMany({ troupeId })
                ]).then((res) => {
                    assert(res.every((r) => r.acknowledged), "Failed to fully delete troupe");
                    console.log(res.reduce((deletedCount, r) => deletedCount + r.deletedCount, 0));
                });
            });
    }

    async resetTroupe(troupeId: string) {
        return this.client
            .startSession()
            .withTransaction(async () => {
                const lastUpdated = new Date();
                const clearTroupe = await this.troupeColl.updateOne(
                    { _id: new ObjectId(troupeId) },
                    {
                        $set: {
                            lastUpdated,
                            eventTypes: [],
                            memberProperties: {
                                "First Name": "string!",
                                "Middle Name": "string?",
                                "Last Name": "string!",
                                "Member ID": "string!",
                                "Email": "string!",
                                "Birthday": "date!",
                            },
                            pointTypes: {
                                "Total": {
                                    startDate: new Date(0),
                                    endDate: new Date(3000000000000),
                                },
                            },
                            refreshLock: false,
                        },
                    }
                );

                const clearDashboard = await this.dashboardColl.updateOne(
                    { troupeId },
                    {
                        $set: {
                            lastUpdated,
                            totalMembers: 0,
                            totalEvents: 0,
                            avgPointsPerEvent: 0,
                            avgAttendeesPerEvent: 0,
                            avgAttendeesPerEventType: [],
                            attendeePercentageByEventType: [],
                            eventPercentageByEventType: [],
                            upcomingBirthdays: {
                                frequency: "monthly",
                                desiredFrequency: "monthly",
                                members: [],
                            },
                        },
                    }
                );

                return Promise.all([
                    clearTroupe, 
                    clearDashboard,
                    this.audienceColl.deleteMany({ troupeId }),
                    this.eventColl.deleteMany({ troupeId }),
                ]).then((res) => {
                    assert(res.every((r) => r.acknowledged), "Failed to fully reset troupe");
                });
            });
    }
}