import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME, MAX_POINT_TYPES } from "./util/constants";
import { BaseMemberProperties, BasePointTypes, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import assert from "assert";
import { EventType, Troupe, UpdateEventTypeRequest, UpdateEventTypeResponse, UpdateTroupeRequest, UpdateTroupeResponse } from "./types/api-types";
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
    async updateEventType({troupeId, eventTypeId, title, points, 
        sourceFolderUris}: UpdateEventTypeRequest): Promise<UpdateEventTypeResponse> {
        const eventType = await this.getTroupeSchema(troupeId)
            .then(troupe => troupe.eventTypes.find(et => et._id.toHexString() == eventTypeId));
        assert(eventType, new MyTroupeClientError("Unable to find event type"));

        let $set: { [key: string]: any } = {};
        let $unset: { [key: string]: any } = {};

        title ? $set.title = title : null;
        points ? $set.points = points : null;

        const newUris: string[] = [];
        const removedUris: string[] = [];
        if(sourceFolderUris) {
            const newUris = sourceFolderUris.filter(uri => !eventType.sourceFolderUris.includes(uri));
            
            eventType.sourceFolderUris.filter(uri => !sourceFolderUris.includes(uri)).concat(newUris);
        }

        if(Object.keys($set).length == 0 && Object.keys($unset).length == 0) {
            return {
                updated: [],
                removed: [],
                newUris: [],
                removedUris: [],
            }
        }

        const updateResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId), "eventTypes._id": new ObjectId(eventTypeId) },
            { $set: { "eventTypes.$[elem].lastUpdated": new Date(), ...$set }, $unset },
            { arrayFilters: [{ "elem._id": new ObjectId(eventTypeId) }] }
        );
        assert(updateResult.modifiedCount == 1, "Failed to update event type");

        return {
            updated: Object.keys($set),
            removed: Object.keys($unset),
            newUris, removedUris,
        }
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