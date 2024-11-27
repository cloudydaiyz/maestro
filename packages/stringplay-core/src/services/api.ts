// Implementation for client-facing controller methods

import { AnyBulkWriteOperation, ObjectId, UpdateFilter, WithId } from "mongodb";
import { DRIVE_FOLDER_REGEX, EVENT_DATA_SOURCES, EVENT_DATA_SOURCE_REGEX, MAX_EVENT_TYPES, MAX_POINT_TYPES, BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, MAX_MEMBER_PROPERTIES, DEFAULT_MATCHERS } from "../util/constants";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, VariableMemberProperties, MemberSchema, TroupeSchema, BaseMemberProperties, VariableMemberPoints, BaseMemberPoints, AttendeeSchema, FieldMatcher, TroupeLimit } from "../types/core-types";
import { Attendee, BulkUpdateEventRequest, BulkUpdateEventResponse, BulkUpdateEventTypeRequest, BulkUpdateEventTypeResponse, BulkUpdateMemberRequest, BulkUpdateMemberResponse, ConsoleData, CreateEventRequest, CreateEventTypeRequest, CreateMemberRequest, EventType, Member, PublicEvent, SpringplayApi, Troupe, TroupeDashboard, UpdateEventRequest, UpdateEventTypeRequest, UpdateMemberRequest, UpdateTroupeRequest } from "../types/api-types";
import { Mutable, SetOperator, UnsetOperator, UpdateOperator } from "../types/util-types";
import { BaseDbService } from "./base";
import { ClientError } from "../util/error";
import { asyncObjectMap, objectMap, verifyApiMemberPropertyType } from "../util/helper";
import { toAttendee, toEventType, toMember, toPublicEvent, toTroupe, toTroupeDashboard, toTroupeLimits } from "../util/api-transform";
import { addToSyncQueue } from "../cloud/gcp";
import assert from "assert";
import { LimitService } from "./limits";
import { TroupeLimitSpecifier } from "../types/service-types";

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

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const [
            dashboard,
            limits,
            troupe,
            events,
            eventTypes,
            attendees
        ] = await Promise.all([
            this.getDashboard(troupeId),
            this.getLimits(troupeId),
            this.getTroupe(troupeId),
            this.getEvents(troupeId),
            this.getEventTypes(troupeId),
            this.getAttendees(troupeId),
        ]);
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return {
            dashboard,
            limits,
            troupe,
            events,
            eventTypes,
            attendees
        };
    }

    async getDashboard(troupeId: string): Promise<TroupeDashboard> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const dashboardObj = await this.getDashboardSchema(troupeId);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

        return toTroupeDashboard(dashboardObj, dashboardObj._id.toHexString());
    }

    async getLimits(troupeId: string): Promise<TroupeLimit> {
        
        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const troupeLimits = await this.limitService.getTroupeLimits(troupeId);
        assert(troupeLimits, new ClientError(`Invalid troupe ID: ${troupeId}`));

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return toTroupeLimits(troupeLimits, troupeLimits._id.toHexString());
    }

    async getTroupe(troupe: string | WithId<TroupeSchema>): Promise<Troupe> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            typeof troupe == "string" ? troupe : troupe._id.toHexString(), 
            { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const troupeObj = typeof troupe == "string" 
            ? await this.getTroupeSchema(troupe, true)
            : troupe;
        
        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeObj._id.toHexString(), { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return toTroupe(troupeObj, troupeObj._id.toHexString());
    }

    async updateTroupe(troupeId: string, request: UpdateTroupeRequest): Promise<Troupe> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        assert(!troupe.syncLock, new ClientError("Cannot update troupe while sync is in progress"));

        // Prepare for the database update
        const troupeUpdate = { 
            $set: {} as UpdateOperator<TroupeSchema, "$set">, 
            $unset: {} as UpdateOperator<TroupeSchema, "$unset">,
        }
        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };

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
            const initialNumMemberProperties = Object.keys(troupe.memberPropertyTypes).length;
            let numMemberProperties = initialNumMemberProperties;

            // Ignore member properties to be removed and ensure no base member properties get updated
            for(const key in request.updateMemberProperties) {
                assert(
                    !(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new ClientError("Cannot modify base member properties")
                );
                
                if(!(request.removeMemberProperties?.includes(key))) {
                    troupeUpdate.$set[`memberPropertyTypes.${key}`] = request.updateMemberProperties[key];
                    if(!(key in troupe.memberPropertyTypes)) numMemberProperties++;
                }
            }

            assert(
                numMemberProperties <= MAX_MEMBER_PROPERTIES, 
                new ClientError(`Cannot have more than ${MAX_POINT_TYPES} member properties`)
            );

            const newLimit = initialNumMemberProperties - numMemberProperties;
            if(newLimit !== 0) {
                limitSpecifier.memberPropertyTypesLeft = newLimit;
            }
        }

        // Remove member properties & ensure no base member properties are requested for removal
        if(request.removeMemberProperties) {
            const initialNumMemberProperties = Object.keys(troupe.memberPropertyTypes).length;
            let numMemberProperties = Object.keys(troupe.memberPropertyTypes).length;

            for(const key of request.removeMemberProperties) {
                assert(
                    !(key in BASE_MEMBER_PROPERTY_TYPES), 
                    new ClientError("Cannot delete base member properties")
                );
                if(key in troupe.memberPropertyTypes) {
                    troupeUpdate.$unset[`memberPropertyTypes.${key}`] = "";
                    numMemberProperties--;
                }
            }

            const newLimit = initialNumMemberProperties - numMemberProperties;
            if(newLimit !== 0) {
                if(!limitSpecifier.memberPropertyTypesLeft) {
                    limitSpecifier.memberPropertyTypesLeft = 0;
                }
                limitSpecifier.memberPropertyTypesLeft += newLimit;
            }
        }

        // Update point types
        if(request.updatePointTypes) {
            const initialNumPointTypes = Object.keys(troupe.pointTypes).length;
            let numPointTypes = Object.keys(troupe.pointTypes).length;
            // let newPointTypes = troupe.pointTypes;

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
                // newPointTypes[key] = pointType;
            }
            assert(
                numPointTypes <= MAX_POINT_TYPES, 
                new ClientError(`Cannot have more than ${MAX_POINT_TYPES} point types`)
            );
            
            // *FUTURE: Update point calculations for members

            const newLimit = initialNumPointTypes - numPointTypes;
            if(newLimit !== 0) {
                limitSpecifier.pointTypesLeft = newLimit;
            }
        }

        // Remove point types
        if(request.removePointTypes) {
            const initialNumPointTypes = Object.keys(troupe.pointTypes).length;
            let numPointTypes = Object.keys(troupe.pointTypes).length;

            for(const key of request.removePointTypes) {
                assert(!(key in BASE_POINT_TYPES_OBJ), new ClientError("Cannot delete base point types"));
                if(key in troupe.pointTypes) {
                    troupeUpdate.$unset[`pointTypes.${key}`] = "";
                    numPointTypes++;
                }
            }

            const newLimit = initialNumPointTypes - numPointTypes;
            if(newLimit !== 0) {
                if(!limitSpecifier.pointTypesLeft) {
                    limitSpecifier.pointTypesLeft = 0;
                }
                limitSpecifier.pointTypesLeft += newLimit;
            }
        }

        if(request.updateFieldMatchers) {
            const initialNumMatchers = troupe.fieldMatchers.length;
            const updatedMatchers = structuredClone(troupe.fieldMatchers);

            for(let i = 0; i < request.updateFieldMatchers.length; i++) {
                const matcher = request.updateFieldMatchers[i];
                let unique = true;

                // Ensure uniqueness of regex and priority
                if(matcher) {
                    for(let j = 0; unique && j < request.updateFieldMatchers.length; j++) {
                        if(j == i) continue;
                        
                        // Check if this matcher is different from the other matcher
                        const otherMatcher: FieldMatcher | undefined = request.updateFieldMatchers[j] || troupe.fieldMatchers[j];
                        const diffFromOtherMatcher = matcher.fieldExpression != otherMatcher.fieldExpression
                            && matcher.priority != otherMatcher.priority;
                        unique = unique && (!otherMatcher || diffFromOtherMatcher);
                    }
                }

                // Add the matcher if it's unique
                if(matcher && unique) updatedMatchers.push(matcher);
            }

            // Ensure the field matchers have the correct ordering before storing
            updatedMatchers.sort((a, b) => a.priority - b.priority);
            troupeUpdate.$set.fieldMatchers = updatedMatchers;

            const newLimit = initialNumMatchers - updatedMatchers.length;
            if(newLimit) {
                limitSpecifier.fieldMatchersLeft = newLimit;
            }
        }

        if(request.removeFieldMatchers) {
            request.removeFieldMatchers.sort();
            const initialNumMatchers = troupe.fieldMatchers.length;
            const updatedMatchers = structuredClone(troupe.fieldMatchers);

            // Validate the remove field matchers
            for(let i = request.removeFieldMatchers.length - 1; i >= 0; i--) {
                const index = request.removeFieldMatchers[i];
                const indexOutOfRange = !(0 <= index && index < updatedMatchers.length);
                const indexNotUnique = index < request.removeFieldMatchers.length - 1 && index == index + 1;
                if(indexOutOfRange || indexNotUnique) {
                    request.removeFieldMatchers.slice(i, 1);
                }
            }

            // Remove the validated field matchers from the troupe
            for(let i = request.removeFieldMatchers.length - 1; i >= 0; i--) {
                const index = request.removeFieldMatchers[i];
                updatedMatchers.splice(index, 1);
            }
            troupeUpdate.$set.fieldMatchers = updatedMatchers;

            const newLimit = initialNumMatchers - updatedMatchers.length;
            if(newLimit) {
                if(!limitSpecifier.fieldMatchersLeft) {
                    limitSpecifier.fieldMatchersLeft = 0;
                }
                limitSpecifier.fieldMatchersLeft += newLimit;
            }
        }

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(troupeId, limitSpecifier);
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        // Perform database update
        const newTroupe = await this.troupeColl.findOneAndUpdate(
            { _id: new ObjectId(troupeId) }, 
            troupeUpdate,
            { returnDocument: "after" }
        );
        assert(newTroupe, "Failed to update troupe");
        // *FUTURE: Update members with the new point types

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(troupeId, limitSpecifier);
        assert(limitsUpdated, "Failure updating limits for operation");
        
        // Return public facing version of the new troupe
        return this.getTroupe(newTroupe);
    }

    async createEvent(troupeId: string, request: CreateEventRequest): Promise<PublicEvent> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

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

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: requests.length * -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const events = await Promise.all(requests.map(r => this.createEvent(troupeId, r)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1, eventsLeft: requests.length * -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return events
    }

    async getEvent(event: string | WithId<EventSchema>, troupeId?: string): Promise<PublicEvent> {
        assert(typeof event != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."));
        const tid = typeof event == "string" ? troupeId! : event.troupeId;

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            tid, { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));
        
        const eventObj = typeof event == "string" 
            ? await this.getEventSchema(troupeId!, event, true)
            : event;

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            tid, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
        
        return toPublicEvent(eventObj, eventObj._id.toHexString());
    }

    async getEvents(troupeId: string): Promise<PublicEvent[]> {

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const events = await this.eventColl.find({ troupeId }).toArray();

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const parsedEvents = await Promise.all(events.map((e) => this.getEvent(e)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return parsedEvents;
    }

    async updateEvent(troupeId: string, eventId: string, request: UpdateEventRequest): Promise<PublicEvent> {
        
        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));
        
        const [troupe, oldEvent] = await Promise.all([
            this.getTroupeSchema(troupeId, true),
            this.getEventSchema(troupeId, eventId, true)
        ]);
        assert(!troupe.syncLock, new ClientError("Cannot update event while sync is in progress"));
        assert(!request.value || !request.eventTypeId, new ClientError("Cannot define event type and value at same time for event"));

        // Initialize fields
        let value = request.value || oldEvent.value;
        let startDate = request.startDate ? new Date(request.startDate) : oldEvent.startDate;

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
                assert(key in oldEvent.fieldToPropertyMap, new ClientError(`Invalid field ID ${key}`));

                // Invariant: At most one unique property per field
                if(!(request.removeProperties?.includes(key))) {
                    const numNonUniqueProperties = Object.values(oldEvent.fieldToPropertyMap)
                        .reduce(
                            (acc, val) => {
                                if(val.property 
                                    && val.property == request.updateProperties![key].property
                                ) {
                                    return acc + 1;
                                }
                                return acc;
                            },
                            0
                        );
                    assert(numNonUniqueProperties == 0, new ClientError(`Property for field ${key} already present in another field.`));
                    
                    eventUpdate.$set[`fieldToPropertyMap.${key}.property`] = request.updateProperties[key].property;
                    eventUpdate.$set[`fieldToPropertyMap.${key}.override`] = request.updateProperties[key].override;
                }
            }
        }

        // Remove properties in the field to property map of the event
        if(request.removeProperties) {
            for(const key of request.removeProperties) {
                if(key in oldEvent.fieldToPropertyMap) {
                    eventUpdate.$set[`fieldToPropertyMap.${key}.property`] = null;
                    eventUpdate.$set[`fieldToPropertyMap.${key}.override`] = false;
                }
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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        // Return public facing version of the new event
        return this.getEvent(newEvent);
    }

    async updateEvents(troupeId: string, request: BulkUpdateEventRequest): Promise<BulkUpdateEventResponse> {

        // Update limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const response = asyncObjectMap<BulkUpdateEventRequest, BulkUpdateEventResponse>(
            request, 
            async (eventId, request) => [
                eventId as string, 
                await this.updateEvent(troupeId, eventId as string, request)
            ]
        );
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { modifyOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

        return response;
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
        const eventTypes = Promise.all(requests.map(r => this.createEventType(troupeId, r)));
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

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId || troupe?._id.toHexString() || "", { getOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));
        
        const eventTypeObj = typeof eventType != "string" 
            ? eventType
            : troupe
            ? this.getEventTypeSchemaFromTroupe(troupe, eventType, true)
            : await this.getEventTypeSchema(troupeId!, eventType, true);
        
        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId || troupe?._id.toHexString() || "", { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");
        
        return toEventType(eventTypeObj, eventTypeObj._id.toHexString());
    }

    async getEventTypes(troupeId: string): Promise<EventType[]> {
        const troupe = await this.getTroupeSchema(troupeId, true);

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            troupeId, { getOperationsLeft: troupe.eventTypes.length * -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const eventTypes = await Promise.all(
            troupe.eventTypes.map(et => this.getEventType(et._id.toHexString()))
        );
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: troupe.eventTypes.length * -1 }
        );
        assert(limitsUpdated, "Failure updating limits for operation");

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
        const response = asyncObjectMap<BulkUpdateEventTypeRequest, BulkUpdateEventTypeResponse>(
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
        const members = Promise.all(requests.map(r => this.createMember(troupeId, r)));
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

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            typeof member == "string" ? troupeId! : member.troupeId, 
            { getOperationsLeft: -1 },
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

        const memberObj = typeof member == "string"
            ? await this.getMemberSchema(troupeId!, member, true)
            : member;
        
        return toMember(memberObj, memberObj._id.toHexString());
    }

    async getAttendee(member: string | WithId<AttendeeSchema>, troupeId?: string): Promise<Attendee> {
        assert(typeof member != "string" || troupeId != null, 
            new ClientError("Must have a troupe ID to retrieve event."));

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            typeof member == "string" ? troupeId! : member.troupeId, 
            { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

        const attendeeObj = typeof member == "string"
            ? await this.getAttendeeSchema(troupeId!, member, true)
            : member;
        
        return toAttendee(attendeeObj, attendeeObj._id.toHexString());
    }

    async getAudience(troupeId: string): Promise<Member[]> {

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

        const audience = await this.audienceColl.find({ troupeId }).toArray();

        this.limitService.toggleIgnoreTroupeLimits(troupeId, true);
        const newAudience = await Promise.all(audience.map(m => this.getMember(m)));
        this.limitService.toggleIgnoreTroupeLimits(troupeId, false);

        return newAudience;
    }

    async getAttendees(troupeId: string): Promise<Attendee[]> {

        // Update limits
        const limitsUpdated = await this.limitService.incrementTroupeLimits(
            troupeId, { getOperationsLeft: -1 }
        );
        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));

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
        
        const response = asyncObjectMap<BulkUpdateMemberRequest, BulkUpdateMemberResponse>(
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