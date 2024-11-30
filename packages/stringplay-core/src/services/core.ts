// Kernel of the backend; initializes the system and provides additional functionality for other backend services

import assert from "assert";
import { CreateTroupeRequest, SyncRequest } from "../types/service-types";
import { Collection, ObjectId, WithId } from "mongodb";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, DB_NAME, DEFAULT_MATCHERS } from "../util/constants";
import { BaseDbService } from "./base";
import { GoogleSheetsLogService } from "./sync/logs/gsheets-log";
import { bulkAddToSyncQueue } from "../cloud/gcp";
import { InviteCodeSchema, TroupeSchema } from "../types/core-types";
import { INVITE_CODES } from "../util/env";
import { LimitService } from "./limits";
import { LogSheetService } from "./sync/base";

export class CoreService extends BaseDbService {
    readonly inviteCodeColl: Collection<InviteCodeSchema>;

    constructor() { 
        super();
        this.inviteCodeColl = this.client.db(DB_NAME).collection("inviteCodes");
    }

    async initSystem() {
        const limitService = await LimitService.create();
        await this.inviteCodeColl.insertOne({
            inviteCodes: INVITE_CODES?.split(",") || [],
            usedInviteCodes: {},
        });
        await limitService.initGlobalLimits();
    }

    async toggleSystemLock(lockEnabled: boolean) {

    }

    /** Initializes a new troupe with a dashboard and log sheet */
    async createTroupe(request: CreateTroupeRequest, createLog?: true): Promise<string> {
        return this.client.startSession().withTransaction(async () => {
            const lastUpdated = new Date();
            const insertTroupe = await this.troupeColl.insertOne({
                ...request,
                lastUpdated,
                logSheetUri: "",
                eventTypes: [],
                memberPropertyTypes: BASE_MEMBER_PROPERTY_TYPES,
                synchronizedMemberPropertyTypes: BASE_MEMBER_PROPERTY_TYPES,
                pointTypes: BASE_POINT_TYPES_OBJ,
                synchronizedPointTypes: BASE_POINT_TYPES_OBJ,
                syncLock: false,
                fieldMatchers: DEFAULT_MATCHERS,
            });
            assert(insertTroupe.insertedId, "Failed to create troupe");
    
            const insertDashboard = await this.dashboardColl.insertOne({
                troupeId: insertTroupe.insertedId.toHexString(),
                lastUpdated,
                upcomingBirthdays: {
                    frequency: "monthly",
                    desiredFrequency: "monthly",
                    members: [],
                },
                totalMembers: 0,
                totalEvents: 0,
                totalAttendees: 0,
                totalEventTypes: 0,
                avgAttendeesPerEvent: 0,
                avgAttendeesByEventType: {},
                attendeePercentageByEventType: {},
                eventPercentageByEventType: {},
                totalAttendeesByEventType: {},
                totalEventsByEventType: {},
            });
            assert(insertDashboard.insertedId, "Failed to create dashboard");

            if(createLog) {
                await this.newTroupeLog(insertTroupe.insertedId.toHexString());
            }
            return insertTroupe.insertedId.toHexString();
        });
    }

    /** Creates the log sheet for a troupe */
    async newTroupeLog(troupeId: string): Promise<string> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        const events = await this.eventColl.find({ troupeId }).toArray();
        const audience = await this.audienceColl.find({ troupeId }).toArray();

        const logService: LogSheetService = new GoogleSheetsLogService();
        const logSheetUri = await logService.createLog(troupe, events, audience.map( m => ({...m, eventsAttended: {} }) ));

        const updateTroupe = await this.troupeColl.updateOne({ _id: new ObjectId(troupeId) }, { $set: { logSheetUri } });
        assert(updateTroupe.modifiedCount == 1, "Failed to update troupe");
        return logSheetUri;
    }

    /** Deletes a troupe and its associated data (log, audience, events, dashboard) */
    async deleteTroupe(troupeId: string): Promise<void> {
        let logSheetUri: string;

        await this.client.startSession().withTransaction(async () => {
            const troupe = await this.getTroupeSchema(troupeId, true);
            const limitService = await LimitService.create();
            logSheetUri = troupe.logSheetUri;
            
            await this.troupeColl.deleteOne({ _id: new ObjectId(troupeId) });
            await this.dashboardColl.deleteOne({ troupeId });
            await this.audienceColl.deleteMany({ troupeId });
            await this.eventColl.deleteMany({ troupeId });
            await limitService.removeTroupeLimits(troupeId);

            // assert(
            //     res.every(r => r && "acknowledged" in r ? r.acknowledged : true ), 
            //     "Failed to fully delete troupe"
            // );
        });

        const logService: LogSheetService = new GoogleSheetsLogService();
        await logService.deleteLog(logSheetUri!);
    }

    /** Retrieves a troupe schema with the given name */
    async getTroupeByName(name: string): Promise<WithId<TroupeSchema> | null> {
        const troupe = this.troupeColl.findOne({ name });
        assert(troupe, "Troupe not found");
        return troupe;
    }

    /** Places all troupes into the sync queue with sync locks disabled */
    async syncTroupes(): Promise<void> {
        const requests: SyncRequest[] = await this.troupeColl.find({}).toArray()
            .then(troupes => troupes.filter(t => !t.syncLock).map(t => ({ troupeId: t._id.toHexString()})));
        await bulkAddToSyncQueue(requests);
    }

    async refreshLimits(): Promise<void> {
        const limitService = await LimitService.create();
        const refreshAllTroupes = this.troupeColl.find({}).map(async (troupe) => {
            const troupeId = troupe._id.toHexString();
            const hasInviteCode = await this.inviteCodeColl.findOne({ 
                [`usedInviteCodes.${troupeId}`]: { $exists: true } 
            }) !== null;
            limitService.refreshTroupeLimits(troupeId, hasInviteCode);
        }).close();

        await Promise.all([
            limitService.refreshGlobalLimits(),
            refreshAllTroupes,
        ]);
    }
}