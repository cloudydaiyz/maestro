import init from "./init";

import { TroupeApiService } from "..";
import { TroupeCoreService } from "../core";
import { test, describe } from "@jest/globals";

const resources = init();

describe("basic api operations", () => {
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
        const core = new TroupeCoreService();
        const api = new TroupeApiService();
        resources.push(core, api);
        await Promise.all([ core.connection, api.connection ]);

        const troupeId = await core.createTroupe({ name: "test" });

        const event = await api.createEvent(troupeId.toHexString(), {
            title: "test",
            startDate: (new Date()).toISOString(),
            sourceUri: "https://docs.google.com/forms/d/1nG_OyAJQ3ZPCNzzA5wgB66tlbGw6Pc0cLBV3i4GLJNY/edit",
        });

        expect(await api.getEvent(event.id, troupeId.toHexString())).toHaveProperty("title", "test");
    });

    test("update event", async () => {
        const core = new TroupeCoreService();
        const api = new TroupeApiService();
        resources.push(core, api);
        await Promise.all([ core.connection, api.connection ]);

        const troupeId = await core.createTroupe({ name: "test" });

        const event = await api.createEvent(troupeId.toHexString(), {
            title: "test",
            startDate: (new Date()).toISOString(),
            sourceUri: "https://docs.google.com/forms/d/1nG_OyAJQ3ZPCNzzA5wgB66tlbGw6Pc0cLBV3i4GLJNY/edit",
        });

        const updatedEvent = await api.updateEvent(event.id, troupeId.toHexString(), {
            title: "test2",
        });

        expect(updatedEvent).toHaveProperty("title", "test2");
    })

});