import { ObjectId, UpdateOneModel, WithId } from "mongodb";
import { UpdateMemberRequest } from "../../../types/api-types";
import { MemberSchema, TroupeSchema } from "../../../types/core-types";
import { ApiRequestBuilder, DbWriteRequest } from "../base";
import { TroupeLimitSpecifier } from "../../../types/service-types";
import assert from "assert";
import { ClientError } from "../../../util/error";
import { SetOperator, UnsetOperator } from "../../../types/util-types";
import { AUDIENCE_COLL } from "../../../util/constants";

type MemberDbUpdate = {
    $set: SetOperator<MemberSchema>,
    $unset: UnsetOperator<MemberSchema>,
}

export class UpdateMemberRequestBuilder  extends ApiRequestBuilder<UpdateMemberRequest & { memberId: string }, WithId<MemberSchema>> {
    troupe?: WithId<TroupeSchema>;
    
    async readData(): Promise<void> {
        const withinLimits = await this.limitService.withinTroupeLimits(
            this.troupeId!, { modifyOperationsLeft: -1 }
        );
        assert(withinLimits, new ClientError("Operation not within limits for this troupe"));

        const [troupe, /* member */] = await Promise.all([
            this.getTroupeSchema(this.troupeId!, true),
            // this.getMemberSchema(troupeId, memberId, true)
        ]);
        assert(!troupe.syncLock, new ClientError("Cannot update member while sync is in progress"));
        
        this.troupe = troupe;
    }

    processRequests(): [TroupeLimitSpecifier, DbWriteRequest<MemberSchema>[]] {
        assert(this.troupe, "Invalid state; no troupe ID specified");
        const troupe = this.troupe;
        
        const limitSpecifier: TroupeLimitSpecifier = { modifyOperationsLeft: -1 };
        const writeRequests: DbWriteRequest<MemberSchema>[] = [];

        for(let i = 0; i < this.requests.length; i++) {
            const request = this.requests[i];

            const memberUpdate: MemberDbUpdate = {
                $set: {},
                $unset: {},
            };
            memberUpdate.$set.lastUpdated = new Date();
    
            // Update existing properties for the member
            if(request.updateProperties) {
                updateProperties(request, memberUpdate, troupe);
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

            writeRequests.push({
                collection: AUDIENCE_COLL,
                request: {
                    filter: { _id: new ObjectId(request.memberId) },
                    update: memberUpdate,
                }
            });
        }
        return [limitSpecifier, writeRequests];
    }

    async writeProcessedRequests(writeRequests: DbWriteRequest<MemberSchema>[]): Promise<WithId<MemberSchema>[]> {
        const audienceUpdates = writeRequests.map(wr => ({ updateOne: wr.request as UpdateOneModel<MemberSchema> }));
        const res1 = await this.audienceColl.bulkWrite(audienceUpdates);
        assert(
            res1.isOk(), 
            "Unable to perform bulk write request. Errors: " + 
                res1.getWriteErrors().map(err => err.errmsg).join('\n')
        );

        const memberIds = this.requests.map(r => r.memberId);
        const newMembers: WithId<MemberSchema>[] = [];
        for(const memberId in memberIds) {
            const member = await this.audienceColl.findOne({ _id: new ObjectId(memberId )});
            if(member) newMembers.push(member);
        }
        return newMembers;
    }
}

function updateProperties(
    request: UpdateMemberRequest & { memberId: string },
    memberUpdate: MemberDbUpdate,
    troupe: WithId<TroupeSchema>,
) {
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