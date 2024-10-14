import init, { DbSetupConfig } from "./init";

import { TroupeApiService } from "..";
import { TroupeCoreService } from "../core";
import { test, describe } from "@jest/globals";
import { EVENT_DATA_SOURCE_REGEX } from "../util/constants";

const { resources, dbSetup } = init();

const link = "https://docs.google.com/forms/d/1nG_OyAJQ3ZPCNzzA5wgB66tlbGw6Pc0cLBV3i4GLJNY/edit";

const defaultConfig: DbSetupConfig = {
    troupes: { "A": { name: "test troupe" } },
    eventTypes: {
        "cool events": { value: 10 },
        "alright events": { value: 3 },
        "uncool events": { value: -7 },
    },
    events: { 
        "first": { title: "test event 1", customTroupeId: "A", customEventTypeId: "cool events" }, 
        "second": { title: "test event 2", customTroupeId: "A", customEventTypeId: "alright events" },
        "third": { title: "test event 3", customTroupeId: "A", customEventTypeId: "uncool events" },
        "fourth": { title: "test event 4 (special)", customTroupeId: "A", value: 4 },
        "fifth": { title: "test event 5", customTroupeId: "A", customEventTypeId: "alright events" },
        "sixth": { title: "test event 4 (special)", customTroupeId: "A", value: -2 },
        "seventh": { title: "test event 4 (special)", customTroupeId: "A", value: 7 },
    },
    members: {
        "1": { 
            properties: { 
                "First Name": { value: "John", override: false }, 
                "Last Name": { value: "Doe", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "third"],
        },
        "2": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "second", "third", "fourth", "fifth"],
        },
        "3": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["second", "fourth", "seventh"],
        },
        "4": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["third", "fourth", "fifth", "sixth"],
        },
        "5": { 
            properties: { 
                "First Name": { value: "Hello", override: false }, 
                "Last Name": { value: "World", override: false }, 
            }, 
            customTroupeId: "A", 
            customEventAttendedIds: ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"],
        },
    }
};

test("db config", async () => {
    const config = await dbSetup(defaultConfig);
    const api = new TroupeApiService();
    resources.push(api);

    expect((await api.getTroupe(config.troupes!["A"].id!)).eventTypes).toHaveLength(3);
    expect(api.getEvents(config.troupes!["A"].id!)).resolves.toHaveLength(7);
    expect(api.getAudience(config.troupes!["A"].id!)).resolves.toHaveLength(5);
    // console.log(await api.getAudience(config.troupes!["A"].id!));
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

    test("update event", async () => {
        const troupeId = config.troupes!["A"].id!;
        const eventId = config.events!["second"].id!;

        const api = new TroupeApiService();
        resources.push(api);
        await api.connection;

        const updatedEvent1 = await api.updateEvent(troupeId, eventId, {
            title: "test2",
        });
        expect(updatedEvent1).toHaveProperty("title", "test2");

        // Observe the impact of updating the event type on event and attendee(s) (in this case, member 2)
        const observedMemberId = config.members!["2"].id!;
        const originalPoints = config.members!["2"].member!.points["Total"];
        const originalValue = config.events!["second"].event!.value;

        // Remove event type from event (should not affect event value)
        const updatedEvent2 = await api.updateEvent(troupeId, eventId, { eventTypeId: "" });
        expect(updatedEvent2).not.toHaveProperty("eventTypeId");
        expect(updatedEvent2).toHaveProperty("value", originalValue);

        const updatedMember2 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember2.points["Total"]).toEqual(originalPoints);

        const eventsAttendedBuckets2 = await api.eventsAttendedColl.find(
            { troupeId, [`events.${eventId}`]: { $exists: true } }
        ).toArray();

        eventsAttendedBuckets2.every(bucket => bucket.events[eventId].value === originalValue 
            && bucket.events[eventId].typeId === undefined);

        // Update event type on event (should affect event value)
        const newValue = config.eventTypes!["cool events"].value!;
        const newEventTypeId = config.eventTypes!["cool events"].id!;

        const updatedEvent3 = await api.updateEvent(troupeId, eventId, {
            eventTypeId: newEventTypeId,
        });

        expect(updatedEvent3).toHaveProperty("eventTypeId");
        expect(updatedEvent3).toHaveProperty("value", newValue);

        const updatedMember3 = await api.getMember(observedMemberId, troupeId);
        expect(updatedMember3.points["Total"]).toEqual(originalPoints + newValue - originalValue);

        const eventsAttendedBuckets3 = await api.eventsAttendedColl.find(
            { troupeId, [`events.${eventId}`]: { $exists: true } }
        ).toArray();

        eventsAttendedBuckets3.every(bucket => bucket.events[eventId].value === newValue
            && bucket.events[eventId].typeId === newEventTypeId);
    });
});