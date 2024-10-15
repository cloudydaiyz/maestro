import init from "../util/init";
import { noMembersConfig } from "../util/db-config";

import { TroupeApiService } from "../..";
import { TroupeCoreService } from "../../core";
import { test, describe } from "@jest/globals";
import { GoogleFormsEventDataService } from "../../services/events/gforms-event";
import { EventDataMap, AttendeeDataMap } from "../../types/service-types";
import { objectMap, objectToArray, verifyMemberPropertyType } from "../../util/helper";

const { addResource, dbSetup } = init();

describe("google sheets event service", () => {
    it("should get event data from non-initialized event & no preexisting members", async () => {
        const config = await dbSetup(noMembersConfig);
        const troupe = config.troupes!["A"].troupe!;

        const observedEvent = config.events!["first"].event!;
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
        const memberMap: AttendeeDataMap = {};

        const api = addResource(await TroupeApiService.create());
    });
});