import init from "./init";

import { TroupeApiService } from "..";
import { TroupeCoreService } from "../core";
import { test, describe } from "@jest/globals";

const { resources, dbSetup } = init();

describe("basic core operations", () => {
    test("create and delete troupe", async () => {
        const core = new TroupeCoreService();
        const api = new TroupeApiService();
        resources.push(core, api);
        await Promise.all([ core.connection, api.connection ]);

        const troupeId = await core.createTroupe({ name: "test" });

        expect(await api.getTroupe(troupeId.toHexString())).toHaveProperty("name", "test");

        const updatedTroupe1 = await api.updateTroupe(troupeId.toHexString(), {
            name: "test2",
            updateMemberProperties: {
                "hi": "boolean!",
                "bye": "boolean!",
            },
            removeMemberProperties: ["bye"],
        });

        expect(updatedTroupe1.memberPropertyTypes).toHaveProperty("hi");
        expect(updatedTroupe1.memberPropertyTypes).not.toHaveProperty("bye");

        const updatedTroupe2 = await api.updateTroupe(troupeId.toHexString(), {
            removeMemberProperties: ["hi", "bye"],
        });

        expect(updatedTroupe2.memberPropertyTypes).not.toHaveProperty("hi");

        await core.deleteTroupe(troupeId.toHexString());

        await expect(api.getTroupe(troupeId.toHexString())).rejects.toThrow();
    });
});