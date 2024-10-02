import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME, MAX_POINT_TYPES } from "./util/constants";
import { BaseMemberProperties, BasePointTypes, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import assert from "assert";
import { EventType, Troupe, UpdateEventTypeRequest, UpdateTroupeRequest } from "./types/api-types";
import { initTroupeSheet } from "./cloud/gcp";
import { WeakPartial } from "./types/util-types";

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

        const eventTypes = troupe.eventTypes.map<EventType>((et) => {
            const eType: WeakPartial<WithId<EventTypeSchema>, "_id"> = et;
            const eid = eType._id!.toHexString();
            delete eType._id;

            return {
                ...eType,
                id: eid,
                lastUpdated: eType.lastUpdated.toISOString(),
            }
        });

        const pointTypes: Troupe["pointTypes"] = {
            "Total": {
                startDate: troupe.pointTypes["Total"].startDate.toISOString(),
                endDate: troupe.pointTypes["Total"].endDate.toISOString(),
            }
        };

        for(const key in troupe.pointTypes) {
            if(key != "Total") {
                const data = troupe.pointTypes[key];
                pointTypes[key] = {
                    startDate: data.startDate.toISOString(),
                    endDate: data.endDate.toISOString(),
                }
            }
        }

        return {
            ...troupe,
            id: schemaId,
            lastUpdated: troupe.lastUpdated.toISOString(),
            eventTypes,
            pointTypes,
        }
    }

    /**
     * Wait until next sync to:
     * - update properties of each member with the properties of the new origin event
     */
    async updateTroupe(request: UpdateTroupeRequest) {
        const troupe = await this.getTroupeSchema(request.troupeId);
        const $set: { [key: string]: any } = {};
        const $unset: { [key: string]: any } = {};

        $set.lastUpdated = new Date();
        request.name ? $set.name = request.name : null;

        if(request.originEventId) {
            const event = await this.eventColl.findOne({ _id: new ObjectId(request.originEventId) });
            assert(event, new MyTroupeClientError("Unable to find specified origin event"));
            $set.originEventId = request.originEventId;
        }

        if(request.updateMemberProperties) {
            for(const key in request.updateMemberProperties) {
                if(!troupe.memberProperties[key] && key.substring(key.length - 1) == "!") {
                    throw new MyTroupeClientError("Cannot add optional member properties");
                }
                $set[`memberProperties.${key}`] = request.updateMemberProperties[key];
            }
        }
    }

    // Retrieve all events
    async getEvents() {

    }

    // Update title, sourceUri, timeline, type info, point info, or field to property mapping
    async updateEvent() {

    }

    async deleteEvent() {

    }

    // Update title, points, or sourceFolderUris
    async updateEventType(request: UpdateEventTypeRequest) {
        
    }

    // Pick whether to replace event type with another type, or assign points
    async deleteEventType(troupeId: string, eventTypeId: string) {

    }

    // Retrieve all members
    async getAudience(troupeId: string) {

    }

    // Update or delete (optional) properties for single member
    async updateMember() {

    }

    // Turns on sync lock and places troupe into the sync queue if the lock is disabled
    async initiateSync(troupeId: string) {

    }
}