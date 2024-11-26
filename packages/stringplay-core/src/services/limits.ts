// Places limits on the system to prevent overuse

import { Collection, Filter, UpdateFilter, WithId } from "mongodb";
import { GlobalLimit, GlobalLimitSchema, LimitCollectionSchema, LimitSchema, TroupeLimit } from "../types/core-types";
import { BaseDbService } from "./base";
import { DB_NAME, INVITED_TROUPE_LIMIT, UNINVITED_TROUPE_LIMIT } from "../util/constants";
import assert from "assert";
import { ClientError } from "../util/error";
import { UpdateOperator } from "../types/util-types";
import { GlobalLimitSpecifier, TroupeLimitSpecifier } from "../types/service-types";

export class LimitService extends BaseDbService {
    readonly limitsColl: Collection<LimitCollectionSchema>;
    
    constructor() { 
        super();
        this.limitsColl = this.client.db(DB_NAME).collection("limits");
    }

    async initGlobalLimits(): Promise<void> {
        const limitsColl = this.limitsColl as Collection<GlobalLimitSchema>;
        const insertion = await limitsColl.insertOne(
            { docType: "globalLimit", uninvitedUsersLeft: 5 },
        );
        assert(insertion.acknowledged, "Insert global limits operation failed");
    }

    async refreshGlobalLimits(): Promise<void> {
        const limitsColl = this.limitsColl as Collection<GlobalLimitSchema>;
        const modification = await limitsColl.updateOne(
            { docType: "globalLimit" }, 
            { $set: { uninvitedUsersLeft: 5 } },
            { upsert: true },
        );
        assert(modification.modifiedCount == 1, "Update global limits operation failed");
    }

    async incrementGlobalLimit(limits: GlobalLimitSpecifier): Promise<boolean> {
        const limitsColl = this.limitsColl as Collection<GlobalLimitSchema>;
        const filters: Filter<GlobalLimitSchema> = {};
        const $inc: UpdateOperator<GlobalLimitSchema, "$inc"> = {};
        for(const limit in limits) {
            const lim = limit as keyof typeof limits;
            const increment = limits[lim];

            $inc[limit] = increment;
            if(increment && increment < 0) {
                filters[lim] = { $gte: Math.abs(increment) };
            }
        }

        const modification = await limitsColl.updateOne(filters, { $inc });
        assert(
            modification.matchedCount == 0 || modification.modifiedCount > 0, 
            "Decrement global limits operation failed"
        );

        return modification.matchedCount > 0;
    }

    async initTroupeLimits(troupeId: string, hasInviteCode: boolean): Promise<void> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        let initDoc: LimitSchema;
        if(hasInviteCode) {
            initDoc = {
                troupeId,
                hasInviteCode,
                ...INVITED_TROUPE_LIMIT,
            }
        } else {
            initDoc = {
                troupeId,
                hasInviteCode,
                ...UNINVITED_TROUPE_LIMIT,
            }
        }
        const insertion = await limitsColl.insertOne(initDoc);
        assert(insertion.acknowledged, `Insert limit operation failed for troupe ID ${troupeId}`)
    }

    async refreshTroupeLimits(troupeId: string, hasInviteCode: boolean): Promise<void> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const refreshDoc: UpdateFilter<LimitSchema> = {};
        if(hasInviteCode) {
            refreshDoc.$set = {
                getOperationsLeft: INVITED_TROUPE_LIMIT.getOperationsLeft,
                modifyOperationsLeft: INVITED_TROUPE_LIMIT.modifyOperationsLeft,
                manualSyncsLeft: INVITED_TROUPE_LIMIT.manualSyncsLeft,
            }
        } else {
            refreshDoc.$set = {
                getOperationsLeft: UNINVITED_TROUPE_LIMIT.getOperationsLeft,
                modifyOperationsLeft: UNINVITED_TROUPE_LIMIT.modifyOperationsLeft,
                manualSyncsLeft: UNINVITED_TROUPE_LIMIT.manualSyncsLeft,
            }
        }
        const modification = await limitsColl.updateOne({ troupeId }, refreshDoc);
        assert(modification.matchedCount == 1, new ClientError(`Invalid troupe ID ${troupeId}`));
        assert(modification.modifiedCount == 1, `Update limit operation failed for troupe ID ${troupeId}`);
    }

    async incrementTroupeLimits(troupeId: string, limits: TroupeLimitSpecifier): Promise<boolean> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const filters: Filter<LimitSchema> = { troupeId };
        const $inc: UpdateOperator<LimitSchema, "$inc"> = {};
        for(const limit in limits) {
            const lim = limit as keyof typeof limits;
            const increment = limits[lim];

            $inc[limit] = increment;
            if(increment && increment < 0) {
                filters[lim] = { $gte: Math.abs(increment) };
            }
        }

        const modification = await limitsColl.updateOne(filters, { $inc });
        assert(
            modification.matchedCount == 0 || modification.modifiedCount > 0, 
            "Increment troupe limits operation failed"
        );

        return modification.matchedCount > 0;
    }

    async removeTroupeLimits(troupeId: string): Promise<void> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const deletion = await limitsColl.deleteOne({ troupeId });
        assert(deletion.acknowledged, `Delete limit operation failed for troupe ID ${troupeId}`)
    }

    async checkTroupeLimits(troupeId: string): Promise<WithId<LimitSchema> | null> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        return limitsColl.findOne({ docType: "troupeLimit", troupeId });
    }
}