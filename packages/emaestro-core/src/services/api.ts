// Implementation for client-facing controller methods

import { AnyBulkWriteOperation, ObjectId, PullOperator, PushOperator, UpdateFilter, WithId } from "mongodb";
import { DRIVE_FOLDER_REGEX, EVENT_DATA_SOURCES, EVENT_DATA_SOURCE_REGEX, MAX_EVENT_TYPES, MAX_POINT_TYPES, BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_MEMBER_PROPERTIES } from "../util/constants";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, VariableMemberProperties, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema, BaseMemberProperties, VariableMemberPoints, BaseMemberPoints } from "../types/core-types";
import { CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, EventType, Member, PublicEvent, Troupe, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "../types/api-types";
import { Mutable, Replace, SetOperator, UnsetOperator, UpdateOperator, WeakPartial } from "../types/util-types";
import { BaseDbService } from "./base";
import { ClientError } from "../util/error";
import { verifyApiMemberPropertyType } from "../util/helper";
import assert from "assert";

/**
 * Provides methods for interacting with the Troupe API. The structure of all given parameters will
 * not be checked (e.g. data type, constant range boundaries), but any checks requiring database access 
 * will be performed on each parameter.
 */
export class TroupeApiService extends BaseDbService {
    constructor() { super() }

    /** Retrieves troupe or parses existing troupe into public format */ 
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
     * Updates troupe and returns troupe in public format. 
     * 
     * Wait until next sync to:
     * - update properties of each member with the properties of the new origin event
     * - update the properties of members to have the correct type (in case they made a mistake)
     * - update the point types of members to have the correct type & amt of points*
     */
    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<Troupe> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot update troupe while sync is in progress"));

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
            assert(event, new ClientError("Unable to find specified origin event"));
            troupeUpdate.$set.originEventId = request.originEventId;
        }

        // Update member properties; must wait until next sync to synchronize member properties.
        if(request.updateMemberProperties) {
            let numMemberProperties = Object.keys(troupe.memberPropertyTypes).length;

            // Ignore member properties to be removed and ensure no base member properties get updated
            for(const key in request.updateMemberProperties) {
                assert(!(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new ClientError("Cannot modify base member properties"));
                
                if(!(request.removeMemberProperties?.includes(key))) {
                    troupeUpdate.$set[`memberPropertyTypes.${key}`] = request.updateMemberProperties[key];
                    if(!(key in troupe.memberPropertyTypes)) numMemberProperties++;
                }
            }

            assert(numMemberProperties <= MAX_MEMBER_PROPERTIES, 
                new ClientError(`Cannot have more than ${MAX_POINT_TYPES} member properties`));
        }

        // Remove member properties & ensure no base member properties are requested for removal
        if(request.removeMemberProperties) {
            for(const key of request.removeMemberProperties) {
                assert(!(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new ClientError("Cannot delete base member properties"));
                troupeUpdate.$unset[`memberPropertyTypes.${key}`] = "";
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
                assert(pointType.startDate.toString() != "Invalid Date" && pointType.endDate.toString() != "Invalid Date", 
                    new ClientError("Invalid date syntax"))
                assert(!(key in BASE_POINT_TYPES_OBJ), new ClientError("Cannot modify base point types"));
                assert(pointType.startDate < pointType.endDate, new ClientError("Invalid point type date range"));

                if(!(request.removePointTypes?.includes(key))) {
                    troupeUpdate.$set[`pointTypes.${key}`] = pointType;
                    if(!(key in troupe.pointTypes)) numPointTypes++;
                }
                newPointTypes[key] = pointType;
            }
            assert(numPointTypes <= MAX_POINT_TYPES, 
                new ClientError(`Cannot have more than ${MAX_POINT_TYPES} point types`));
            
            // *FUTURE: Update point calculations for members

        }

        // Remove point types
        if(request.removePointTypes) {
            for(const key of request.removePointTypes) {
                assert(!(key in BASE_POINT_TYPES_OBJ), new ClientError("Cannot delete base point types"));
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

    /** 
     * Creates and returns a new event in the given troupe. 
     * 
     * Wait until next sync to:
     * - Retrieve attendees and field information for the event
     */
    async createEvent(troupeId: string, request: CreateEventRequest): Promise<PublicEvent> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot create event while sync is in progress"));

        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.eventTypeId);
        const startDate = new Date(request.startDate);
        const eventDataSource = EVENT_DATA_SOURCE_REGEX.findIndex((regex) => regex.test(request.sourceUri!));
        assert(eventDataSource > -1, new ClientError("Invalid source URI"));
        assert(startDate.toString() != "Invalid Date", new ClientError("Invalid date"));
        assert(request.eventTypeId == undefined || request.value == undefined, new ClientError("Unable to define event type and value at same time for event."));
        assert(request.eventTypeId == undefined || eventType, new ClientError("Invalid event type ID"));
        
        // Find event type and populate value
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
            eventTypeTitle: eventType?.title,
            value: request.value || eventType?.value as number,
            fieldToPropertyMap: {},
            synchronizedFieldToPropertyMap: {}
        }
        const insertedEvent = await this.eventColl.insertOne(event);
        assert(insertedEvent.acknowledged, "Insert failed for event");

        return this.getEvent({...event, _id: insertedEvent.insertedId});
    }

    /** Retrieves event or parses existing event into public format */ 
    async getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent> {
        assert(typeof event != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."))
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

    /** Retrieve all events in public format */ 
    async getEvents(troupeId: string): Promise<PublicEvent[]> {
        const events = await this.eventColl.find({ troupeId }).toArray();
        return Promise.all(events.map((e) => this.getEvent(e)));
    }

    /**
     * Update event in the given troupe and returns event in public format. If event has 
     * an event type but the user updates the value field, the event type for the event 
     * is removed. You cannot update with the event type and value fields at the same time.
     * 
     * Wait until next sync to:
     * - Update member properties for the event attendees
     * - Update the synchronized field to property mapping
     */
    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<PublicEvent> {
        const [troupe, oldEvent] = await Promise.all([
            this.getTroupeSchema(troupeId, true),
            this.getEventSchema(troupeId, eventId, true)
        ]);
        assert(!troupe.syncLock, new ClientError("Cannot update event while sync is in progress"));
        assert(!request.value || !request.eventTypeId, new ClientError("Cannot define event type and value at same time for event"));

        // Initialize fields
        let value = request.value || oldEvent.value;
        let startDate = request.startDate ? new Date(request.startDate) : oldEvent.startDate;
        let eventType = request.eventTypeId || oldEvent.eventTypeId;

        // Prepare for update(s)
        const eventUpdate = { 
            $set: {} as UpdateOperator<EventSchema, "$set">, 
            $unset: {} as UpdateOperator<EventSchema, "$unset">,
        };

        const eventsAttendedUpdate = {
            $set: {} as UpdateOperator<EventsAttendedBucketSchema, "$set">, 
            $unset: {} as UpdateOperator<EventSchema, "$unset">,
        };

        let updateEventsAttended = false;
        let updateMemberPoints = false;

        // Update fields for event
        eventUpdate.$set.lastUpdated = new Date();
        request.title ? eventUpdate.$set.title = request.title : null;

        if(request.startDate) {
            eventUpdate.$set.startDate = startDate;
            eventsAttendedUpdate.$set[`events.${eventId}.startDate`] = startDate;

            updateMemberPoints = true;
        }

        if(request.sourceUri) {
            const dataSource = EVENT_DATA_SOURCE_REGEX.findIndex((regex) => regex.test(request.sourceUri!));
            assert(dataSource, new ClientError("Invalid source URI"));

            eventUpdate.$set.source = EVENT_DATA_SOURCES[dataSource];
            eventUpdate.$set.sourceUri = request.sourceUri;
            eventUpdate.$set.fieldToPropertyMap = {};
        }

        if(request.eventTypeId) {
            const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.eventTypeId);
            assert(eventType, new ClientError("Invalid event type ID"));
            value = eventType.value;

            eventUpdate.$set.eventTypeId = request.eventTypeId;
            eventUpdate.$set.eventTypeTitle = eventType.title;
            eventUpdate.$set.value = eventType.value;
            eventsAttendedUpdate.$set[`events.${eventId}.typeId`] = request.eventTypeId;
            eventsAttendedUpdate.$set[`events.${eventId}.value`] = value;

            updateMemberPoints = true;
        } else if(request.eventTypeId === "") {
            eventUpdate.$unset.eventTypeId = "";
            eventUpdate.$unset.eventTypeTitle = "";
            eventsAttendedUpdate.$unset[`events.${eventId}.typeId`] = "";

            updateEventsAttended = true;
        }

        if(request.value) {
            eventUpdate.$set.value = request.value;
            eventUpdate.$unset.eventTypeId = "";
            eventsAttendedUpdate.$unset[`events.${eventId}.typeId`] = "";
            updateMemberPoints = true;
        }

        // Update known properties in the field to property map of the event
        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                assert(key in oldEvent.fieldToPropertyMap, new ClientError("Invalid field ID"));

                // Invariant: At most one unique property per field
                if(!(request.removeProperties?.includes(key))) {
                    assert(Object.values(oldEvent.fieldToPropertyMap)
                        .reduce(
                            (acc, val) => acc + (
                                val.property && val.property == request.updateProperties![key] 
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
        
        // Update the event
        const newEvent = await this.eventColl.findOneAndUpdate(
            { _id: new ObjectId(eventId), troupeId: troupeId },
            eventUpdate,
            { returnDocument: "after" }
        );
        assert(newEvent, "Failed to update event");

        // Update member points for types that the event's start date is in range for
        if(updateMemberPoints) {
            const $inc: UpdateOperator<MemberSchema, "$inc"> = {};

            Object.keys(troupe.pointTypes)
                .filter(pt => troupe.pointTypes[pt].startDate <= startDate && startDate <= troupe.pointTypes[pt].endDate)
                .forEach(pt => { $inc[`points.${pt}`] = value - oldEvent.value });

            const membersToUpdate = await this.eventsAttendedColl
                .find({ troupeId, [`events.${eventId}`]: { $exists: true } }).toArray()
                .then(ea => ea.map(e => new ObjectId(e.memberId)));
            
            const updatePoints = await this.audienceColl.updateMany({ troupeId, _id: { $in: membersToUpdate }}, { $inc });
            assert(updatePoints.matchedCount == updatePoints.modifiedCount, "Failed to update member points");
        }

        // Update the events attended buckets
        if(updateEventsAttended || updateMemberPoints) {
            const updateEventsAttended = await this.eventsAttendedColl.updateMany(
                { troupeId, [`events.${eventId}`]: { $exists: true } },
                eventsAttendedUpdate,
            );
            assert(updateEventsAttended.matchedCount == updateEventsAttended.modifiedCount, "Failed to update events attended");
        }

        // Return public facing version of the new event
        return this.getEvent(newEvent);
    }

    /**
     * Deletes an event in the given troupe. 
     * 
     * Wait until next sync to:
     * - Update member points for types that the event is in data range for*
     */
    async deleteEvent(troupeId: string, eventId: string): Promise<void> {
        const [troupe, event] = await Promise.all([
            this.getTroupeSchema(troupeId, true), 
            this.getEventSchema(troupeId, eventId)
        ]);
        assert(!troupe.syncLock, new ClientError("Cannot delete event while sync is in progress"));

        // Update member points for types that the event is in data range for
        const $inc: UpdateOperator<MemberSchema, "$inc"> = {};

        Object.keys(troupe.pointTypes)
            .filter(pt => troupe.pointTypes[pt].startDate <= event.startDate && event.startDate <= troupe.pointTypes[pt].endDate)
            .forEach(pt => { $inc[`points.${pt}`] = -event.value });

        const membersToUpdate = await this.eventsAttendedColl
            .find({ troupeId, [`events.${eventId}`]: { $exists: true } }).toArray()
            .then(ea => ea.map(e => new ObjectId(e.memberId)));

        const updatePoints = await this.audienceColl.updateMany({ troupeId, _id: { $in: membersToUpdate }}, { $inc });
        assert(updatePoints.matchedCount == updatePoints.modifiedCount, "Failed to update member points");

        // Remove event from events attended
        const updateEventsAttended = await this.eventsAttendedColl.updateMany(
            { troupeId },
            { $unset: { [`events.${eventId}`]: "" } },
        );
        assert(updateEventsAttended.acknowledged, "Failed to update events attended");

        // Delete the event
        const deletedEvent = await this.eventColl.findOneAndDelete({ _id: new ObjectId(eventId), troupeId });
        assert(deletedEvent, new ClientError("Failed to delete event"));
    }

    /**
     * Creates and returns a new event type in the given troupe. 
     * 
     * Wait until next sync to:
     * - Obtain the events from source folders for the event type
     */
    async createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<EventType> {

        // Ensure given source folder URIs are valid Google Drive folders
        request.sourceFolderUris.forEach((uri) => assert(
            DRIVE_FOLDER_REGEX.test(uri), 
            new ClientError("Invalid source URI in request")
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
        assert(insertResult.matchedCount == 1, new ClientError("Invalid troupe or max event types reached"));
        assert(insertResult.modifiedCount == 1, "Unable to create event type");
        return this.getEventType(type);
    }

    /** Retrieves event type or parses existing event type into public format */
    async getEventType(eventType: string | WithId<EventTypeSchema>, troupeId?: string): Promise<EventType> {
        assert(typeof eventType != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event type."))
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
     * Updates event type in the given troupe and returns event type in public format.
     * 
     * Wait until next sync to:
     * - Retrieve events and attendees from the updated source folder URIs
     */ 
    async updateEventType(troupeId: string, eventTypeId: string, request: UpdateEventTypeRequest): Promise<EventType> {

        // Ensure given source folder URIs are valid Google Drive folders
        request.addSourceFolderUris?.forEach((uri) => assert(
            DRIVE_FOLDER_REGEX.test(uri), 
            new ClientError("Invalid source URI in request")
        ));

        const troupe = await this.getTroupeSchema(troupeId, true);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(!troupe.syncLock, new ClientError("Cannot update event type while sync is in progress"));
        assert(eventType, new ClientError("Unable to find event type"));

        const eventTypeUpdate = { 
            $set: {} as UpdateOperator<TroupeSchema, "$set">, 
            $unset: {} as UpdateOperator<TroupeSchema, "$unset">,
            $push: {} as UpdateOperator<TroupeSchema, "$push">,
            $pull: {} as UpdateOperator<TroupeSchema, "$pull">
        };

        const eventUpdate = {
            $set: {} as UpdateOperator<EventSchema, "$set">,
        };
        let updateEvents = false;

        eventTypeUpdate.$set.lastUpdated = new Date();

        if(request.title) {
            eventTypeUpdate.$set["eventTypes.$[type].title"] = request.title;
            eventUpdate.$set.eventTypeTitle = request.title;
            updateEvents = true;
        }

        if(request.value) {
            eventTypeUpdate.$set["eventTypes.$[type].value"] = request.value;

            // Update member points for attendees of events with the corresponding type
            // Aggregate in the future: https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/#use--lookup-with--mergeobjects
            const events = await this.eventColl.find({ troupeId, eventTypeId }).toArray();
            const members = await this.audienceColl.find({ troupeId }).toArray();
            const eventsAttended = await this.eventsAttendedColl.find({ troupeId }).toArray();

            const eventToPointTypesMap: { [eventId: string]: string[] } = {};
            const eventIds: string[] = [];
            
            // Build the event to point types map
            events.forEach(event => {
                eventIds.push(event._id.toHexString());
                Object.keys(troupe.pointTypes)
                    .filter(pt => troupe.pointTypes[pt].startDate <= event.startDate && event.startDate <= troupe.pointTypes[pt].endDate)
                    .forEach(pt => { 
                        const eventId = event._id.toHexString();
                        eventToPointTypesMap[eventId] 
                            ? eventToPointTypesMap[eventId].push(pt) 
                            : eventToPointTypesMap[eventId] = [pt];
                    });
            });

            // Update members based on events attended
            const bulkEventsAttendedUpdate: AnyBulkWriteOperation<EventsAttendedBucketSchema>[] = [];
            eventsAttended.forEach(bucket => {
                const member = members.find(m => m._id.toHexString() == bucket.memberId);
                if(!member) return;

                const bucketUpdate: UpdateOperator<EventsAttendedBucketSchema, "$set"> = {};

                // Only iterate through event IDs in the map
                for(const eventId in eventToPointTypesMap) {
                    const event = bucket.events[eventId];
                    if(event && event.typeId == eventTypeId) {
                        bucketUpdate[`events.${eventId}.value`] = request.value!;

                        // Update the member's points for each point type
                        for(const pt of eventToPointTypesMap[eventId]) {
                            const prev = member.points[pt];
                            member.points[pt] += request.value! - eventType.value;
                        }
                    }
                }

                bulkEventsAttendedUpdate.push({
                    updateOne: {
                        filter: { _id: bucket._id },
                        update: { $set: bucketUpdate }
                    }
                });
            });

            // Perform database update
            const eventsAttendedUpdate = await this.eventsAttendedColl.bulkWrite(bulkEventsAttendedUpdate);
            assert(eventsAttendedUpdate.isOk(), "Failed to update events attended");

            const bulkAudienceUpdate = members.map(member => ({
                updateOne: {
                    filter: { _id: member._id },
                    update: { $set: member },
                }
            } as AnyBulkWriteOperation<MemberSchema>));
            const audienceUpdate = await this.audienceColl.bulkWrite(bulkAudienceUpdate);
            assert(audienceUpdate.isOk(), "Failed to update member points");

            eventUpdate.$set.value = request.value;
            updateEvents = true;
        }

        // Update source uris, ignoring duplicates, existing source folder URIs, and URIs to be removed
        const newUris = request.addSourceFolderUris?.filter(
            (uri, index) => request.addSourceFolderUris!.indexOf(uri) == index 
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
        ).then(troupe => troupe?.eventTypes.find((et) => et._id.toHexString() == eventTypeId));
        assert(newEventType, "Failed to update event type");

        if(updateEvents) await this.eventColl.updateMany({ troupeId, eventTypeId }, eventUpdate);

        return this.getEventType(newEventType);
    }

    /** Deletes an event type in the given troupe. */
    async deleteEventType(troupeId: string, eventTypeId: string): Promise<void> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot delete event type while sync is in progress"));

        // Update events
        const updateEventResult = await this.eventColl.updateMany(
            { troupeId, eventTypeId },
            { $unset: { eventTypeId: "" } }
        );
        assert(updateEventResult.acknowledged, "Failed to remove event type from events");

        // Update events attended
        const bulkEventsAttendedUpdate: AnyBulkWriteOperation<EventsAttendedBucketSchema>[] = [];
        const buckets = await this.eventsAttendedColl.find({ troupeId }).toArray();
        buckets.forEach(bucket => {
            const bucketUpdate: UpdateOperator<EventsAttendedBucketSchema, "$unset"> = {};
            for(const eventId in bucket.events) {
                if(bucket.events[eventId].typeId == eventTypeId) {
                    bucketUpdate[`events.${eventId}`] = "";
                }
            }
            bulkEventsAttendedUpdate.push({
                updateOne: {
                    filter: { _id: bucket._id },
                    update: { $unset: bucketUpdate }
                }
            });
        });

        const updateEventsUpdate = await this.eventsAttendedColl.bulkWrite(bulkEventsAttendedUpdate);
        assert(updateEventsUpdate.isOk(), "Failed to remove event type from events attended");

        // Remove the event type from the troupe
        const deleteEventTypeResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId) },
            { $pull: { eventTypes: { _id: new ObjectId(eventTypeId) }}}
        );
        assert(deleteEventTypeResult.matchedCount, new ClientError("Event type not found in troupe"));
        assert(deleteEventTypeResult.modifiedCount, "Failed to delete event type");
    }

    /** Creates and returns a new member in the given troupe. */
    async createMember(troupeId: string, request: CreateMemberRequest): Promise<Member> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot create member while sync is in progress"));

        const properties: VariableMemberProperties = {};

        for(const prop in troupe.memberPropertyTypes) {
            assert(prop in request.properties, new ClientError("Missing required member property"));
            assert(verifyApiMemberPropertyType(request.properties[prop].value, troupe.memberPropertyTypes[prop]), 
                new ClientError("Invalid member property type"));
            properties[prop] = { value: request.properties[prop].value, override: true };
        }

        const points: VariableMemberPoints = {};

        for(const pt in troupe.pointTypes) { points[pt] = 0 }

        const member: MemberSchema = {
            troupeId,
            lastUpdated: new Date(),
            properties: properties as BaseMemberProperties & VariableMemberProperties,
            points: points as BaseMemberPoints & VariableMemberPoints,
        }

        const insertedMember = await this.audienceColl.insertOne(member);
        assert(insertedMember.acknowledged, "Failed to insert member");

        return this.getMember({ ...member, _id: insertedMember.insertedId });
    }

    /** Retrieve member in public format. */
    async getMember(member: string | WithId<MemberSchema>, troupeId?: string): Promise<Member> {
        assert(typeof member != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."))
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
        };
    }

    /** Retrieve all members in public format */ 
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
        assert(!troupe.syncLock, new ClientError("Cannot update member while sync is in progress"));

        const memberUpdate = {
            $set: {} as SetOperator<MemberSchema>,
            $unset: {} as UnsetOperator<MemberSchema>
        };

        memberUpdate.$set.lastUpdated = new Date();

        // Update existing properties for the member
        if(request.updateProperties) {
            for(const key in request.updateProperties) {
                const newValue = request.updateProperties[key];
                assert(newValue, new ClientError("Invalid property ID"));

                // Update the property if it's not to be removed
                if(!request.removeProperties?.includes(key)) {

                    // Check if the value is valid and update the property
                    if(request.updateProperties[key].value) {
                        const propertyType = troupe.memberPropertyTypes[key].slice(0, -1);

                        if(propertyType == "date") {
                            const newDate = new Date(newValue.value as string);
                            assert(typeof newValue.value == "string" && newDate.toString() != "Invalid Date", new ClientError(`Invalid input: ${key}`));
                            memberUpdate.$set[`properties.${key}.value`] = newDate;
                        } else {
                            assert(typeof newValue.value == propertyType, new ClientError(`Invalid input: ${key}`));
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
                if(troupe.memberPropertyTypes[key].endsWith("!")) {
                    throw new ClientError("Cannot remove required property");
                }
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
     * Deletes a member in the given troupe. Member may still be generated on sync; 
     * this removes the existing data associated with a member. 
     */
    async deleteMember(troupeId: string, memberId: string): Promise<void> {
        const res = await Promise.all([
            this.audienceColl.deleteOne({ _id: new ObjectId(memberId), troupeId }),
            this.eventsAttendedColl.deleteMany({ troupeId, memberId })
        ]);
        assert(res.every(r => r.acknowledged), "Failed to delete member data");
    }

    /** 
     * Places troupe into the sync queue if the lock is disabled. If no ID is provided,
     * all troupes with disabled sync locks are placed into the queue.
     */
    async initiateSync(troupeId?: string) {

    }
}