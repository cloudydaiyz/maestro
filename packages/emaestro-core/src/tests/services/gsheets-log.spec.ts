import init from "../util/init";
import { defaultConfig } from "../util/db-config";

import { describe } from "@jest/globals";
import { GoogleFormsEventDataService } from "../../services/events/gforms-event";
import { EventDataMap, AttendeeDataMap } from "../../types/service-types";
import { objectMap, objectToArray, verifyMemberPropertyType } from "../../util/helper";
import { GoogleSheetsLogService } from "../../services/logs/gsheets-log";
import { WithId } from "mongodb";
import { TroupeSchema } from "../../types/core-types";

const { addResource, dbSetup } = init();

describe("google sheets log service", () => {
    const service = new GoogleSheetsLogService();
    let currentTroupe: WithId<TroupeSchema> | null;

    afterEach(async () => { if(currentTroupe) await service.deleteLog(currentTroupe.logSheetUri) });

    it("should create a log correctly for troupe", async () => {
        const config = await dbSetup(defaultConfig);

        // Initialize the GoogleFormsEventDataService
        const troupe = config.troupes!["A"].troupe!;

        const eventMap: EventDataMap = objectMap(
            config.events!,
            (eventId, event) => [
                event.event!.sourceUri,
                {
                    event: event.event!,
                    delete: false,
                    fromColl: true,
                }
            ]
        );

        const memberMap: AttendeeDataMap = objectMap(
            config.members!,
            (customMemberId, member) => [
                member.id!,
                {
                    member: member.member!,
                    eventsAttended: objectToArray(member.eventsAttended!, (eventId, event) => ({ ...event, eventId: `${eventId}` })),
                    eventsAttendedDocs: [],
                    delete: false,
                    fromColl: true,
                }
            ]
        );

        const events = objectToArray(eventMap, (sourceUri, eventData) => eventData.event);
        const audience = objectToArray(memberMap, (memberId, memberData) => ({ ...memberData.member, eventsAttended: {} }));
        const uri = await service.createLog(troupe, events, audience);
        console.log(uri);

        // Ensure that the log has the correct values and formatting
        await service.validateLog(uri, troupe, events, audience);
    });

    it.skip("should update a log correctly for troupe", async () => {

    });
});