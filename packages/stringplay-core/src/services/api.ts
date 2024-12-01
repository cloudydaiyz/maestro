// Implementation for client-facing controller methods

import { AnyBulkWriteOperation, ObjectId, UpdateFilter, WithId } from "mongodb";
import { DRIVE_FOLDER_REGEX, EVENT_DATA_SOURCES, EVENT_DATA_SOURCE_REGEX, MAX_EVENT_TYPES, MAX_POINT_TYPES, BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_MEMBER_PROPERTIES, DEFAULT_MATCHERS } from "../util/constants";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, VariableMemberProperties, MemberSchema, TroupeSchema, BaseMemberProperties, VariableMemberPoints, BaseMemberPoints, AttendeeSchema, FieldMatcher, TroupeLimit } from "../types/core-types";
import { Attendee, BulkUpdateEventRequest, BulkUpdateEventResponse, BulkUpdateEventTypeRequest, BulkUpdateEventTypeResponse, BulkUpdateMemberRequest, BulkUpdateMemberResponse, ConsoleData, CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, EventType, Member, PublicEvent, SpringplayApi, Troupe, TroupeDashboard, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "../types/api-types";
import { Mutable, SetOperator, UnsetOperator, UpdateOperator } from "../types/util-types";
import { BaseDbService } from "./base";
import { ClientError } from "../util/error";
import { arrayToObject, asyncArrayToObject, asyncObjectMap, objectMap, objectToArray, verifyApiMemberPropertyType } from "../util/helper";
import { toAttendee, toEventType, toMember, toPublicEvent, toTroupe, toTroupeDashboard, toTroupeLimits } from "../util/api-transform";
import { addToSyncQueue } from "../cloud/gcp";
import assert from "assert";
import { LimitService } from "./limits";
import { TroupeLimitSpecifier } from "../types/service-types";
import { UpdateTroupeRequestBuilder } from "./api/requests/update-troupe";
import { ApiRequestBuilder } from "./api/base";
import { UpdateEventRequestBuilder } from "./api/requests/update-event";

/**
 * Provides method definitions for the API. The structure of all given parameters will
 * not be checked (e.g. data type, constant range boundaries), but any checks requiring database access 
 * will be performed on each parameter.
 */
export class ApiService extends BaseDbService implements SpringplayApi {
    limitService!: LimitService;

    constructor() { 
        super();
        this.ready = this.init();
    }

    private async init() {
        this.limitService = await LimitService.create();
    }

    async getConsoleData(troupeId: string): Promise<ConsoleData> {
        const console: Partial<ConsoleData> = {};
        const res = await Promise.all([
            this.getDashboard(troupeId),
            this.getLimits(troupeId),
            this.getTroupe(troupeId),
            this.getEvents(troupeId),
            this.getEventTypes(troupeId),
            this.getAttendees(troupeId),
        ] as const);
        
        console.dashboard = res[0];
        console.limits = res[1];
        console.troupe = res[2];
        console.events = res[3];
        console.eventTypes = res[4];
        console.attendees = res[5];

        return console as ConsoleData;
    }

    async getDashboard(troupeId: string): Promise<TroupeDashboard> {
        const dashboard = await this.getDashboardSchema(troupeId);
        return toTroupeDashboard(dashboard, dashboard._id.toHexString());
    }

    async getLimits(troupeId: string): Promise<TroupeLimit> {
        const idTroupeLimits = await this.limitService.getTroupeLimits(troupeId);
        assert(idTroupeLimits, new ClientError(`Invalid troupe ID: ${troupeId}`));

        const { _id, ...troupeLimits } = idTroupeLimits;
        return toTroupeLimits(troupeLimits, idTroupeLimits._id.toHexString());
    }

    async getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe> {
        const troupeObj = typeof troupe == "string" 
            ? await this.getTroupeSchema(troupe, true)
            : troupe;

        return toTroupe(troupeObj, troupeObj._id.toHexString());
    }

    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<Troupe> {
        const [ newTroupe ] = await UpdateTroupeRequestBuilder.execute(troupeId, request);
        
        // Return public facing version of the new troupe
        return this.getTroupe(newTroupe);
    }

    async createEvent(troupeId: string, request: CreateEventRequest): Promise<PublicEvent> {

        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot create event while sync is in progress"));

        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == request.eventTypeId);
        const startDate = new Date(request.startDate);
        const eventDataSource = EVENT_DATA_SOURCE_REGEX.findIndex((regex) => regex.test(request.sourceUri!));
        assert(eventDataSource > -1, new ClientError("Invalid source URI"));
        assert(startDate.toString() != "Invalid Date", new ClientError("Invalid date"));
        assert(request.eventTypeId == undefined || request.value == undefined, new ClientError("Unable to define event type and value at same time for event."));
        assert(request.eventTypeId != undefined || request.value != undefined, new ClientError("One of event type and value must be defined for event."));
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
            eventTypeTitle: eventType?.title,
            value: request.value || eventType?.value as number,
            fieldToPropertyMap: {},
            synchronizedFieldToPropertyMap: {}
        }
        if(request.eventTypeId) event.eventTypeId = request.eventTypeId;
        
        // Perform database update
        const insertedEvent = await this.eventColl.insertOne(event);
        assert(insertedEvent.acknowledged, "Insert failed for event");

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return this.getEvent({...event, _id: insertedEvent.insertedId});
    }

    async createEvents(troupeId: string, requests: CreateEventRequest[]): Promise<PublicEvent[]> {

        // Create each event, ignoring the individual limit updates
        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const events: PublicEvent[] = [];
        for(const request of requests) {
            events.push(await this.createEvent(troupeId, request));
        }
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update the aggregated limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: requests.length * -1 }
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

        return events
    }

    async getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent> {
        assert(typeof event != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."));

        const eventObj = typeof event == "string" 
            ? await this.getEventSchema(troupeId!, event, true)
            : event;
        
        return toPublicEvent(eventObj, eventObj._id.toHexString());
    }

    async getEvents(troupeId: string): Promise<PublicEvent[]> {
        const events = await this.eventColl.find({ troupeId }).toArray();
        const parsedEvents = await Promise.all(events.map((e) => this.getEvent(e)));
        return parsedEvents;
    }

    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<PublicEvent> {
        const [ newEvent ] = await UpdateEventRequestBuilder.execute(troupeId, { eventId, ...request });

        // Return public facing version of the new event
        return this.getEvent(newEvent);
    }

    async updateEvents(troupeId: string, request: BulkUpdateEventRequest): Promise<BulkUpdateEventResponse> {

        // Append the event ID to each request and execute the request builder
        const modifiedEvents = objectToArray<BulkUpdateEventRequest, UpdateEventRequest & { eventId: string }>(
            request, 
            (eventId, request) => ({ eventId: eventId as string, ...request })
        );
        const responses = await UpdateEventRequestBuilder.bulkExecute(troupeId, modifiedEvents);

        // Convert the array of responses back to the bulk event response
        const bulkResponse = await asyncArrayToObject<WithId<EventSchema>, BulkUpdateEventResponse>(
            responses,
            async (newEvent) => [newEvent._id.toHexString(), await this.getEvent(newEvent, troupeId)]
        );
        return bulkResponse;
    }

    async deleteEvent(troupeId: string, eventId: string): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: 1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const [troupe, event] = await Promise.all([
            this.getTroupeSchema(troupeId, true), 
            this.getEventSchema(troupeId, eventId, true)
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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: 1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async deleteEvents(troupeId: string, eventIds: string[]): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: eventIds.length }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        await Promise.all(eventIds.map(id => this.deleteEvent(troupeId, id)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: eventIds.length }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async createEventType(troupeId: string, request: CreateEventTypeRequest): Promise<EventType> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return this.getEventType(type);
    }

    async createEventTypes(troupeId: string, requests: CreateEventTypeRequest[]): Promise<EventType[]> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: requests.length * -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const eventTypes = await Promise.all(requests.map(r => this.createEventType(troupeId, r)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: requests.length * -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return eventTypes;
    }

    async getEventType(eventType: string | WithId<EventTypeSchema>, troupeId?: string, troupe?: WithId<TroupeSchema>): Promise<EventType> {
        assert(typeof eventType != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event type."));
        
        const eventTypeObj = typeof eventType != "string" 
            ? eventType
            : troupe
            ? this.getEventTypeSchemaFromTroupe(troupe, eventType, true)
            : await this.getEventTypeSchema(troupeId!, eventType, true);
        
        return toEventType(eventTypeObj, eventTypeObj._id.toHexString());
    }

    async getEventTypes(troupeId: string): Promise<EventType[]> {
        const troupe = await this.getTroupeSchema(troupeId, true);

        const eventTypes = await Promise.all(
            troupe.eventTypes.map(et => this.getEventType(et))
        );

        return eventTypes;
    }

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
        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };

        const eventUpdate = {
            $set: {} as UpdateOperator<EventSchema, "$set">,
        };
        let updateEvents = false;
        let typeIdentifierUsed = false;

        eventTypeUpdate.$set.lastUpdated = new Date();

        if(request.title) {
            eventTypeUpdate.$set["eventTypes.$[type].title"] = request.title;
            eventUpdate.$set.eventTypeTitle = request.title;
            updateEvents = true;
            typeIdentifierUsed = true;
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
            if(bulkEventsAttendedUpdate.length > 0) {
                const eventsAttendedUpdate = await this.eventsAttendedColl.bulkWrite(bulkEventsAttendedUpdate);
                assert(eventsAttendedUpdate.isOk(), "Failed to update events attended");
            }

            const bulkAudienceUpdate = members.map(member => ({
                updateOne: {
                    filter: { _id: member._id },
                    update: { $set: member },
                }
            } as AnyBulkWriteOperation<MemberSchema>));

            if(bulkAudienceUpdate.length > 0) {
                const audienceUpdate = await this.audienceColl.bulkWrite(bulkAudienceUpdate);
                assert(audienceUpdate.isOk(), "Failed to update member points");
            }

            eventUpdate.$set.value = request.value;
            updateEvents = true;
            typeIdentifierUsed = true;
        }

        // Update source uris, ignoring duplicates, existing source folder URIs, and URIs to be removed
        const newUris = request.addSourceFolderUris?.filter(
            (uri, index) => request.addSourceFolderUris!.indexOf(uri) == index 
                && !eventType.sourceFolderUris.includes(uri)
                && !request.removeSourceFolderUris?.includes(uri)
        );

        newUris && newUris.length > 0 
            ? (eventTypeUpdate.$push["eventTypes.$[type].sourceFolderUris"] = { 
                $each: newUris 
            }) && (typeIdentifierUsed = true)
            : null;
        
        // Remove source uris
        const urisToRemove = request.removeSourceFolderUris?.filter(
            (uri, index) => request.removeSourceFolderUris?.indexOf(uri) == index
                && eventType.sourceFolderUris.includes(uri)
        );

        urisToRemove
            ? (eventTypeUpdate.$pull["eventTypes.$[type].sourceFolderUris"] = { 
                $in: urisToRemove
            }) && (typeIdentifierUsed = true)
            : null;

        // Check if this operation is within the troupe's limits
        const sourceFolderUrisLeft = (urisToRemove?.length || 0) - (newUris?.length || 0)
        if(sourceFolderUrisLeft > 0) {
            limitSpecifier.sourceFolderUrisLeft = sourceFolderUrisLeft;
        }

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(troupeId, limitSpecifier);
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        // Perform database update
        const newEventType = await this.troupeColl
            .findOneAndUpdate(
                { _id: new ObjectId(troupeId) },
                eventTypeUpdate,
                typeIdentifierUsed 
                    ? { 
                        arrayFilters: [{ "type._id": new ObjectId(eventTypeId) }], 
                        returnDocument: "after"
                    } 
                    : { returnDocument: "after" }
            )
            .then(troupe => troupe?.eventTypes.find(
                (et) => et._id.toHexString() == eventTypeId
            ));
        assert(newEventType, "Failed to update event type");

        if(updateEvents) {
            const modification = await this.eventColl.updateMany({ troupeId, eventTypeId }, eventUpdate);
            assert(modification.acknowledged, "Event update failed");
        }

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(troupeId, limitSpecifier);
        assert(limitsUpdated, "Failure updating limits for operation");

        return this.getEventType(newEventType);
    }

    async updateEventTypes(troupeId: string, request: BulkUpdateEventTypeRequest): Promise<BulkUpdateEventTypeResponse> {

        // Let the individual updates handle limits; it's more DB calls but each
        // event type update has to update the source folder uris as well, which
        // isn't known until update time. Need a better way to handle this in the
        // future.
        const response = await asyncObjectMap<BulkUpdateEventTypeRequest, BulkUpdateEventTypeResponse>(
            request, 
            async (eventTypeId, request) => [
                eventTypeId as string, 
                await this.updateEventType(troupeId, eventTypeId as string, request)
            ]
        );

        return response;
    }

    async deleteEventType(troupeId: string, eventTypeId: string): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: 1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

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

        if(bulkEventsAttendedUpdate.length > 0) {
            const updateEventsUpdate = await this.eventsAttendedColl.bulkWrite(bulkEventsAttendedUpdate);
            assert(updateEventsUpdate.isOk(), "Failed to remove event type from events attended");
        }

        // Remove the event type from the troupe
        const deleteEventTypeResult = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId) },
            { $pull: { eventTypes: { _id: new ObjectId(eventTypeId) }}}
        );
        assert(deleteEventTypeResult.matchedCount, new ClientError("Event type not found in troupe"));
        assert(deleteEventTypeResult.modifiedCount, "Failed to delete event type");

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: 1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async deleteEventTypes(troupeId: string, eventTypeIds: string[]): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: eventTypeIds.length }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        await Promise.all(eventTypeIds.map(id => this.deleteEventType(troupeId, id)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventTypesLeft: eventTypeIds.length }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async createMember(troupeId: string, request: CreateMemberRequest): Promise<Member> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot create member while sync is in progress"));

        const properties: VariableMemberProperties = {};

        for(const prop in troupe.memberPropertyTypes) {
            assert(prop in request.properties, new ClientError("Missing required member property"));
            assert(verifyApiMemberPropertyType(request.properties[prop], troupe.memberPropertyTypes[prop]), 
                new ClientError("Invalid member property type"));

            properties[prop] = { value: request.properties[prop], override: true };
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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return this.getMember({ ...member, _id: insertedMember.insertedId });
    }

    async createMembers(troupeId: string, requests: CreateMemberRequest[]): Promise<Member[]> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: requests.length * -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const members = await Promise.all(requests.map(r => this.createMember(troupeId, r)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: requests.length * -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return members;
    }

    async getMember(member: string | WithId<MemberSchema>, troupeId?: string): Promise<Member> {
        assert(typeof member != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."));

        const memberObj = typeof member == "string"
            ? await this.getMemberSchema(troupeId!, member, true)
            : member;

        return toMember(memberObj, memberObj._id.toHexString());
    }

    async getAttendee(member: string | WithId<AttendeeSchema>, troupeId?: string): Promise<Attendee> {
        assert(typeof member != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."));

        const attendeeObj = typeof member == "string"
            ? await this.getAttendeeSchema(troupeId!, member, true)
            : member;

        return toAttendee(attendeeObj, attendeeObj._id.toHexString());
    }

    async getAudience(troupeId: string): Promise<Member[]> {
        const audience = await this.audienceColl.find({ troupeId }).toArray();

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const newAudience = await Promise.all(audience.map(m => this.getMember(m)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        return newAudience;
    }

    async getAttendees(troupeId: string): Promise<Attendee[]> {
        const audience = await this.getAttendeeSchemas(troupeId, true);

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const newAudience = await Promise.all(audience.map(m => this.getAttendee(m)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        return newAudience;
    }

    async updateMember(troupeId: string, memberId: string, request: UpdateMemberRequest): Promise<Member> {
        
        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const [troupe, /* member */] = await Promise.all([
            this.getTroupeSchema(troupeId, true),
            // this.getMemberSchema(troupeId, memberId, true)
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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return this.getMember(newMember);
    }

    async updateMembers(troupeId: string, request: BulkUpdateMemberRequest): Promise<BulkUpdateMemberResponse> {
        
        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));
        
        const response = await asyncObjectMap<BulkUpdateMemberRequest, BulkUpdateMemberResponse>(
            request, 
            async (memberId, request) => [
                memberId as string, 
                await this.updateMember(troupeId, memberId as string, request)
            ]
        );

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return response;
    }

    async deleteMember(troupeId: string, memberId: string): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: 1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const res = await Promise.all([
            this.audienceColl.deleteOne({ _id: new ObjectId(memberId), troupeId }),
            this.eventsAttendedColl.deleteMany({ troupeId, memberId })
        ]);
        assert(res.every(r => r.acknowledged), "Failed to delete member data");

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: 1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async deleteMembers(troupeId: string, memberIds: string[]): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: memberIds.length }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        await Promise.all(memberIds.map(id => this.deleteMember(troupeId, id)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, membersLeft: memberIds.length }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }

    async initiateSync(troupeId: string): Promise<void> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { manualSyncsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Sync is already in progress"));
        await addToSyncQueue({ troupeId });

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { manualSyncsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
    }
}