import assert from "assert";
import { initTroupeSheet } from "./cloud/gcp";
import { MyTroupeCore } from "./index";
import { CreateTroupeRequest } from "./types/service-types";
import { ObjectId } from "mongodb";
import { BaseMemberPropertiesObj, BasePointTypesObj } from "./types/core-types";

// Additional functionality for other backend services
export class MyTroupeService extends MyTroupeCore {
    constructor() { super() }

    async createTroupe(request: CreateTroupeRequest) {
        const logSheetUri = await initTroupeSheet(request.name).then(res => res.data.id);
        assert(logSheetUri, "Failed to create log sheet");

        return this.client.startSession().withTransaction(async () => {
            const lastUpdated = new Date();
            const troupe = await this.troupeColl.insertOne({
                ...request,
                lastUpdated,
                logSheetUri,
                eventTypes: [],
                memberProperties: BaseMemberPropertiesObj,
                pointTypes: BasePointTypesObj,
                synchronizedPointTypes: BasePointTypesObj,
                syncLock: false,
            });
            assert(troupe.insertedId, "Failed to create troupe");
    
            const dashboard = await this.dashboardColl.insertOne({
                troupeId: troupe.insertedId.toHexString(),
                lastUpdated,
                totalMembers: 0,
                totalEvents: 0,
                avgPointsPerEvent: 0,
                avgAttendeesPerEvent: 0,
                avgAttendeesPerEventType: [],
                attendeePercentageByEventType: [],
                eventPercentageByEventType: [],
                upcomingBirthdays: {
                    frequency: "monthly",
                    desiredFrequency: "monthly",
                    members: [],
                },
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