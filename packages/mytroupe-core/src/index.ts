import { Collection, MatchKeysAndValues, MongoClient, ObjectId, WithId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME, MAX_POINT_TYPES } from "./util/constants";
import { BaseMemberProperties, BaseMemberPropertiesObj, BasePointTypes, BasePointTypesObj, EventDataSources, EventDataSourcesRegex, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import assert from "assert";
import { EventType, PublicEvent, Troupe, UpdateEventRequest, UpdateEventTypeRequest, UpdateTroupeRequest } from "./types/api-types";
import { initTroupeSheet } from "./cloud/gcp";
import { SetOperator, UnsetOperator, WeakPartial } from "./types/util-types";

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

    protected async getTroupeSchema(troupeId: string): Promise<WithId<TroupeSchema>> {
        const schema = await this.troupeColl.findOne({ _id: new ObjectId(troupeId) });
        assert(schema, new MyTroupeClientError("Unable to find troupe"));
        return schema;
    }

    // Retrieves or formats the current troupe using public-facing format
    async getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe> {

        let publicTroupe: WeakPartial<WithId<TroupeSchema>, "_id"> = typeof troupe == "string" 
            ? await this.getTroupeSchema(troupe)
            : troupe;
        const id = publicTroupe._id!.toHexString();
        delete publicTroupe._id;

        const eventTypes = publicTroupe.eventTypes.map<EventType>((et) => {
            const eType: WeakPartial<WithId<EventTypeSchema>, "_id"> = et;
            const eid = eType._id!.toHexString();
            delete eType._id;

            return {
                ...eType,
                id: eid,
                lastUpdated: eType.lastUpdated.toISOString(),
            }
        });

        let pointTypes: Troupe["pointTypes"] = {} as Troupe["pointTypes"];
        for(const key in publicTroupe.pointTypes) {
            const data = publicTroupe.pointTypes[key];
            pointTypes[key] = {
                startDate: data.startDate.toISOString(),
                endDate: data.endDate.toISOString(),
            }
        }

        const synchronizedPointTypes = {...pointTypes};
        return {
            ...publicTroupe,
            lastUpdated: publicTroupe.lastUpdated.toISOString(),
            id,
            eventTypes,
            pointTypes,
            synchronizedPointTypes,
        }
    }

    /**
     * Wait until next sync to:
     * - update properties of each member with the properties of the new origin event
     * - update the properties of members to have the correct type (in case they made a mistake)
     * - update the point types of members to have the correct type & amt of points*
     */
    async updateTroupe(request: UpdateTroupeRequest): Promise<Troupe> {
        const troupe = await this.getTroupeSchema(request.troupeId);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update troupe while sync is in progress"));
        const troupeUpdate = { 
            $set: {} as SetOperator<TroupeSchema>, 
            $unset: {} as UnsetOperator<TroupeSchema>
        }

        troupeUpdate.$set.lastUpdated = new Date();
        request.name ? troupeUpdate.$set.name = request.name : null;

        if(request.originEventId) {
            const event = await this.eventColl.findOne({ _id: new ObjectId(request.originEventId) });
            assert(event, new MyTroupeClientError("Unable to find specified origin event"));
            troupeUpdate.$set.originEventId = request.originEventId;
        }

        if(request.updateMemberProperties) {
            let numMemberProperties = Object.keys(troupe.memberProperties).length;
            for(const key in request.updateMemberProperties) {
                assert(!(key in BaseMemberPropertiesObj), 
                    new MyTroupeClientError("Cannot modify base member properties"));
                
                if(!(request.removeMemberProperties?.includes(key))) {
                    troupeUpdate.$set[`memberProperties.${key}`] = request.updateMemberProperties[key];
                    if(!(key in troupe.memberProperties)) numMemberProperties++;
                }
            }
            assert(numMemberProperties <= MAX_POINT_TYPES, 
                new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} member properties`));
        }

        if(request.removeMemberProperties) {
            for(const key of request.removeMemberProperties) {
                assert(!(key in BaseMemberPropertiesObj), "Cannot delete base member properties");
                troupeUpdate.$unset[`memberProperties.${key}`] = "";
            }
        }

        if(request.updatePointTypes) {
            let numPointTypes = Object.keys(troupe.pointTypes).length;
            for(const key in request.updatePointTypes) {
                const pointType = {
                    startDate: new Date(request.updatePointTypes[key].startDate),
                    endDate: new Date(request.updatePointTypes[key].endDate),
                }
                assert(!(key in BasePointTypesObj), "Cannot modify base point types");
                assert(pointType.startDate < pointType.endDate, 
                    "Invalid point type date range");

                if(!(request.removePointTypes?.includes(key))) {
                    troupeUpdate.$set[`pointTypes.${key}`] = pointType;
                    if(!(key in troupe.pointTypes)) numPointTypes++;
                }
            }
            assert(numPointTypes <= MAX_POINT_TYPES, 
                new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} point types`));
        }

        if(request.removePointTypes) {
            for(const key of request.removePointTypes) {
                assert(!(key in BasePointTypesObj), "Cannot delete base point types");
                troupeUpdate.$unset[`pointTypes.${key}`] = "";
            }
        }

        // Update the troupe
        const newTroupe = await this.troupeColl.findOneAndUpdate(
            { _id: new ObjectId(request.troupeId) }, 
            troupeUpdate,
            { returnDocument: "after" }
        );
        assert(newTroupe, new MyTroupeClientError("Failed to update troupe"));
        
        // Return public facing version of the new troupe
        // *FUTURE: Update members with the new point types
        return this.getTroupe(newTroupe);
    }

    // Retrieve all events using public-facing format
    async getEvents(troupeId: string): Promise<PublicEvent[]> {
        const events = await this.eventColl.find({ troupeId }, { projection: { _id: 0 }}).toArray();
        return events.map((e: WeakPartial<WithId<EventSchema>, "_id">) => {
            const eid = e._id!.toHexString();
            delete e._id;
            return {
                ...e,
                id: eid,
                lastUpdated: e.lastUpdated.toISOString(),
                startDate: e.startDate.toISOString(),
            }
        });
    }

    protected async getEventSchema(troupeId: string, eventId: string): Promise<WithId<EventSchema>> {
        const event = await this.eventColl.findOne({ _id: new ObjectId(eventId), troupeId });
        assert(event, new MyTroupeClientError("Unable to find event"));
        return event;
    }

    /**
     * Update title, sourceUri, timeline, type info, point info, or field to property mapping. If event
     * has an event type but the user updates the value field, the event type for the event is removed.
     * You cannot update with the event type and value fields at the same time.
     * 
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for
     */
    async updateEvent(request: UpdateEventRequest) {
        const troupe = await this.getTroupeSchema(request.troupeId);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update event while sync is in progress"));

        const event = await this.getEventSchema(request.troupeId, request.eventId);
        const eventUpdate = { 
            $set: {} as SetOperator<EventSchema>, 
            $unset: {} as UnsetOperator<EventSchema>
        };

        request.title ? eventUpdate.$set.title = request.title : null;

        const startDate = request.startDate ? new Date(request.startDate) : null;
        if(startDate) {
            eventUpdate.$set.startDate = startDate;

            // FUTURE: Update member points for types that the event is in data range for
        }

        if(request.sourceUri) {
            const dataSource = EventDataSourcesRegex.findIndex((regex) => regex.test(request.sourceUri!));
            assert(dataSource, new MyTroupeClientError("Invalid source URI"));

            eventUpdate.$set.source = EventDataSources[dataSource];
            eventUpdate.$set.sourceUri = request.sourceUri;

            // FUTURE: Update field to property mapping
        }

        if(request.updateTypeId) {
            const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.updateTypeId);
            assert(eventType, new MyTroupeClientError("Invalid event type ID"));

            eventUpdate.$set.typeId = request.updateTypeId;
            if(eventType.value != event.value) {
                eventUpdate.$set.value = eventType.value;

                // FUTURE: Update member points for types that the event is in data range for
            }
        }

        if(request.removeTypeId) {
            assert(!request.updateTypeId, new MyTroupeClientError("Cannot remove and update type ID"));
            eventUpdate.$unset.typeId = "";
        }

        if(request.value && request.value != event.value) {
            assert(!request.updateTypeId, new MyTroupeClientError("Cannot update value and type ID at the same time"));
            eventUpdate.$set.value = request.value;

            // FUTURE: Update member points for types that the event is in data range for
        }
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