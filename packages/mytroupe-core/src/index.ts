import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME, MAX_POINT_TYPES } from "./util/constants";
import { BaseMemberProperties, BasePointTypes, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import assert from "assert";
import { EventType, Troupe, UpdateTroupeRequest, UpdateTroupeResponse } from "./types/api-types";
import { initTroupeSheet } from "./cloud/gcp";
import { WeakPartial } from "./types/util-types";
import { CreateTroupeSchema } from "./types/service-types";

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

    private async getTroupeSchema(troupeId: string): Promise<WithId<TroupeSchema>> {
        const schema = await this.troupeColl.findOne({ _id: new ObjectId(troupeId) });
        assert(schema, new MyTroupeClientError("Unable to find troupe"));
        return schema;
    }

    // Retrieves the current state of the troupe
    async getTroupe(troupeId: string): Promise<Troupe> {

        let troupe: WeakPartial<WithId<TroupeSchema>, "_id"> = await this.getTroupeSchema(troupeId);
        const schemaId = troupe._id!.toHexString();
        delete troupe._id;

        const eventTypes = troupe.eventTypes.map((et) => {
            const eType: WeakPartial<WithId<EventTypeSchema>, "_id"> = et;
            const eid = eType._id!.toHexString();
            delete eType._id;

            return {
                ...eType,
                id: eid,
                lastUpdated: eType.lastUpdated.toISOString(),
            }
        });

        return {
            ...troupe,
            id: schemaId,
            lastUpdated: troupe.lastUpdated.toISOString(),
            eventTypes
        }
    }

    async updateTroupe({ troupeId, name, originEventId, memberProperties, 
        pointTypes }: UpdateTroupeRequest): Promise<UpdateTroupeResponse> {
        const troupe = await this.getTroupeSchema(troupeId);
        let numResultingMemberProperties = Object.keys(troupe.memberProperties).length;
        let numResultingPointTypes = Object.keys(troupe.pointTypes).length;

        let $set: { [key: string]: any } = {};
        let $unset: { [key: string]: any } = {};

        name ? $set.name = name : null;
        originEventId != troupe.originEventId 
            ? $set.originEventId = originEventId : $unset.originEventId = "";
        
        if(memberProperties) {
            let keys = Object.keys(memberProperties);

            // Ensure the request isn't trying to modify the BaseMemberProperties
            if(keys.findIndex(key => key in ["First Name", "Last Name", "Email", "Birthday"]) != -1) {
                throw new MyTroupeClientError("Cannot modify base member properties");
            }
            
            for (const key of keys) {
                const prop = memberProperties[key];
                if(prop != troupe.memberProperties[key]) {

                    // Can't make a member property required until there's at least 1 event that uses it
                    if(prop.substring(prop.length - 1) == "!") {
                        const event = await this.eventColl.findOne(
                            { troupeId, [`memberProperties.${key}`]: { $exists: true } }
                        );

                        if(!event) {
                            throw new MyTroupeClientError("Cannot make a member property required until "
                                + "an event uses it. Try making it optional first.");
                        }
                    }

                    $set[`memberProperties.${key}`] = memberProperties[key];
                    numResultingMemberProperties++;
                } else {
                    $unset[`memberProperties.${key}`] = "";
                    numResultingMemberProperties--;
                }

                if(numResultingMemberProperties > MAX_POINT_TYPES) {
                    throw new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} member properties`);
                }
            }
        }

        if(pointTypes) {
            const keys = Object.keys(pointTypes);

            // Ensure the request isn't trying to modify the BasePointTypes
            if(keys.findIndex(key => key in ["Total"]) != -1) {
                throw new MyTroupeClientError("Cannot modify base point types");
            }
            
            for(const key of keys) {
                if(pointTypes[key] != troupe.pointTypes[key]) {
                    $set[`pointTypes.${key}`] = pointTypes[key];
                    numResultingPointTypes++;
                } else {
                    $unset[`pointTypes.${key}`] = "";
                    numResultingPointTypes--;
                }

                if(numResultingPointTypes > MAX_POINT_TYPES) {
                    throw new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} point types`);
                }
            }
        }

        if(Object.keys($set).length == 0 && Object.keys($unset).length == 0) {
            return {
                updated: [],
                removed: [],
            }
        }
        
        const updateResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId) }, 
            { $set: {...$set, lastUpdated: new Date()}, $unset }
        );
        assert(updateResult.modifiedCount == 1, "Failed to update troupe");

        return {
            updated: Object.keys($set),
            removed: Object.keys($unset),
        }
    }

    // Update title, points, or sourceFolderUris
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
    async updateEvent() {

    }

    async deleteEvent() {

    }

    // Turns on refresh lock and places troupe into the refresh queue if the lock is disabled
    async initiateRefresh(troupeId: string) {

    }
}

// Additional functionality for other backend services
export class MyTroupeService extends MyTroupeCore {
    constructor() { super() }

    async refresh() {
        const { TroupeLogRefreshService } = await import("./refresh");
        const refreshService = new TroupeLogRefreshService();
        await refreshService.ready;

        // refreshService.discoverEvents();
        // refreshService.updateAudience();
        // refreshService.refreshLogSheet();
        // refreshService.prepareDatabaseUpdate();

        // delete members that are no longer in the source folder & have no overridden properties
    }

    async createTroupe(req: CreateTroupeSchema) {
        const logSheetUri = await initTroupeSheet(req.name).then(res => res.data.id);
        assert(logSheetUri, "Failed to create log sheet");

        return this.client.startSession().withTransaction(async () => {
            const lastUpdated = new Date();
            const troupe = await this.troupeColl.insertOne({
                ...req,
                lastUpdated,
                logSheetUri,
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
        return this.client.startSession().withTransaction(async () => {
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
}