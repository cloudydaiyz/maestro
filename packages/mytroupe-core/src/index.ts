// Implementation for client-facing controller methods

import { ObjectId, PullOperator, PushOperator, WithId } from "mongodb";
import { DRIVE_FOLDER_REGEX, EVENT_DATA_SOURCES, EVENT_DATA_SOURCE_REGEX, MAX_EVENT_TYPES, MAX_POINT_TYPES, BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ } from "./util/constants";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, VariableMemberProperties, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "./types/core-types";
import { CreateEventRequest, CreateEventTypeRequest, EventType, Member, PublicEvent, Troupe, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "./types/api-types";
import { Mutable, Replace, SetOperator, UnsetOperator, WeakPartial } from "./types/util-types";
import assert from "assert";
import { BaseService } from "./services/base-service";
import { MyTroupeClientError } from "./util/error";

export class TroupeApiService extends BaseService {
    constructor() { super() }

    /** Retrieves or formats the current troupe using public-facing format */ 
    async getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe> {
        let publicTroupe: WeakPartial<WithId<TroupeSchema>, "_id"> = typeof troupe == "string" 
            ? await this.getTroupeSchema(troupe, true)
            : troupe;
        
        // Remove the ObjectId to replace with a string ID
        const id = publicTroupe._id!.toHexString();
        delete publicTroupe._id;

        // Get the public version of the event types
        const eventTypes = await Promise.all(publicTroupe.eventTypes.map((et) => this.getEventType(et)));

        // Get the public version of the point types and synchronized point types
        let pointTypes: Troupe["pointTypes"] = {} as Troupe["pointTypes"];
        let synchronizedPointTypes: Troupe["synchronizedPointTypes"] = {} as Troupe["synchronizedPointTypes"];

        for(const key in publicTroupe.pointTypes) {
            const data = publicTroupe.pointTypes[key];
            pointTypes[key] = {
                startDate: data.startDate.toISOString(),
                endDate: data.endDate.toISOString(),
            }
        }

        for(const key in publicTroupe.synchronizedPointTypes) {
            const data = publicTroupe.synchronizedPointTypes[key];
            synchronizedPointTypes[key] = {
                startDate: data.startDate.toISOString(),
                endDate: data.endDate.toISOString(),
            }
        }

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
    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<Troupe> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update troupe while sync is in progress"));

        // Prepare for the database update
        const troupeUpdate = { 
            $set: {} as SetOperator<TroupeSchema>, 
            $unset: {} as UnsetOperator<TroupeSchema>
        }

        // Set the name and the last updated
        troupeUpdate.$set.lastUpdated = new Date();
        request.name ? troupeUpdate.$set.name = request.name : null;

        // Ensure the origin event is valid before setting it
        if(request.originEventId) {
            const event = await this.eventColl.findOne({ _id: new ObjectId(request.originEventId) });
            assert(event, new MyTroupeClientError("Unable to find specified origin event"));
            troupeUpdate.$set.originEventId = request.originEventId;
        }

        // Update member properties; must wait until next sync to synchronize member properties.
        if(request.updateMemberProperties) {
            let numMemberProperties = Object.keys(troupe.memberPropertyTypes).length;

            // Ignore member properties to be removed and ensure no base member properties
            // get updated
            for(const key in request.updateMemberProperties) {
                assert(!(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new MyTroupeClientError("Cannot modify base member properties"));
                
                if(!(request.removeMemberProperties?.includes(key))) {
                    troupeUpdate.$set[`memberProperties.${key}`] = request.updateMemberProperties[key];
                    if(!(key in troupe.memberPropertyTypes)) numMemberProperties++;
                }
            }

            assert(numMemberProperties <= MAX_POINT_TYPES, 
                new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} member properties`));
        }

        // Remove member properties & ensure no base member properties are requested
        // for removal
        if(request.removeMemberProperties) {
            for(const key of request.removeMemberProperties) {
                assert(!(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new MyTroupeClientError("Cannot delete base member properties"));
                troupeUpdate.$unset[`memberProperties.${key}`] = "";
            }
        }

        // Update point types
        if(request.updatePointTypes) {
            let numPointTypes = Object.keys(troupe.pointTypes).length;
            let newPointTypes = troupe.pointTypes;

            for(const key in request.updatePointTypes) {
                const pointType = {
                    startDate: new Date(request.updatePointTypes[key].startDate),
                    endDate: new Date(request.updatePointTypes[key].endDate),
                }
                assert(pointType.startDate.toString() != "Invalid Date"
                    && pointType.endDate.toString() != "Invalid Date", 
                    new MyTroupeClientError("Invalid date syntax"))
                assert(!(key in BASE_POINT_TYPES_OBJ), 
                    new MyTroupeClientError("Cannot modify base point types"));
                assert(pointType.startDate < pointType.endDate, 
                    new MyTroupeClientError("Invalid point type date range"));

                if(!(request.removePointTypes?.includes(key))) {
                    troupeUpdate.$set[`pointTypes.${key}`] = pointType;
                    if(!(key in troupe.pointTypes)) numPointTypes++;
                }
                newPointTypes[key] = pointType;
            }
            assert(numPointTypes <= MAX_POINT_TYPES, 
                new MyTroupeClientError(`Cannot have more than ${MAX_POINT_TYPES} point types`));
            
            // *FUTURE: Update point calculations for members
        }

        // Remove point types
        if(request.removePointTypes) {
            for(const key of request.removePointTypes) {
                assert(!(key in BASE_POINT_TYPES_OBJ), new MyTroupeClientError("Cannot delete base point types"));
                troupeUpdate.$unset[`pointTypes.${key}`] = "";
            }
        }

        // Perform database update
        const newTroupe = await this.troupeColl.findOneAndUpdate(
            { _id: new ObjectId(troupeId) }, 
            troupeUpdate,
            { returnDocument: "after" }
        );
        assert(newTroupe, "Failed to update troupe");
        // *FUTURE: Update members with the new point types
        
        // Return public facing version of the new troupe
        return this.getTroupe(newTroupe);
    }

    /** Creates a new event in the given Troupe. */
    async createEvent(troupeId: string, request: CreateEventRequest): Promise<PublicEvent> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot create event while sync is in progress"));

        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.eventTypeId);
        const startDate = new Date(request.startDate);
        const eventDataSource = EVENT_DATA_SOURCE_REGEX.findIndex((regex) => regex.test(request.sourceUri!));
        assert(eventDataSource > -1, new MyTroupeClientError("Invalid source URI"));
        assert(startDate.toString() != "Invalid Date", new MyTroupeClientError("Invalid date"));
        assert(request.eventTypeId == undefined || request.value == undefined, 
            new MyTroupeClientError("Unable to define event type and value at same time for event."));
        assert(request.eventTypeId == undefined || eventType,
            new MyTroupeClientError("Invalid event type ID"));
        
        // Find event type and populate value
        // FUTURE: Get event fields from source URI

        const event: EventSchema = {
            troupeId,
            lastUpdated: new Date(),
            title: request.title,
            source: EVENT_DATA_SOURCES[eventDataSource],
            synchronizedSource: "",
            sourceUri: request.sourceUri,
            synchronizedSourceUri: "",
            startDate,
            eventTypeId: request.eventTypeId,
            eventTypeTitle: request.eventTypeTitle,
            value: request.value,
            fieldToPropertyMap: {},
            synchronizedFieldToPropertyMap: {}
        }
        const insertedEvent = await this.eventColl.insertOne(event);
        assert(insertedEvent.acknowledged, "Insert failed for event");

        return this.getEvent({...event, _id: insertedEvent.insertedId});
    }

    async getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent> {
        assert(typeof event != "string" || troupeId != null, 
            new MyTroupeClientError("Must have a troupe ID to retrieve event."))
        let publicEvent: WeakPartial<WithId<EventSchema>, "_id"> = typeof event == "string" 
            ? await this.getEventSchema(troupeId!, event, true)
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

    /**
     * Update title, sourceUri, timeline, type info, point info, or field to property mapping. If event
     * has an event type but the user updates the value field, the event type for the event is removed.
     * You cannot update with the event type and value fields at the same time.
     * 
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for
     * - Update member properties for the event attendees
     * - Update field to property mapping
     */
    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<PublicEvent> {
        const [troupe, event] = await Promise.all([
            this.getTroupeSchema(troupeId, true),
            this.getEventSchema(troupeId, eventId, true)
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
            const dataSource = EVENT_DATA_SOURCE_REGEX.findIndex((regex) => regex.test(request.sourceUri!));
            assert(dataSource, new MyTroupeClientError("Invalid source URI"));

            eventUpdate.$set.source = EVENT_DATA_SOURCES[dataSource];
            eventUpdate.$set.sourceUri = request.sourceUri;

            // FUTURE: Delete the field to property mapping
        }

        if(request.value && request.value != event.value) {
            assert(!event.eventTypeId, new MyTroupeClientError("Cannot update value when the event has an event type"));
            eventUpdate.$set.value = request.value;

            // FUTURE: Update member points for types that the event's start date is in range for
        }

        // Update known properties in the field to property map of the event
        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                assert(key in event.fieldToPropertyMap, new MyTroupeClientError("Invalid field ID"));

                // Invariant: At most one unique property per field
                if(!(request.removeProperties?.includes(key))) {
                    assert(Object.values(event.fieldToPropertyMap)
                        .reduce((acc, val) => acc + (
                            val.property 
                            && val.property == request.updateProperties![key] 
                            ? 1 : 0
                        ), 
                        0) == 0,
                    "Field already present in another property"),
                    eventUpdate.$set[`fieldToPropertyMap.${key}.property`] = request.updateProperties[key];
                }
            }
        }

        // Remove properties in the field to property map of the event
        if(request.removeProperties) {
            for(const key of request.removeProperties) {
                eventUpdate.$set[`fieldToPropertyMap.${key}.property`] = null;
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

    /**
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for*
     */
    async deleteEvent(troupeId: string, eventId: string): Promise<void> {
        const [troupe, /** event */] = await Promise.all([
            this.getTroupeSchema(troupeId, true), 
            // this.getEventSchema(troupeId, eventId)
        ]);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot delete event while sync is in progress"));

        const updateEventsAttended = await this.eventsAttendedColl.updateMany(
            { troupeId, [`events.${eventId}`]: { $exists: true } },
            { $unset: { [`events.${eventId}`]: "" } },
        );
        assert(updateEventsAttended.acknowledged, "Failed to update events attended");

        const deletedEvent = await this.eventColl.findOneAndDelete({ _id: new ObjectId(eventId), troupeId });
        assert(deletedEvent, "Failed to delete event");

        // *FUTURE: Update member points for types that the event's start date is in range for
    }

    /**
     * Wait until next sync to:
     * - Obtain the events from source folders for the event type
     */
    async createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<EventType> {

        // Ensure given source folder URIs are valid Google Drive folders
        request.sourceFolderUris.forEach((uri) => assert(
            DRIVE_FOLDER_REGEX.test(uri), 
            new MyTroupeClientError("Invalid source URI in request")
        ));

        const type: WithId<EventTypeSchema> = {
            _id: new ObjectId(),
            lastUpdated: new Date(),
            title: request.title,
            value: request.value,
            sourceFolderUris: request.sourceFolderUris,
            synchronizedSourceFolderUris: []
        };

        // Insert into the troupe only if the max number of event types haven't been reached
        const insertResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId), [`eventTypes.${MAX_EVENT_TYPES}`]: { $exists: false } },
            { $push: { eventTypes: type } }
        );
        assert(insertResult.matchedCount == 1, new MyTroupeClientError("Invalid troupe or max event types reached"));
        assert(insertResult.modifiedCount == 1, "Unable to create event type");
        return this.getEventType(type);
    }

    async getEventType(eventType: string | WithId<EventTypeSchema>, troupeId?: string): Promise<EventType> {
        assert(typeof eventType != "string" || troupeId != null, 
            new MyTroupeClientError("Must have a troupe ID to retrieve event type."))
        let eType: WeakPartial<WithId<EventTypeSchema>, "_id"> = typeof eventType == "string" 
            ? await this.getEventTypeSchema(troupeId!, eventType, true)
            : eventType;
        const eid = eType._id!.toHexString();
        delete eType._id;

        return {
            ...eType,
            id: eid,
            lastUpdated: eType.lastUpdated.toISOString(),
        }
    }

    /** 
     * Update event type
     * 
     * Wait until next sync to:
     * - Update member points for attendees of events with the corresponding type*
     * - Update event type titles in the corresponding events
     */ 
    async updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<EventType> {

        // Ensure given source folder URIs are valid Google Drive folders
        request.addSourceFolderUris?.forEach((uri) => assert(
            DRIVE_FOLDER_REGEX.test(uri), 
            new MyTroupeClientError("Invalid source URI in request")
        ));

        const troupe = await this.getTroupeSchema(troupeId, true);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update event type while sync is in progress"));
        assert(eventType, new MyTroupeClientError("Unable to find event type"));

        const eventTypeUpdate = { 
            $set: {} as SetOperator<TroupeSchema>, 
            $unset: {} as UnsetOperator<TroupeSchema>,
            $push: {} as Mutable<PushOperator<TroupeSchema>>,
            $pull: {} as Mutable<PullOperator<TroupeSchema>>
        };

        if(request.title) {
            eventTypeUpdate.$set["eventTypes.$[type].title"] = request.title;
        }

        if(request.value) {
            eventTypeUpdate.$set["eventTypes.$[type].value"] = request.value;

            // *FUTURE: Update member points for attendees of events with the corresponding type
        }

        // Update source uris. Ignore duplicates, existing source folder URIs, and URIs to 
        // be removed
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
        
        // Remove source uris
        request.removeSourceFolderUris 
            ? eventTypeUpdate.$pull["eventTypes.$[type].sourceFolderUris"] = { 
                $in: request.removeSourceFolderUris 
            } 
            : null;

        // Perform database update
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

    /**
     * Wait until next sync to:
     * - Update member points for attendees of events with the corresponding type*
     */
    async deleteEventType(troupeId: string, eventTypeId: string): Promise<void> {
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

        // *FUTURE: Update member points for attendees of events with the corresponding type
    }

    async getMember(member: string | WithId<MemberSchema>, troupeId?: string): Promise<Member> {
        assert(typeof member != "string" || troupeId != null, 
            new MyTroupeClientError("Must have a troupe ID to retrieve event."))
        const m: WeakPartial<WithId<MemberSchema>, "_id"> = typeof member == "string"
            ? await this.getMemberSchema(troupeId!, member, true)
            : member;
        const memberId = m._id!.toHexString();
        delete m._id;

        const properties = {} as Replace<MemberSchema["properties"], Date, string>;
        for(const key in m.properties) {
            properties[key] = {
                value: m.properties[key].value instanceof Date 
                    ? m.properties[key]!.value!.toString()
                    : m.properties[key].value as Replace<MemberPropertyValue, Date, string>,
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
        return Promise.all(audience.map((m) => this.getMember(m)));
    }

    /** Update or delete (optional) properties for single member */
    async updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<Member> {
        const [troupe, member] = await Promise.all([
            this.getTroupeSchema(troupeId, true),
            this.getMemberSchema(troupeId, memberId, true)
        ]);
        assert(!troupe.syncLock, new MyTroupeClientError("Cannot update member while sync is in progress"));

        const memberUpdate = {
            $set: {} as SetOperator<MemberSchema>,
            $unset: {} as UnsetOperator<MemberSchema>
        };

        memberUpdate.$set.lastUpdated = new Date();

        // Update existing properties for the member
        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                const newValue = member.properties[key];
                assert(newValue, new MyTroupeClientError("Invalid property ID"));

                // Update the property if it's not to be removed
                if(!request.removeProperties?.includes(key)) {

                    // Check if the value is valid and update the property
                    if(request.updateProperties[key].value) {
                        const propertyType = troupe.memberPropertyTypes[key].substring(0, -1);

                        if(propertyType == "date") {
                            const newDate = new Date(newValue.value as string);
                            assert(typeof newValue.value == "string" && newDate.toString() != "Invalid Date", 
                                new MyTroupeClientError("Invalid input"));
                            memberUpdate.$set[`properties.${key}.value`] = newDate;
                        } else {
                            assert(typeof newValue.value == propertyType, 
                                new MyTroupeClientError("Invalid input"));
                            memberUpdate.$set[`properties.${key}.value`] = newValue.value;
                        }
                    }

                    // Override defaults to true if not provided
                    if(request.updateProperties[key].override == undefined) {
                        request.updateProperties[key].override = true
                    }
                    memberUpdate.$set[`properties.${key}.override`] = request.updateProperties[key].override;
                }
            }
        }

        // Remove properties
        if(request.removeProperties) {
            for(const key of request.removeProperties) {
                memberUpdate.$set[`properties.${key}.value`] = null;
                memberUpdate.$set[`properties.${key}.override`] = true;
            }
        }

        // Perform database update
        const newMember = await this.audienceColl.findOneAndUpdate(
            { _id: new ObjectId(memberId), troupeId },
            memberUpdate,
            { returnDocument: "after" }
        );
        assert(newMember, "Failed to update member");

        return this.getMember(newMember);
    }

    /** 
     * Places troupe into the sync queue if the lock is disabled. If no ID is provided,
     * all troupes with disabled sync locks are placed into the queue.
     * */
    async initiateSync(troupeId?: string) {

    }
}