import init from "./util/init";

import { TroupeApiService } from "../services/api";
import { TroupeCoreService } from "../services/core";
import { test, describe } from "@jest/globals";

const { dbSetup } = init();

describe("basic core operations", () => {
    test("create and delete troupe", async () => {
        const core = await TroupeCoreService.create();
        const api = await TroupeApiService.create();

        const troupeId = await core.createTroupe({ name: "test" });

        expect(await api.getTroupe(troupeId)).toHaveProperty("name", "test");

        const updatedTroupe1 = await api.updateTroupe(troupeId, {
            name: "test2",
            updateMemberProperties: {
                "hi": "boolean!",
                "bye": "boolean!",
            },
            removeMemberProperties: ["bye"],
        });

        expect(updatedTroupe1.memberPropertyTypes).toHaveProperty("hi");
        expect(updatedTroupe1.memberPropertyTypes).not.toHaveProperty("bye");

        const updatedTroupe2 = await api.updateTroupe(troupeId, {
            removeMemberProperties: ["hi", "bye"],
        });

        expect(updatedTroupe2.memberPropertyTypes).not.toHaveProperty("hi");

        await core.deleteTroupe(troupeId);

        await expect(api.getTroupe(troupeId)).rejects.toThrow();
    });
});