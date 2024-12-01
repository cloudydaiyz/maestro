import assert from "assert";
import { PublicEvent, UpdateEventRequest } from "../../../types/api-types";
import { TroupeLimitSpecifier } from "../../../types/service-types";
import { ApiRequestBuilder, DbWriteRequest } from "../base";
import { ClientError } from "../../../util/error";
import { AnyBulkWriteOperation, ObjectId, UpdateManyModel, UpdateOneModel, WithId } from "mongodb";
import { EventsAttendedBucketSchema, EventSchema, MemberSchema, TroupeSchema } from "../../../types/core-types";
import { request } from "http";
import { UpdateOperator } from "../../../types/util-types";
import { AUDIENCE_COLL, EVENT_COLL, EVENT_DATA_SOURCE_REGEX, EVENT_DATA_SOURCES, EVENTS_ATTENDED_COLL } from "../../../util/constants";

type EventRequestDbTypes = EventSchema | EventsAttendedBucketSchema | MemberSchema;
type EventDbUpdate = { 
    $set: UpdateOperator<EventSchema, "$set">, 
    $unset: UpdateOperator<EventSchema, "$unset">,
};

export class UpdateEventRequestBuilder extends ApiRequestBuilder<UpdateEventRequest & { eventId: string }, WithId<EventSchema>> {
    troupe?: WithId<TroupeSchema>;
    oldEvents?: WithId<EventSchema>[];

    /** Event IDs mapped to a list of attendee IDs for that event */
    oldEventAttendees?: { [eventId: string]: ObjectId[] };
    
    async readData(): Promise<void> {
        assert(this.troupeId, new ClientError("Invalid state; no troupe ID specified"));

        // Check if this operation is within the troupe's limits
        const withinLimits = await this.limitService.withinTroupeLimits(
            this.troupeId, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        // Ensure each request is valid
        for(const request of this.requests) {
            assert(
                !request.value || !request.eventTypeId, 
                new ClientError("Cannot define event type and value at same time for event")
            );
        }

        // Obtain troupe and event information
        const eventIds = this.requests.map(r => new ObjectId(r.eventId));
        this.troupe = await this.getTroupeSchema(this.troupeId, true);
        this.oldEvents = await this.eventColl.find({ _id: { $in: eventIds } }).toArray();
        assert(this.oldEvents.length == this.requests.length, new ClientError("One or more invalid event IDs"));
        assert(!this.troupe.syncLock, new ClientError("Cannot update event while sync is in progress"));

        // Retrieve the attendees for each event from the events attended collection
        this.oldEventAttendees = {};
        for(const event of this.oldEvents) {
            const eventId = event._id.toHexString();
            const membersToUpdate = await this.eventsAttendedColl
                .find({ [`events.${eventId}`]: { $exists: true } }).toArray()
                .then(ea => ea.map(e => new ObjectId(e.memberId)));
            this.oldEventAttendees[eventId] = membersToUpdate;
        }
    }

    processRequests(): [TroupeLimitSpecifier, DbWriteRequest<EventRequestDbTypes>[]] {
        assert(this.troupe, "Invalid state; no troupe ID specified");
        assert(this.oldEvents, "Invalid state; old events not specified");
        assert(this.oldEventAttendees, "Invalid state; old event attendees not specified");
        const troupe = this.troupe;

        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };
        const writeRequests: DbWriteRequest<EventRequestDbTypes>[] = [];

        for(let i = 0; i < this.requests.length; i++) {
            const request = this.requests[i];
            const eventId = request.eventId;
            const oldEvent = this.oldEvents[i];

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

            const audienceUpdate = {
                $inc: {} as UpdateOperator<MemberSchema, "$inc">,
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
                updateProperties(request, oldEvent, eventUpdate);
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

            writeRequests.push({
                collection: EVENT_COLL,
                request: {
                    filter: { _id: new ObjectId(eventId) },
                    update: eventUpdate,
                }
            });

            if(updateEventsAttended) {
                writeRequests.push({
                    collection: EVENTS_ATTENDED_COLL,
                    request: {
                        filter: { eventId },
                        update: eventsAttendedUpdate,
                    }
                });
            }

            if(updateMemberPoints) {
                writeRequests.push({
                    collection: AUDIENCE_COLL,
                    request: {
                        filter: { _id: { $in: this.oldEventAttendees[eventId] }},
                        update: audienceUpdate,
                    }
                })
            }
        }
        
        return [limitSpecifier, writeRequests];
    }

    async writeProcessedRequests(writeRequests: DbWriteRequest<EventRequestDbTypes>[]): Promise<WithId<EventSchema>[]> {
        const eventUpdates: AnyBulkWriteOperation<EventSchema>[] = [];
        const eventsAttendedUpdates: AnyBulkWriteOperation<EventsAttendedBucketSchema>[] = [];
        const audienceUpdates: AnyBulkWriteOperation<MemberSchema>[] = [];

        writeRequests.forEach(req => {
            if(req.collection == EVENT_COLL) {
                eventUpdates.push({ updateOne: req.request as UpdateOneModel<EventSchema> });
            } else if(req.collection == EVENTS_ATTENDED_COLL) {
                eventsAttendedUpdates.push({ updateMany: req.request as UpdateManyModel<EventsAttendedBucketSchema> });
            } else if(req.collection == AUDIENCE_COLL) {
                audienceUpdates.push({ updateMany: req.request as UpdateManyModel<MemberSchema> });
            }
        });

        const res1 = await this.eventColl.bulkWrite(eventUpdates);
        assert(
            res1.isOk(), 
            "Unable to perform bulk write request. Errors: " + 
                res1.getWriteErrors().map(err => err.errmsg).join('\n')
        );
        
        if(eventsAttendedUpdates.length > 0) {
            const res2 = await this.eventsAttendedColl.bulkWrite(eventsAttendedUpdates);
            assert(
                res2.isOk(), 
                "Unable to perform bulk write request. Errors: " + 
                    res2.getWriteErrors().map(err => err.errmsg).join('\n')
            );
        }
        
        if(audienceUpdates.length > 0) {
            const res3 = await this.audienceColl.bulkWrite(audienceUpdates);
            assert(
                res3.isOk(), 
                "Unable to perform bulk write request. Errors: " + 
                    res3.getWriteErrors().map(err => err.errmsg).join('\n')
            );
        }

        // Retrieve the new events, and sort them in order of their appearance in the event updates
        const eventIds = this.requests.map(r => new ObjectId(r.eventId));
        const newEvents = await this.eventColl.find({ _id: { $in: eventIds } }).toArray();
        const newEventsSortIndicies: { [eventId: string]: number } = {}
        for(const e of newEvents) {
            let eventId = e._id.toHexString();
            let value = Infinity;
            for(let i = 0; i < eventUpdates.length; i++) {
                const eu = eventUpdates[i] as { updateOne: UpdateOneModel<EventSchema> };

                // Thanks TypeScript...
                const id = eu.updateOne.filter._id;
                if(id !== undefined && (id as ObjectId).toHexString() == eventId) {
                    value = i;
                }
            }
            newEventsSortIndicies[eventId] = value;
        };
        newEvents.sort((eventA, eventB) => newEventsSortIndicies[eventA._id.toHexString()] - newEventsSortIndicies[eventB._id.toHexString()]);

        return newEvents;
    }
}

function updateProperties(
    request: UpdateEventRequest & { eventId: string },
    oldEvent: WithId<EventSchema>,
    eventUpdate: EventDbUpdate,
) {
    for(const key in request.updateProperties) {
        assert(key in oldEvent.fieldToPropertyMap, new ClientError(`Invalid field ID ${key}`));

        // Invariant: At most one unique property per field
        if(!(request.removeProperties?.includes(key))) {
            const numNonUniqueProperties = Object.values(oldEvent.fieldToPropertyMap)
                .reduce(
                    (acc, val) => {
                        if(
                            val.property &&
                            val.property == request.updateProperties![key].property
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