import { Document, ObjectId, UpdateOneModel, WithId } from "mongodb";
import { Troupe, UpdateTroupeRequest } from "../../../../types/api-types";
import { TroupeLimitSpecifier } from "../../../../types/service-types";
import { ApiRequestBuilder, DbWriteRequest } from "../../base";
import assert from "assert";
import { ClientError } from "../../../../util/error";
import { EventSchema, FieldMatcher, TroupeSchema } from "../../../../types/core-types";
import { UpdateOperator } from "../../../../types/util-types";
import { BASE_MEMBER_PROPERTY_TYPES, MAX_MEMBER_PROPERTIES, MAX_POINT_TYPES, BASE_POINT_TYPES_OBJ, TROUPE_COLL } from "../../../../util/constants";

type TroupeDbUpdate = { 
    $set: UpdateOperator<TroupeSchema, "$set">, 
    $unset: UpdateOperator<TroupeSchema, "$unset">,
};

export class UpdateTroupeRequestBuilder extends ApiRequestBuilder<UpdateTroupeRequest, WithId<TroupeSchema>> {
    troupe?: WithId<TroupeSchema>;
    originEvents?: WithId<EventSchema>[];

    async readData(): Promise<void> {
        assert(this.troupeId, "Invalid state; no troupe ID specified");
        const troupe = await this.getTroupeSchema(this.troupeId, true);

        // Ensures specified origin events exists before setting it
        this.originEvents = [];
        this.requests.forEach(async (request, i) => {
            if(request.originEventId) {
                const event = await this.eventColl.findOne({ _id: new ObjectId(request.originEventId) });
                assert(event, new ClientError("Unable to find specified origin event"));
                this.originEvents![i] = event;
            }
        });

        assert(!troupe.syncLock, new ClientError("Cannot update troupe while sync is in progress"));
    }

    processRequests(): [TroupeLimitSpecifier, DbWriteRequest<TroupeSchema>[]] {
        assert(this.troupe, "Invalid state; no troupe ID specified");
        const troupe = this.troupe;

        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };
        const writeRequests: DbWriteRequest<TroupeSchema>[] = [];

        this.requests.forEach(request => {

            // Prepare for the database update
            const troupeUpdate = { 
                $set: {} as UpdateOperator<TroupeSchema, "$set">, 
                $unset: {} as UpdateOperator<TroupeSchema, "$unset">,
            }
            const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };

            // Set the name and the last updated
            troupeUpdate.$set.lastUpdated = new Date();
            request.name ? troupeUpdate.$set.name = request.name : null;

            // Delegate request members to its proper handler
            if(request.originEventId) {
                troupeUpdate.$set.originEventId = request.originEventId;
            }
            if(request.updateMemberProperties) {
                updateMemberProperties(request, troupe, troupeUpdate, limitSpecifier);
            }
            if(request.removeMemberProperties) {
                removeMemberProperties(request, troupe, troupeUpdate, limitSpecifier);
            }
            if(request.updatePointTypes) {
                updatePointTypes(request, troupe, troupeUpdate, limitSpecifier);
            }
            if(request.removePointTypes) {
                removePointTypes(request, troupe, troupeUpdate, limitSpecifier);
            }
            if(request.updateFieldMatchers) {
                updateFieldMatchers(request, troupe, troupeUpdate, limitSpecifier);
            }
            if(request.removeFieldMatchers) {
                removeFieldMatchers(request, troupe, troupeUpdate, limitSpecifier);
            }

            writeRequests.push({
                collection: TROUPE_COLL,
                request: {
                    filter: { _id: new ObjectId(this.troupeId!), troupeId: this.troupeId! },
                    update: troupeUpdate,
                },
            });
        });

        return [limitSpecifier, writeRequests];
    }

    async writeProcessedRequests(writeRequests: DbWriteRequest<TroupeSchema>[]): Promise<WithId<TroupeSchema>[]> {
        assert(this.troupeId, "Invalid state; no troupe ID specified");

        const res = await this.troupeColl.bulkWrite(writeRequests.map(r => (
            { updateOne: r.request as UpdateOneModel<TroupeSchema> }
        )));
        assert(
            res.isOk(), 
            "Unable to perform bulk write request. Errors: " + 
                res.getWriteErrors().map(err => err.errmsg).join('\n')
        );

        // NOTE: Add functionality for bulk update in the future when necessary
        const newTroupe = await this.getTroupeSchema(this.troupeId, true);

        return [ newTroupe ];
    }
}

// Updates member properties for the specified request. 
// Must wait until next sync to synchronize member properties.
function updateMemberProperties(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
): void {
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

// Removes member properties & ensure no base member properties are requested for removal
function removeMemberProperties(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
): void {
    const initialNumMemberProperties = Object.keys(troupe.memberPropertyTypes).length;
    let numMemberProperties = Object.keys(troupe.memberPropertyTypes).length;

    for(const key of request.removeMemberProperties!) {
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

function updatePointTypes(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
) {
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

function removePointTypes(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
) {
    const initialNumPointTypes = Object.keys(troupe.pointTypes).length;
    let numPointTypes = Object.keys(troupe.pointTypes).length;

    for(const key of request.removePointTypes!) {
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

function updateFieldMatchers(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
) {
    const initialNumMatchers = troupe.fieldMatchers.length;
    const updatedMatchers = structuredClone(troupe.fieldMatchers);

    for(let i = 0; i < request.updateFieldMatchers!.length; i++) {
        const matcher = request.updateFieldMatchers![i];
        let unique = true;
        let validProperty = false;

        // Ensure uniqueness of regex and priority
        if(matcher) {
            for(let j = 0; unique && j < request.updateFieldMatchers!.length; j++) {
                if(j == i) continue;
                
                // Check if this matcher is different from the other matcher
                const otherMatcher: FieldMatcher | undefined = request.updateFieldMatchers![j] || troupe.fieldMatchers[j];
                const diffFromOtherMatcher = matcher.fieldExpression != otherMatcher.fieldExpression
                    && matcher.priority != otherMatcher.priority;
                unique = unique && (!otherMatcher || diffFromOtherMatcher);
            }
            validProperty = matcher.memberProperty in troupe.memberPropertyTypes;
        }

        // Add the matcher if it's unique and valid
        if(matcher && unique && validProperty) updatedMatchers.push(matcher);
    }

    // Ensure the field matchers have the correct ordering before storing
    updatedMatchers.sort((a, b) => a.priority - b.priority);
    troupeUpdate.$set.fieldMatchers = updatedMatchers;

    const newLimit = initialNumMatchers - updatedMatchers.length;
    if(newLimit) {
        limitSpecifier.fieldMatchersLeft = newLimit;
    }
}

function removeFieldMatchers(
    request: UpdateTroupeRequest,
    troupe: WithId<TroupeSchema>,
    troupeUpdate: TroupeDbUpdate,
    limitSpecifier: TroupeLimitSpecifier,
) {
    request.removeFieldMatchers!.sort();
    const initialNumMatchers = troupe.fieldMatchers.length;
    const updatedMatchers = structuredClone(troupe.fieldMatchers);

    // Validate the remove field matchers
    for(let i = request.removeFieldMatchers!.length - 1; i >= 0; i--) {
        const index = request.removeFieldMatchers![i];
        const indexOutOfRange = !(0 <= index && index < updatedMatchers.length);
        const indexNotUnique = index < request.removeFieldMatchers!.length - 1 && index == index + 1;
        if(indexOutOfRange || indexNotUnique) {
            request.removeFieldMatchers!.slice(i, 1);
        }
    }

    // Remove the validated field matchers from the troupe
    for(let i = request.removeFieldMatchers!.length - 1; i >= 0; i--) {
        const index = request.removeFieldMatchers![i];
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