import init from "../lifecycle/init";
import { defaultConfig, noMembersConfig } from "../../util/test-config";

import { describe } from "@jest/globals";
import { objectToArray } from "../../util/helper";
import { GoogleSheetsLogService } from "../../services/logs/gsheets-log";
import type { WithId } from "mongodb";
import { AttendeeSchema, EventSchema } from "../../types/core-types";

const { dbSetup } = init();

describe("google sheets log service", () => {
    it("should create a log correctly for troupe", async () => {
        const config = await dbSetup(defaultConfig);
        const service = new GoogleSheetsLogService();

        // Setup test data
        const troupe = config.troupes!["A"].troupe!;
        
        const events: WithId<EventSchema>[] = objectToArray(
            config.events!,
            (eventId, event) => event.event!
        )
        events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        const audience: WithId<AttendeeSchema>[] = objectToArray(
            config.members!,
            (customMemberId, member) => ({ ...member.member!, eventsAttended: member.eventsAttended! })
        );
        audience.sort((a, b) => a.points["Total"] - b.points["Total"]);

        // Create the log
        let uri = await service.createLog(troupe, events, audience);

        // Ensure that the log has the correct values and formatting
        await expect(service.validateLog(uri, troupe, events, audience)).resolves.toBeTruthy();
    });

    it("should update a log correctly for troupe", async () => {
        const config1 = await dbSetup(defaultConfig);
        const service = new GoogleSheetsLogService();

        // Setup test data
        let troupe = config1.troupes!["A"].troupe!;
        
        let events: WithId<EventSchema>[] = objectToArray(
            config1.events!,
            (eventId, event) => event.event!
        )
        events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        let audience: WithId<AttendeeSchema>[] = objectToArray(
            config1.members!,
            (customMemberId, member) => ({ ...member.member!, eventsAttended: member.eventsAttended! })
        );
        audience.sort((a, b) => a.points["Total"] - b.points["Total"]);

        // Create the log
        let uri = await service.createLog(troupe, events, audience);
        await expect(service.validateLog(uri, troupe, events, audience)).resolves.toBeTruthy();

        // Change test data
        const config2 = await dbSetup(noMembersConfig);

        troupe = config2.troupes!["A"].troupe!;

        events = objectToArray(
            config2.events!,
            (eventId, event) => event.event!
        )
        events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        audience = objectToArray(
            config2.members!,
            (customMemberId, member) => ({ ...member.member!, eventsAttended: member.eventsAttended! })
        );
        audience.sort((a, b) => a.points["Total"] - b.points["Total"]);

        // Update the log
        await service.updateLog(uri, troupe, events, audience);
        await expect(service.validateLog(uri, troupe, events, audience)).resolves.toBeTruthy();
    });
});