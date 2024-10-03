import { Collection, MongoClient, ObjectId, PullOperator, PushOperator, WithId } from "mongodb";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "./util/env";
import { DB_NAME, MAX_POINT_TYPES } from "./util/constants";
import { BaseMemberPropertiesObj, BasePointTypesObj, EventDataSources, EventDataSourcesRegex, EventSchema, EventTypeSchema, MemberProperties, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import { EventType, Member, PublicEvent, Troupe, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "./types/api-types";
import { Mutable, Replace, SetOperator, UnsetOperator, WeakPartial } from "./types/util-types";
import assert from "assert";

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

    /** Retrieves or formats the current troupe using public-facing format */ 
    async getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe> {
        let publicTroupe: WeakPartial<WithId<TroupeSchema>, "_id"> = typeof troupe == "string" 
            ? await this.getTroupeSchema(troupe)
            : troupe;
        const id = publicTroupe._id!.toHexString();
        delete publicTroupe._id;

        const eventTypes = await Promise.all(publicTroupe.eventTypes.map((et) => this.getEventType(et)));

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
    async updateTroupe(troupeId: string, eventId: string, request: UpdateTroupeRequest): Promise<Troupe> {
        const troupe = await this.getTroupeSchema(troupeId);
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
                assert(!(key in BaseMemberPropertiesObj), 
                    new MyTroupeClientError("Cannot delete base member properties"));
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
                assert(!(key in BasePointTypesObj), new MyTroupeClientError("Cannot delete base point types"));
                troupeUpdate.$unset[`pointTypes.${key}`] = "";
            }
        }

        // Update the troupe
        const newTroupe = await this.troupeColl.findOneAndUpdate(
            { _id: new ObjectId(troupeId) }, 
            troupeUpdate,
            { returnDocument: "after" }
        );
        assert(newTroupe, "Failed to update troupe");
        
        // Return public facing version of the new troupe
        // *FUTURE: Update members with the new point types
        return this.getTroupe(newTroupe);
    }

    protected async getEventSchema(troupeId: string, eventId: string): Promise<WithId<EventSchema>> {
        const event = await this.eventColl.findOne({ _id: new ObjectId(eventId), troupeId });
        assert(event, new MyTroupeClientError("Unable to find event"));
        return event;
    }

    public async getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent> {
        assert(typeof event != "string" || troupeId != null, 
            new MyTroupeClientError("Must have a troupe ID to retrieve event."))
        let publicEvent: WeakPartial<WithId<EventSchema>, "_id"> = typeof event == "string" 
            ? await this.getEventSchema(troupeId!, event)
            : event;
        const eid = publicEvent._id!.toHexString();
        delete publicEvent._id;

        return {
            ...publicEvent,
            id: eid,
            lastUpdated: publicEvent.lastUpdated.toISOString(),
            startDate: publicEvent.startDate.toISOString(),
        }
    }

    /** Retrieve all events using public-facing format */ 
    async getEvents(troupeId: string): Promise<PublicEvent[]> {
        const events = await this.eventColl.find({ troupeId }, { projection: { _id: 0 }}).toArray();
        return Promise.all(events.map((e) => this.getEvent(e)));
    }

    /** Creates a new event in the given Troupe. */
    async createEvent() {

    }

    /**
     * Update title, sourceUri, timeline, type info, point info, or field to property mapping. If event
     * has an event type but the user updates the value field, the event type for the event is removed.
     * You cannot update with the event type and value fields at the same time.
     * 
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for
     * - Update member properties for the event attendees
     */
    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest) {
        const [troupe, event] = await Promise.all([
            this.getTroupeSchema(troupeId),
            this.getEventSchema(troupeId, eventId)
        ]);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update event while sync is in progress"));

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

        if(request.updateEventTypeId) {
            const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.updateEventTypeId);
            assert(eventType, new MyTroupeClientError("Invalid event type ID"));

            eventUpdate.$set.eventTypeId = request.updateEventTypeId;
            if(eventType.value != event.value) {
                eventUpdate.$set.value = eventType.value;

                // FUTURE: Update member points for types that the event's start date is in range for
            }
        }

        if(request.removeEventTypeId) {
            assert(!request.updateEventTypeId, new MyTroupeClientError("Cannot remove and update type ID"));
            eventUpdate.$unset.eventTypeId = "";
        }

        if(request.value && request.value != event.value) {
            assert(!request.updateEventTypeId, new MyTroupeClientError("Cannot update value and type ID at the same time"));
            eventUpdate.$set.value = request.value;

            // FUTURE: Update member points for types that the event's start date is in range for
        }

        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                assert(event.fieldToPropertyMap[key], new MyTroupeClientError("Invalid field ID"));

                if(!(request.removeProperties?.includes(key))) {
                    eventUpdate.$set[`fieldToPropertyMap.${key}`] = request.updateProperties[key];
                }
            }
        }

        if(request.removeProperties) {
            for(const key of request.removeProperties) {
                eventUpdate.$unset[`fieldToPropertyMap.${key}`] = "";
            }
        }

        const newEvent = await this.eventColl.findOneAndUpdate(
            { _id: new ObjectId(eventId), troupeId: troupeId },
            eventUpdate,
            { returnDocument: "after" }
        );
        assert(newEvent, "Failed to update event");

        // Return public facing version of the new event
        // *FUTURE: Update members with the new point calculations
        return this.getEvent(newEvent);
    }

    async deleteEvent(troupeId: string, eventId: string) {
        const [troupe, event] = await Promise.all([
            this.getTroupeSchema(troupeId), 
            this.getEventSchema(troupeId, eventId)
        ]);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot delete event while sync is in progress"));

        const deletedEvent = await this.eventColl.findOneAndDelete({ _id: new ObjectId(eventId), troupeId });
        assert(deletedEvent, "Failed to delete event");

        // FUTURE: Update member points for types that the event's start date is in range for
    }

    protected async getEventTypeSchema(troupeId: string, eventTypeId: string) {
        const troupe = await this.getTroupeSchema(troupeId);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, new MyTroupeClientError("Unable to find event type"));
        return eventType;
    }

    public async getEventType(eventType: string | WithId<EventTypeSchema>, troupeId?: string): Promise<EventType> {
        assert(typeof eventType != "string" || troupeId != null, 
            new MyTroupeClientError("Must have a troupe ID to retrieve event type."))
        let eType: WeakPartial<WithId<EventTypeSchema>, "_id"> = typeof eventType == "string" 
            ? await this.getEventTypeSchema(troupeId!, eventType)
            : eventType;
        const eid = eType._id!.toHexString();
        delete eType._id;

        return {
            ...eType,
            id: eid,
            lastUpdated: eType.lastUpdated.toISOString(),
        }
    }

    async createEventType() {

    }

    /** Update title, points, or sourceFolderUris */ 
    async updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest) {
        const troupe = await this.getTroupeSchema(troupeId);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update event type while sync is in progress"));
        assert(eventType, new MyTroupeClientError("Unable to find event type"));

        const eventTypeUpdate = { 
            $set: {} as SetOperator<TroupeSchema>, 
            $unset: {} as UnsetOperator<TroupeSchema>,
            $push: {} as Mutable<PushOperator<TroupeSchema>>,
            $pull: {} as Mutable<PullOperator<TroupeSchema>>
        };

        request.title ? eventTypeUpdate.$set["eventTypes.$[type].title"] = request.title : null;

        if(request.value) {
            eventTypeUpdate.$set["eventTypes.$[type].value"] = request.value;

            // FUTURE: Update member points for attendees of events with the corresponding type
        }

        const newUris = request.addSourceFolderUris?.filter((uri, index) => 
            request.addSourceFolderUris!.indexOf(uri) == index 
                && !eventType?.sourceFolderUris.includes(uri)
                && !request.removeSourceFolderUris?.includes(uri)
        );
        newUris && newUris.length > 0 
            ? eventTypeUpdate.$push["eventTypes.$[type].sourceFolderUris"] = { 
                $each: newUris 
            }  
            : null;
        
        request.removeSourceFolderUris 
            ? eventTypeUpdate.$pull["eventTypes.$[type].sourceFolderUris"] = { 
                $in: request.removeSourceFolderUris 
            } 
            : null;

        const newEventType = await this.troupeColl.findOneAndUpdate(
            { _id: new ObjectId(troupeId) },
            eventTypeUpdate,
            { arrayFilters: [{ "type._id": new ObjectId(eventTypeId) }]}
        );
        assert(newEventType, "Failed to update event type");

        return this.getEventType(
            newEventType.eventTypes.find((et) => et._id.toHexString() == eventTypeId)!
        );
    }

    async deleteEventType(troupeId: string, eventTypeId: string) {
        const updateEventResult = await this.eventColl.updateMany(
            { troupeId, eventTypeId },
            { $unset: { eventTypeId: "" } }
        );
        assert(updateEventResult.acknowledged, "Failed to delete events");

        const deleteEventTypeResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId) },
            { $pull: { eventTypes: { _id: new ObjectId(eventTypeId) }}}
        );
        assert(deleteEventTypeResult.matchedCount, new MyTroupeClientError("Event type not found in troupe"));
        assert(deleteEventTypeResult.modifiedCount, "Failed to delete event type");
    }

    protected async getMemberSchema(troupeId: string, memberId: string) {
        const member = await this.audienceColl.findOne({ _id: new ObjectId(memberId), troupeId });
        assert(member, new MyTroupeClientError("Unable to find member"));
        return member;
    }

    public getMember(member: WithId<MemberSchema>): Member {
        const m: WeakPartial<WithId<MemberSchema>, "_id"> = member;
        const memberId = m._id!.toHexString();
        delete m._id;

        const properties = {} as Replace<MemberProperties, Date, string>;
        for(const key in m.properties) {
            properties[key] = {
                value: m.properties[key].value instanceof Date 
                    ? m.properties[key].value.toISOString()
                    : m.properties[key].value,
                override: m.properties[key].override,
            }
        }

        return {
            ...m,
            id: memberId,
            lastUpdated: m.lastUpdated.toISOString(),
            properties,
        }
    }

    /** Retrieve all members */ 
    async getAudience(troupeId: string): Promise<Member[]> {
        const audience = await this.audienceColl.find({ troupeId }).toArray();
        return audience.map((m) => this.getMember(m));
    }

    /** Update or delete (optional) properties for single member */
    async updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<Member> {
        const [troupe, member] = await Promise.all([
            this.getTroupeSchema(troupeId),
            this.getMemberSchema(troupeId, memberId)
        ]);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update member while sync is in progress"));

        const memberUpdate = {
            $set: {} as SetOperator<MemberSchema>,
            $unset: {} as UnsetOperator<MemberSchema>
        };

        memberUpdate.$set.lastUpdated = new Date();

        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                assert(member.properties[key], new MyTroupeClientError("Invalid property ID"));

                if(!request.removeProperties?.includes(key)) {
                    if(request.updateProperties[key].value) 
                        memberUpdate.$set[`properties.${key}.value`] = request.updateProperties[key].value;
                    if(request.updateProperties[key].override)
                        memberUpdate.$set[`properties.${key}.override`] = request.updateProperties[key].override;
                }
            }
        }

        if(request.removeProperties) {
            for(const key of request.removeProperties) {
                memberUpdate.$unset[`properties.${key}`] = "";
            }
        }

        const newMember = await this.audienceColl.findOneAndUpdate(
            { _id: new ObjectId(memberId), troupeId },
            memberUpdate,
            { returnDocument: "after" }
        );
        assert(newMember, "Failed to update member");

        return this.getMember(newMember);
    }

    async blacklistMember(troupeId: string, memberId: string) {

    }

    /** Turns on sync lock and places troupe into the sync queue if the lock is disabled */
    async initiateSync(troupeId: string) {

    }
}