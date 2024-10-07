// Additional functionality for other backend services

import assert from "assert";
import { CreateTroupeRequest } from "./types/service-types";
import { ObjectId } from "mongodb";
import { BASE_MEMBER_PROPERTY_TYPES, BASE_POINT_TYPES_OBJ } from "./util/constants";
import { BaseService } from "./services/base-service";

export class TroupeCoreService extends BaseService {
    constructor() { super() }

    async createTroupe(request: CreateTroupeRequest) {
        const logSheetUri = "";
        assert(logSheetUri, "Failed to create log sheet");

        return this.client.startSession().withTransaction(async () => {
            const lastUpdated = new Date();
            const troupe = await this.troupeColl.insertOne({
                ...request,
                lastUpdated,
                logSheetUri,
                eventTypes: [],
                memberPropertyTypes: BASE_MEMBER_PROPERTY_TYPES,
                pointTypes: BASE_POINT_TYPES_OBJ,
                synchronizedPointTypes: BASE_POINT_TYPES_OBJ,
                syncLock: false,
            });
            assert(troupe.insertedId, "Failed to create troupe");
    
            const dashboard = await this.dashboardColl.insertOne({
                troupeId: troupe.insertedId.toHexString(),
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
            assert(dashboard.insertedId, "Failed to create dashboard");
            return troupe.insertedId;
        });
    }

    async deleteTroupe(troupeId: string) {
        return this.client.startSession().withTransaction(async () => {
            return Promise.all([
                this.troupeColl.deleteOne({ _id: new ObjectId(troupeId) }),
                this.dashboardColl.deleteOne({ troupeId }),
                this.audienceColl.deleteMany({ troupeId }),
                this.eventColl.deleteMany({ troupeId })
            ]).then((res) => {
                assert(res.every((r) => r.acknowledged), "Failed to fully delete troupe");
                console.log(res.reduce((deletedCount, r) => deletedCount + r.deletedCount, 0));
            });
        });
    }
}