import { AnyBulkWriteOperation, ObjectId, UpdateManyModel, UpdateOneModel, WithId } from "mongodb";
import { UpdateEventTypeRequest } from "../../../types/api-types";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberSchema, TroupeSchema } from "../../../types/core-types";
import { ApiRequestBuilder, DbWriteRequest } from "../base";
import { TroupeLimitSpecifier } from "../../../types/service-types";
import assert from "assert";
import { AUDIENCE_COLL, GDRIVE_FOLDER_REGEX, EVENT_COLL, EVENTS_ATTENDED_COLL, TROUPE_COLL } from "../../../util/constants";
import { ClientError } from "../../../util/error";
import { UpdateOperator } from "../../../types/util-types";

type EventTypeRequestDbTypes = TroupeSchema | EventSchema | EventsAttendedBucketSchema | MemberSchema;
type EventTypeDbUpdate = { 
    $set: UpdateOperator<TroupeSchema, "$set">, 
    $unset: UpdateOperator<TroupeSchema, "$unset">,
    $push: UpdateOperator<TroupeSchema, "$push">,
    $pull: UpdateOperator<TroupeSchema, "$pull">
};
type EventDbUpdate = { 
    $set: UpdateOperator<EventSchema, "$set">, 
};

export class UpdateEventTypeRequestBuilder extends ApiRequestBuilder<UpdateEventTypeRequest & { eventTypeId: string }, WithId<EventTypeSchema>> {
    troupe?: WithId<TroupeSchema>;
    eventTypes?: WithId<EventTypeSchema>[];
    events?: WithId<EventSchema>[];
    members?: WithId<MemberSchema>[];
    eventsAttended?: WithId<EventsAttendedBucketSchema>[];
    
    async readData(): Promise<void> {
        assert(this.troupeId, "Invalid state; no troupe ID specified");
        const troupeId = this.troupeId;
        const eventTypeIds: string[] = [];
        this.troupe = await this.getTroupeSchema(troupeId, true);
        this.eventTypes = [];

        let valueUpdate = false;
        for(const request of this.requests) {

            // Ensure given source folder URIs are valid Google Drive folders
            request.addSourceFolderUris?.forEach((uri) => assert(
                GDRIVE_FOLDER_REGEX.test(uri), 
                new ClientError("Invalid source URI in request")
            ));

            const eventType = this.troupe.eventTypes.find((et) => et._id.toHexString() == request.eventTypeId);
            assert(!this.troupe.syncLock, new ClientError("Cannot update event type while sync is in progress"));
            assert(eventType, new ClientError("Unable to find event type"));

            this.eventTypes.push(eventType);
            eventTypeIds.push(request.eventTypeId);
            if(request.value) valueUpdate = true;
        }

        // Optimization: Only retrieve events, members, and events attended when 
        // value is updated for at least one request
        if(valueUpdate) {
            this.events = await this.eventColl.find(
                { troupeId, eventTypeId: { $in: eventTypeIds } }
            ).toArray();
            this.members = await this.audienceColl.find({ troupeId }).toArray();
            this.eventsAttended = await this.eventsAttendedColl.find({ troupeId }).toArray();
        }
    }

    processRequests(): [TroupeLimitSpecifier, DbWriteRequest<EventTypeRequestDbTypes>[]] {
        assert(this.troupe, "Invalid state; no troupe ID specified");
        assert(this.eventTypes, "Invalid state; old event types not specified");
        const troupe = this.troupe;
        const troupeId = troupe._id.toHexString();

        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };
        const writeRequests: DbWriteRequest<EventTypeRequestDbTypes>[] = [];

        for(let i = 0; i < this.requests.length; i++) {
            const request = this.requests[i];
            const eventType = this.eventTypes[i];
            const eventTypeId = request.eventTypeId;

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
                typeIdentifierUsed = true;

                eventUpdate.$set.eventTypeTitle = request.title;
                updateEvents = true;
            }
    
            if(request.value) {
                updateValue(
                    request,
                    troupe,
                    eventType,
                    this.events!,
                    this.members!,
                    this.eventsAttended!,
                    writeRequests,
                );
    
                eventTypeUpdate.$set["eventTypes.$[type].value"] = request.value;
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

            if(updateEvents) {
                writeRequests.push({
                    collection: EVENT_COLL,
                    request: {
                        filter: { troupeId, eventTypeId },
                        update: eventUpdate,
                    }
                });
            }

            writeRequests.push({
                collection: TROUPE_COLL,
                request: {
                    filter: { _id: troupe._id },
                    update: eventTypeUpdate,
                    arrayFilters: typeIdentifierUsed ? [{ "type._id": eventType._id }] 
                        : undefined,
                }
            });
        }
        return [limitSpecifier, writeRequests];
    }

    async writeProcessedRequests(writeRequests: DbWriteRequest<EventTypeRequestDbTypes>[]): Promise<WithId<EventTypeSchema>[]> {
        const troupeUpdates: AnyBulkWriteOperation<TroupeSchema>[] = [];
        const eventUpdates: AnyBulkWriteOperation<EventSchema>[] = [];
        const eventsAttendedUpdates: AnyBulkWriteOperation<EventsAttendedBucketSchema>[] = [];
        const audienceUpdates: AnyBulkWriteOperation<MemberSchema>[] = [];

        for(const req of writeRequests) {
            if(req.collection == TROUPE_COLL) {
                troupeUpdates.push({ updateOne: req.request as UpdateOneModel<TroupeSchema> });
            } else if(req.collection == EVENT_COLL) {
                eventUpdates.push({ updateMany: req.request as UpdateManyModel<EventSchema> });
            } else if(req.collection == EVENTS_ATTENDED_COLL) {
                eventsAttendedUpdates.push({ updateOne: req.request as UpdateOneModel<EventsAttendedBucketSchema> });
            } else if(req.collection == AUDIENCE_COLL) {
                audienceUpdates.push({ updateOne: req.request as UpdateOneModel<MemberSchema> });
            }
        }

        const res1 = await this.troupeColl.bulkWrite(troupeUpdates);
        assert(
            res1.isOk(), 
            "Unable to perform bulk write request. Errors: " + 
                res1.getWriteErrors().map(err => err.errmsg).join('\n')
        );

        if(eventUpdates.length > 0) {
            const res2 = await this.eventColl.bulkWrite(eventUpdates);
            assert(
                res2.isOk(), 
                "Unable to perform bulk write request. Errors: " + 
                    res2.getWriteErrors().map(err => err.errmsg).join('\n')
            );
        }
        
        if(eventsAttendedUpdates.length > 0) {
            const res3 = await this.eventsAttendedColl.bulkWrite(eventsAttendedUpdates);
            assert(
                res3.isOk(), 
                "Unable to perform bulk write request. Errors: " + 
                    res3.getWriteErrors().map(err => err.errmsg).join('\n')
            );
        }
        
        if(audienceUpdates.length > 0) {
            const res4 = await this.audienceColl.bulkWrite(audienceUpdates);
            assert(
                res4.isOk(), 
                "Unable to perform bulk write request. Errors: " + 
                    res4.getWriteErrors().map(err => err.errmsg).join('\n')
            );
        }

        const troupe = await this.getTroupeSchema(this.troupeId!, true);
        const eventTypeIds = this.requests.map(r => r.eventTypeId);
        const newEventTypes: WithId<EventTypeSchema>[] = [];
        for(const eventTypeId of eventTypeIds) {
            const eventType = troupe.eventTypes.find(et => et._id.toHexString() == eventTypeId);
            if(eventType) newEventTypes.push(eventType);
        }
        return newEventTypes;
    }
}

function updateValue(
    request: UpdateEventTypeRequest & { eventTypeId: string },
    troupe: WithId<TroupeSchema>,
    eventType: WithId<EventTypeSchema>,
    events: WithId<EventSchema>[],
    members: WithId<MemberSchema>[],
    eventsAttended: WithId<EventsAttendedBucketSchema>[],
    writeRequests: DbWriteRequest<EventTypeRequestDbTypes>[],
) : void {
    const eventTypeId = eventType._id.toHexString();
    
    // Update member points for attendees of events with the corresponding type
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

        writeRequests.push({
            collection: EVENTS_ATTENDED_COLL,
            request: {
                filter: { _id: bucket._id },
                update: { $set: bucketUpdate },
            }
        });
    });

    for(const member of members) {
        writeRequests.push({
            collection: AUDIENCE_COLL,
            request: {
                filter: { _id: member._id },
                update: { $set: member },
            }
        });
    }
}