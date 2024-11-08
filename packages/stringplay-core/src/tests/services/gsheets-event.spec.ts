import init from "../util/init";
import { noMembersConfig } from "../util/test-config";

import { describe } from "@jest/globals";
import { EventDataMap, AttendeeDataMap } from "../../types/service-types";
import { objectMap, objectToArray, verifyMemberPropertyType } from "../../util/helper";
import { GoogleSheetsEventDataService } from "../../services/events/gsheets-event";

const { dbSetup } = init();

describe("google sheets event service", () => {
    it("should get event data from non-initialized event & no preexisting members", async () => {
        const config = await dbSetup(noMembersConfig);
        const troupe = config.troupes!["A"].troupe!;

        const observedEvent = config.events!["second"].event!;
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

        // Populates the field to property map of the observed event
        const service = new GoogleSheetsEventDataService(troupe, eventMap, memberMap);
        await service.init();

        // Discover audience from the event for the first time
        // This should populate the event's field to property map
        const lastUpdated = new Date();
        await service.discoverAudience(observedEvent, lastUpdated);
        // console.log(observedEvent.sourceUri, "\n", JSON.stringify(observedEvent.fieldToPropertyMap, null, 4));
        // console.log(JSON.stringify(memberMap, null, 4));

        const fieldIds = Object.keys(observedEvent.fieldToPropertyMap);
        expect(fieldIds.length).toBeGreaterThan(0);
        expect(fieldIds.every(id => observedEvent.fieldToPropertyMap[id].property == null)).toBeTruthy();

        // Update property mappings
        const indicies = fieldIds.map((id, i) => i);
        for(const property in troupe.memberPropertyTypes) {
            if(indicies.length == 0) break;

            // Assign random property types to each field
            const randomIndex = indicies.splice(Math.floor(Math.random() * indicies.length), 1)[0];
            const randomFieldId = fieldIds[randomIndex];
            observedEvent.fieldToPropertyMap[randomFieldId].property = property;
        }
        // console.log(observedEvent.sourceUri, "\n", JSON.stringify(observedEvent.fieldToPropertyMap, null, 4));

        // Discover audience from the event again -- should populate member map
        await service.discoverAudience(observedEvent, lastUpdated);
        // console.log(JSON.stringify(memberMap, null, 4));

        const populatedProperties = objectToArray(observedEvent.fieldToPropertyMap, (fieldId, mapped) => mapped.property)
            .filter(p => p != null);

        // Check that each member has the correct properties populated from the event and that they are overridden
        for(const memberId in memberMap) {
            const attendee = memberMap[memberId];
            for(const property in attendee.member.properties) {
                const value = attendee.member.properties[property].value;
                if(property in populatedProperties) {
                    expect(verifyMemberPropertyType(value, troupe.memberPropertyTypes[property])).toBeTruthy();
                    expect(attendee.member.properties[property].override).toBeTruthy();
                }
            }

            expect(attendee.delete).toBeFalsy();
            expect(attendee.fromColl).toBeFalsy();
        }
    });
});