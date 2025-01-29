// Places limits on the system to prevent overuse

import { ClientSession, Collection, Filter, UpdateFilter, WithId } from "mongodb";
import { GlobalLimitSchema, LimitCollectionSchema, LimitSchema } from "../types/core-types";
import { BaseDbService } from "./base";
import { DB_NAME, INVITED_TROUPE_LIMIT, UNINVITED_TROUPE_LIMIT } from "../util/constants";
import assert from "assert";
import { ClientError } from "../util/error";
import { UpdateOperator } from "../types/util-types";
import { GlobalLimitSpecifier, LimitContext, TroupeLimitSpecifier } from "../types/service-types";

export class LimitService extends BaseDbService {
    readonly limitsColl: Collection<LimitCollectionSchema>;
    
    constructor() { 
        super();
        this.limitsColl = this.client.db(DB_NAME).collection("limits");
    }

    async initGlobalLimits(session?: ClientSession): Promise<void> {
        const limitsColl = this.limitsColl as Collection<GlobalLimitSchema>;
        const insertion = await limitsColl.insertOne(
            { docType: "globalLimit", uninvitedUsersLeft: 5 }, { session }
        );
        assert(insertion.acknowledged, "Insert global limits operation failed");
    }

    async refreshGlobalLimits(session?: ClientSession): Promise<void> {
        const limitsColl = this.limitsColl as Collection<GlobalLimitSchema>;
        const modification = await limitsColl.updateOne(
            { docType: "globalLimit" }, 
            { $set: { uninvitedUsersLeft: 5 } },
            { upsert: true, session },
        );
        assert(modification.acknowledged, "Update global limits operation failed");
    }

    async incrementGlobalLimit(limits: GlobalLimitSpecifier, session?: ClientSession): Promise<boolean> {
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

        const modification = await limitsColl.updateOne(filters, { $inc }, { session });
        assert(
            modification.matchedCount == 0 || modification.modifiedCount > 0, 
            "Decrement global limits operation failed"
        );

        return modification.matchedCount > 0;
    }

    async initTroupeLimits(troupeId: string, hasInviteCode: boolean, session?: ClientSession): Promise<void> {
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
        const insertion = await limitsColl.insertOne(initDoc, { session });
        assert(insertion.acknowledged, `Insert limit operation failed for troupe ID ${troupeId}`)
    }

    async refreshTroupeLimits(troupeId: string, hasInviteCode: boolean, session?: ClientSession): Promise<void> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const refreshDoc: UpdateFilter<LimitSchema> = {};
        if(hasInviteCode) {
            refreshDoc.$set = {
                modifyOperationsLeft: INVITED_TROUPE_LIMIT.modifyOperationsLeft,
                manualSyncsLeft: INVITED_TROUPE_LIMIT.manualSyncsLeft,
            }
        } else {
            refreshDoc.$set = {
                modifyOperationsLeft: UNINVITED_TROUPE_LIMIT.modifyOperationsLeft,
                manualSyncsLeft: UNINVITED_TROUPE_LIMIT.manualSyncsLeft,
            }
        }
        const modification = await limitsColl.updateOne({ troupeId }, refreshDoc, { session });
        assert(modification.matchedCount == 1, new ClientError(`Invalid troupe ID ${troupeId}`));
        assert(modification.modifiedCount == 1, `Update limit operation failed for troupe ID ${troupeId}`);
    }

    async incrementTroupeLimits(
        limitContext: LimitContext | undefined, 
        troupeId: string, 
        limitsToInc: TroupeLimitSpecifier, 
        session?: ClientSession
    ) : Promise<boolean> {
        if(limitContext && limitContext[troupeId] < 0) {
            // console.warn("Ignoring limits increment for troupe " + troupeId);
            return true;
        }

        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const filters: Filter<LimitSchema> = { troupeId };
        const $inc: UpdateOperator<LimitSchema, "$inc"> = {};
        for(const limit in limitsToInc) {
            const lim = limit as keyof typeof limitsToInc;
            const increment = limitsToInc[lim];

            $inc[limit] = increment;
            if(increment && increment < 0) {
                filters[lim] = { $gte: Math.abs(increment) };
            }
        }

        const modification = await limitsColl.updateOne(filters, { $inc }, { session });
        assert(
            modification.acknowledged, 
            "Increment troupe limits operation failed"
        );

        return modification.matchedCount > 0;
    }

    async removeTroupeLimits(troupeId: string, session?: ClientSession): Promise<void> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        const deletion = await limitsColl.deleteOne({ troupeId }, { session });
        assert(deletion.acknowledged, `Delete limit operation failed for troupe ID ${troupeId}`);
    }

    async getTroupeLimits(troupeId: string, session?: ClientSession): Promise<WithId<LimitSchema> | null> {
        const limitsColl = this.limitsColl as Collection<LimitSchema>;
        return limitsColl.findOne({ docType: "troupeLimit", troupeId }, { session });
    }

    async withinTroupeLimits(
        limitContext: LimitContext | undefined, 
        troupeId: string, 
        limitsToInc: TroupeLimitSpecifier, 
        session?: ClientSession
    ) : Promise<boolean> {
        if(limitContext && limitContext[troupeId] < 0) {
            // console.warn("Ignoring limits check for troupe " + troupeId);
            return true;
        }

        const troupeLimits = await this.getTroupeLimits(troupeId, session);
        if(!troupeLimits) return false;

        for(const limit in limitsToInc) {
            const lim = limit as keyof typeof limitsToInc;
            if(troupeLimits[lim] == 0) {
                return false;
            }
        }
        return true;
    }

    /** 
     * Allows for limits for a troupe to be ignored temporarily; helpful when using 
     * multiple methods that can modify the limit, but you only want one of them to 
     * actually perform the modification.
     * 
     * Troupe IDs set to true will have their limit and all limit modifying operations 
     * ignored during the limit-modifying method.
     * 
     * A limit context enables limits to be updated independent of other requests on 
     * the same troupe. If a limit context is not provided, a new one is created and 
     * returned. Otherwise, the existing one is returned.
     */
    toggleIgnoreTroupeLimits(
        limitContext: LimitContext | undefined, 
        troupeId: string, 
        ignore: boolean
    ) : LimitContext {
        if(!limitContext) limitContext = {};
        if(!limitContext[troupeId]) {
            limitContext[troupeId] = 0;
        }
        limitContext[troupeId] += ignore ? -1 : 1;
        return limitContext;
    }
}