// Kernel of the backend; initializes the system and provides additional functionality for other backend services

import assert from "assert";
import { CreateTroupeRequest, SyncRequest } from "../types/service-types";
import { ClientSession, Collection, ObjectId, WithId } from "mongodb";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ, DB_NAME, DEFAULT_MATCHERS } from "../util/constants";
import { BaseDbService } from "./base";
import { GoogleSheetsLogService } from "./sync/logs/gsheets-log";
import { InviteCodeSchema, TroupeSchema } from "../types/core-types";
import { INVITE_CODES, MAX_SYNC_DURATION } from "../util/env";
import { LimitService } from "./limits";
import { LogSheetService } from "./sync/base";
import { bulkAddToSyncQueue } from "../cloud/multi";

export class CoreService extends BaseDbService {
    readonly inviteCodeColl: Collection<InviteCodeSchema>;

    constructor() { 
        super();
        this.inviteCodeColl = this.client.db(DB_NAME).collection("inviteCodes");
    }

    async initSystem(): Promise<void> {
        const limitService = await LimitService.create();
        await this.inviteCodeColl.insertOne({
            inviteCodes: INVITE_CODES?.split(",") || [],
            usedInviteCodes: {},
        });
        await limitService.initGlobalLimits();
    }

    /** Initializes a new troupe with a dashboard and log sheet */
    async createTroupe(request: CreateTroupeRequest, createLog?: true): Promise<string> {
        return this.client.withSession(s => s.withTransaction(
            async (session) => {
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
                }, { session });
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
                }, { session });
                assert(insertDashboard.insertedId, "Failed to create dashboard");

                if(createLog) {
                    await this.newTroupeLog(insertTroupe.insertedId.toHexString(), session);
                }
                return insertTroupe.insertedId.toHexString();
            }
        ));
    }

    /** Creates the log sheet for a troupe */
    async newTroupeLog(troupeId: string, session?: ClientSession): Promise<string> {
        const troupe = session ? await this.troupeColl.findOne({ _id: new ObjectId(troupeId) }, { session })
            : await this.getTroupeSchema(troupeId, true);
        const events = await this.eventColl.find({ troupeId }, { session }).toArray();
        const audience = await this.audienceColl.find({ troupeId }, { session }).toArray();
        assert(troupe, "Troupe not found");

        const logService: LogSheetService = new GoogleSheetsLogService();
        const logSheetUri = await logService.createLog(troupe, events, audience.map( m => ({...m, eventsAttended: {} }) ));

        const updateTroupe = await this.troupeColl.updateOne(
            { _id: new ObjectId(troupeId) }, { $set: { logSheetUri } }, { session }
        );
        assert(updateTroupe.modifiedCount == 1, "Failed to update troupe");
        return logSheetUri;
    }

    /** Deletes a troupe and its associated data (log, audience, events, dashboard) */
    async deleteTroupe(troupeId: string): Promise<void> {
        let logSheetUri: string;
        await this.client.withSession(s => s.withTransaction(
            async (session) => {
                const troupe = await this.getTroupeSchema(troupeId, true, session);
                const limitService = await LimitService.create();
                logSheetUri = troupe.logSheetUri;
                
                await this.troupeColl.deleteOne({ _id: new ObjectId(troupeId) }, { session });
                await this.dashboardColl.deleteOne({ troupeId }, { session });
                await this.audienceColl.deleteMany({ troupeId }, { session });
                await this.eventColl.deleteMany({ troupeId }, { session });
                await limitService.removeTroupeLimits(troupeId, session);
            }
        ));

        const logService: LogSheetService = new GoogleSheetsLogService();
        await logService.deleteLog(logSheetUri!);
    }

    /** Retrieves a troupe schema with the given name */
    async getTroupeByName(name: string): Promise<WithId<TroupeSchema> | null> {
        const troupe = this.troupeColl.findOne({ name });
        return troupe;
    }

    /** Places all troupes into the sync queue with sync locks disabled */
    async syncTroupes(): Promise<void> {
        const requests: SyncRequest[] = await this.troupeColl.find().toArray()
            .then(troupes => troupes
                .filter(t => !t.syncLock)
                .map(t => ({ troupeId: t._id.toHexString() })) 
            );
        await bulkAddToSyncQueue(requests);
    }

    async refreshLimits(): Promise<void> {
        const limitService = await LimitService.create();

        try {
            await limitService.refreshGlobalLimits();
        } catch(e) {
            console.error("ERROR: Unable to update global limits");
        }

        let allTroupes: WithId<TroupeSchema>[];
        try {
            allTroupes = await this.troupeColl.find().toArray();
        } catch(e) {
            console.error("ERROR: Unable to collect all troupes");
            throw e;
        }

        const refreshTroupeOps: Promise<any>[] = [];
        for(const troupe of allTroupes!) {
            const troupeId = troupe._id.toHexString();
            const hasInviteCode = await this.inviteCodeColl.findOne({ 
                [`usedInviteCodes.${troupeId}`]: { $exists: true } 
            }) !== null;

            const op = limitService.refreshTroupeLimits(troupeId, hasInviteCode)
                .catch(err => {
                    console.error(`Unable to refresh troupe ${troupeId}. Error:`, err);
                });
            refreshTroupeOps.push(op);
        }
        Promise.all(refreshTroupeOps);
    }
    
    // Undo the sync lock for troupes who have been locked for a long period of time
    async unlockTroupes(): Promise<void> {
        await this.troupeColl.updateMany(
            { lastUpdated: { $lt: new Date(Date.now() - MAX_SYNC_DURATION) } }, 
            { $set: { syncLock: false, lastUpdated: new Date() } },
        );
    }
}