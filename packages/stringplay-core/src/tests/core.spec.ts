import init from "./lifecycle/init";

import { ApiService } from "../services/api";
import { CoreService } from "../services/core";
import { test, describe } from "@jest/globals";

const { dbSetup } = init();

describe("basic core operations", () => {
    test("create and delete troupe", async () => {
        const core = await CoreService.create();
        const api = await ApiService.create();

        const troupeId = await core.createTroupe({ name: "test" });

        expect(await api.getTroupe(troupeId)).toHaveProperty("name", "test");

        await core.deleteTroupe(troupeId);

        await expect(api.getTroupe(troupeId)).rejects.toThrow();
    });
});