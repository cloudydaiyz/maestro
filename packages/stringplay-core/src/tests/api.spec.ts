import init from "./util/init";
import { SystemSetupConfig, defaultConfig } from "./util/test-config";

import { StringplayApiService } from "../services/api";
import { TroupeCoreService } from "../services/core";
import { test, describe } from "@jest/globals";

const { dbSetup } = init();

let config: SystemSetupConfig;
beforeEach(async () => { config = await dbSetup(defaultConfig) });

describe("basic api operations", () => {

    test("get troupe", async () => {
        const core = await TroupeCoreService.create();
        const api = await StringplayApiService.create();

        await expect(api.getTroupe("test")).rejects.toThrow();

        const troupeId = await core.createTroupe({ name: "test" });

        expect(await api.getTroupe(troupeId)).toHaveProperty("name", "test");
    });

    test("create event", async () => {
        const troupeId = config.troupes!["A"].id!;

        const api = await StringplayApiService.create();

        const event = await api.createEvent(troupeId, {
            title: "test",
            startDate: (new Date()).toISOString(),
            sourceUri: "https://docs.google.com/forms/d/1nG_OyAJQ3ZPCNzzA5wgB66tlbGw6Pc0cLBV3i4GLJNY/edit",
        });

        expect(await api.getEvent(event.id, troupeId)).toHaveProperty("title", "test");
    });

    test("update event - event type & value", async () => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;
        const secondEventId = config.events!["second"].id!;

        const api = await StringplayApiService.create();

        const updatedEvent1 = await api.updateEvent(troupeId, secondEventId, {
            title: "test2",
        });
        expect(updatedEvent1).toHaveProperty("title", "test2");

        // Observe the impact of updating the event type on event and attendee(s) (in this case, member 2)
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalSecondEventValue = config.events!["second"].event!.value;

        // Remove event type from event (should not affect event value)
        const updatedEvent2 = await api.updateEvent(troupeId, secondEventId, { eventTypeId: "" });
        expect(updatedEvent2).not.toHaveProperty("eventTypeId");
        expect(updatedEvent2).toHaveProperty("value", originalSecondEventValue);

        // Ensure the points was updated for the members and event was updated for the attendee buckets
        const updatedMember2 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember2.points["Total"]).toEqual(originalPoints);

        const eventsAttendedBuckets2 = await api.eventsAttendedColl.find(
            { troupeId, [`events.${secondEventId}`]: { $exists: true } }
        ).toArray();

        expect(eventsAttendedBuckets2.every(bucket => bucket.events[secondEventId].value === originalSecondEventValue 
            && !bucket.events[secondEventId].typeId)).toBeTruthy();

        // Update event type on event (should affect event value)
        const newValue = config.eventTypes!["cool events"].value!;
        const newEventTypeId = config.eventTypes!["cool events"].id!;

        const updatedEvent3 = await api.updateEvent(troupeId, secondEventId, { eventTypeId: newEventTypeId });
        expect(updatedEvent3).toHaveProperty("eventTypeId");
        expect(updatedEvent3).toHaveProperty("value", newValue);

        // Ensure the points was updated for the members and event was updated for the attendee buckets
        const updatedMember3 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember3.points["Total"]).toEqual(originalPoints + newValue - originalSecondEventValue);

        const eventsAttendedBuckets3 = await api.eventsAttendedColl.find(
            { troupeId, [`events.${secondEventId}`]: { $exists: true } }
        ).toArray();

        expect(eventsAttendedBuckets3.every(bucket => bucket.events[secondEventId].value === newValue
            && bucket.events[secondEventId].typeId === newEventTypeId)).toBeTruthy();
    });

    test("update event - varying value across point types", async () => {
        const troupeId = config.troupes!["A"].id!;
        const secondEventId = config.events!["second"].id!;
        const secondEventValue = config.events!["second"].event!.value;
        const fourthEventId = config.events!["fourth"].id!;
        const fourthEventValue = config.events!["fourth"].event!.value;

        const api = await StringplayApiService.create();

        // Observe the impact of updating the event value on attendees (in this case, member 2)
        const observedMemberId = config.members!["2"].id!;
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalFallPoints = config.members!["2"].member!.points["Fall"];

        // Update an event inside the range of Fall points
        const updatedEvent1 = await api.updateEvent(troupeId, secondEventId, { value: secondEventValue + 1 });
        expect(updatedEvent1).toHaveProperty("value", secondEventValue + 1);

        const updatedMember1 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember1.points["Total"]).toEqual(originalPoints + 1);
        expect(updatedMember1.points["Fall"]).toEqual(originalFallPoints + 1);

        // Update an event outside the range of Fall points
        const updatedEvent2 = await api.updateEvent(troupeId, fourthEventId, { value: fourthEventValue + 4 });
        expect(updatedEvent2).toHaveProperty("value", fourthEventValue + 4);

        const updatedMember2 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember2.points["Total"]).toEqual(originalPoints + 5);
        expect(updatedMember2.points["Fall"]).toEqual(originalFallPoints + 1);
    });

    test("delete event", async() => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;
        const secondEventId = config.events!["second"].id!;
        const secondEventValue = config.events!["second"].event!.value;
        const fourthEventId = config.events!["fourth"].id!;
        const fourthEventValue = config.events!["fourth"].event!.value;

        const api = await StringplayApiService.create()

        // Observe the impact of deleting the event on attendees (in this case, member 2)
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalFallPoints = config.members!["2"].member!.points["Fall"];

        // Delete an event inside the range of Fall points
        await api.deleteEvent(troupeId, secondEventId);
        await expect(api.getEvent(secondEventId, troupeId)).rejects.toThrow();

        const updatedMember = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember.points["Total"]).toEqual(originalPoints - secondEventValue);
        expect(updatedMember.points["Fall"]).toEqual(originalFallPoints - secondEventValue);

        // Delete an event outside the range of Fall points
        await api.deleteEvent(troupeId, fourthEventId);
        await expect(api.getEvent(fourthEventId, troupeId)).rejects.toThrow();

        const updatedMember2 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember2.points["Total"]).toEqual(originalPoints - secondEventValue - fourthEventValue);
        expect(updatedMember2.points["Fall"]).toEqual(originalFallPoints - secondEventValue);
    });

    test("update event type - title & value", async () => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;
        const eventTypeId = config.eventTypes!["alright events"].id!;
        const secondEventId = config.events!["second"].id!;
        const fifthEventId = config.events!["fifth"].id!;

        const api = await StringplayApiService.create();

        const originalValue = config.eventTypes!["alright events"].value!;
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalFallPoints = config.members!["2"].member!.points["Fall"];

        await api.updateEventType(troupeId, eventTypeId, {
            title: "very alright events",
            value: originalValue + 5,
        });

        // Check values and event type title for events
        const events = await api.eventColl.find({ troupeId, eventTypeId }).toArray();
        expect(events.every(event => event.value == originalValue + 5 && event.eventTypeTitle == "very alright events"))
            .toBeTruthy();
        
        // Check values for events attended buckets
        const eventsAttended = await api.eventsAttendedColl.find({ 
            troupeId, 
            $or: [
                {[`events.${secondEventId}`]: { $exists: true } },
                {[`events.${fifthEventId}`]: { $exists: true } },
            ],
        }).toArray();

        expect(eventsAttended.every(bucket => !bucket.events[secondEventId] || bucket.events[secondEventId].value == originalValue + 5))
            .toBeTruthy();
        expect(eventsAttended.every(bucket => !bucket.events[fifthEventId] || bucket.events[fifthEventId].value == originalValue + 5))
            .toBeTruthy();

        // Check updated points for member
        const member = await api.getMember(observedMemberId, troupeId);
        expect(member.points["Total"]).toEqual(originalPoints + 10);
        expect(member.points["Fall"]).toEqual(originalFallPoints + 5);
    });

    test("delete event type", async () => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;
        const eventTypeId = config.eventTypes!["alright events"].id!;
        const secondEventId = config.events!["second"].id!;
        const fifthEventId = config.events!["fifth"].id!;

        const api = await StringplayApiService.create();

        const originalValue = config.eventTypes!["alright events"].value!;
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalFallPoints = config.members!["2"].member!.points["Fall"];

        await api.deleteEventType(troupeId, eventTypeId);

        // Check values and event type id and title for events
        const events = await api.eventColl.find({ troupeId, eventTypeId }).toArray();
        expect(events.every(event => event.value == originalValue && event.eventTypeId == undefined 
            && event.eventTypeTitle == undefined))
            .toBeTruthy();
        
        // Check values and event type id for events attended buckets
        const eventsAttended = await api.eventsAttendedColl.find({ 
            troupeId, 
            $or: [
                {[`events.${secondEventId}`]: { $exists: true } },
                {[`events.${fifthEventId}`]: { $exists: true } },
            ],
        }).toArray();

        expect(eventsAttended.every(bucket => !bucket.events[secondEventId] || bucket.events[secondEventId].value == originalValue 
            && bucket.events[secondEventId].typeId == undefined))
            .toBeTruthy();
        expect(eventsAttended.every(bucket => !bucket.events[fifthEventId] || bucket.events[fifthEventId].value == originalValue 
            && bucket.events[fifthEventId].typeId == undefined))
            .toBeTruthy();
        
        // Check updated points for member
        const member = await api.getMember(observedMemberId, troupeId);
        expect(member.points["Total"]).toEqual(originalPoints );
        expect(member.points["Fall"]).toEqual(originalFallPoints);
    });

    test("update member", async () => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;

        const api = await StringplayApiService.create();

        await expect(api.updateMember(troupeId, observedMemberId, {
            removeProperties: ["Last Name"],
        })).rejects.toThrow();

        const updatedMember = await api.updateMember(troupeId, observedMemberId, {
            updateProperties: {
                "First Name": { value: "Hi" },
                "Last Name": { value: "World", override: true },
                "New Prop": { value: "new value", override: false },
            },
        });

        // Check property value and override
        expect(updatedMember.properties["First Name"]).toMatchObject({ value: "Hi", override: true });
        expect(updatedMember.properties["Last Name"]).toMatchObject({ value: "World", override: true });
        expect(updatedMember.properties["New Prop"]).toMatchObject({ value: "new value", override: false });
    });

    test("delete member", async () => {
        const troupeId = config.troupes!["A"].id!;
        const observedMemberId = config.members!["2"].id!;

        // Check if member and buckets are deleted
        const api = await StringplayApiService.create();

        await api.deleteMember(troupeId, observedMemberId);

        await expect(api.getMember(observedMemberId, troupeId)).rejects.toThrow();
        await expect(api.eventsAttendedColl.findOne({ troupeId, memberId: observedMemberId })).resolves.toBeNull();
    });
});