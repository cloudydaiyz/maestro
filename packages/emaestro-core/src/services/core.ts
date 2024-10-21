// Additional functionality for other backend services

import assert from "assert";
import { CreateTroupeRequest } from "../types/service-types";
import { ObjectId } from "mongodb";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ } from "../util/constants";
import { BaseDbService, TroupeLogService } from "./base";
import { GoogleSheetsLogService } from "./logs/gsheets-log";

export class TroupeCoreService extends BaseDbService {
    constructor() { super() }

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

            if(createLog) await this.newTroupeLog(insertTroupe.insertedId.toHexString());

            return insertTroupe.insertedId.toHexString();
        });
    }

    /** Creates the log sheet for a troupe */
    async newTroupeLog(troupeId: string): Promise<string> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        const events = await this.eventColl.find({ troupeId }).toArray();
        const audience = await this.audienceColl.find({ troupeId }).toArray();

        const logService: TroupeLogService = new GoogleSheetsLogService();
        const logSheetUri = await logService.createLog(troupe, events, audience.map( m => ({...m, eventsAttended: {} }) ));

        const updateTroupe = await this.troupeColl.updateOne({ _id: new ObjectId(troupeId) }, { $set: { logSheetUri } });
        assert(updateTroupe.modifiedCount == 1, "Failed to update troupe");
        return logSheetUri;
    }

    /** Deletes a troupe and its associated data (log, audience, events, dashboard) */
    async deleteTroupe(troupeId: string) {
        return this.client.startSession().withTransaction(async () => {
            const troupe = await this.getTroupeSchema(troupeId, true);
            const logService: TroupeLogService = new GoogleSheetsLogService();
            await logService.deleteLog(troupe.logSheetUri);

            return Promise.all([
                this.troupeColl.deleteOne({ _id: new ObjectId(troupeId) }),
                this.dashboardColl.deleteOne({ troupeId }),
                this.audienceColl.deleteMany({ troupeId }),
                this.eventColl.deleteMany({ troupeId })
            ]).then((res) => {
                assert(res.every((r) => r.acknowledged), "Failed to fully delete troupe");
            });
        });
    }
}