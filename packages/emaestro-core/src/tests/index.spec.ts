import init, { DbSetupConfig, defaultConfig } from "./init";

import { TroupeApiService } from "..";
import { TroupeCoreService } from "../core";
import { test, describe } from "@jest/globals";

const { resources, dbSetup } = init();

const link = "https://docs.google.com/forms/d/1nG_OyAJQ3ZPCNzzA5wgB66tlbGw6Pc0cLBV3i4GLJNY/edit";

test("db config", async () => {
    const config = await dbSetup(defaultConfig);
    const api = new TroupeApiService();
    resources.push(api);

    expect((await api.getTroupe(config.troupes!["A"].id!)).eventTypes).toHaveLength(3);
    expect(api.getEvents(config.troupes!["A"].id!)).resolves.toHaveLength(7);
    expect(api.getAudience(config.troupes!["A"].id!)).resolves.toHaveLength(5);
});

describe("basic api operations", () => {

    let config: DbSetupConfig;
    beforeEach(async () => { config = await dbSetup(defaultConfig) });

    test("get troupe", async () => {
        const core = new TroupeCoreService();
        const api = new TroupeApiService();
        resources.push(core, api);
        await Promise.all([ core.connection, api.connection ]);

        await expect(api.getTroupe("test")).rejects.toThrow();

        const troupeId = await core.createTroupe({ name: "test" });

        expect(await api.getTroupe(troupeId.toHexString())).toHaveProperty("name", "test");
    });

    test("create event", async () => {
        const troupeId = config.troupes!["A"].id!;

        const api = new TroupeApiService();
        resources.push(api);
        await api.connection;

        const event = await api.createEvent(troupeId, {
            title: "test",
            startDate: (new Date()).toISOString(),
            sourceUri: link,
        });

        expect(await api.getEvent(event.id, troupeId)).toHaveProperty("title", "test");
    });

    test("update event - event type & value", async () => {
        const troupeId = config.troupes!["A"].id!;
        const secondEventId = config.events!["second"].id!;

        const api = new TroupeApiService();
        resources.push(api);
        await api.connection;

        const updatedEvent1 = await api.updateEvent(troupeId, secondEventId, {
            title: "test2",
        });
        expect(updatedEvent1).toHaveProperty("title", "test2");

        // Observe the impact of updating the event type on event and attendee(s) (in this case, member 2)
        const observedMemberId = config.members!["2"].id!;
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

    test("delete event", async() => {
        const troupeId = config.troupes!["A"].id!;
        const secondEventId = config.events!["second"].id!;
        const secondEventValue = config.events!["second"].event!.value;
        const fourthEventId = config.events!["fourth"].id!;
        const fourthEventValue = config.events!["fourth"].event!.value;

        const api = new TroupeApiService();
        resources.push(api);
        await api.connection;

        // Observe the impact of deleting the event on attendees (in this case, member 2)
        const observedMemberId = config.members!["2"].id!;
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
});