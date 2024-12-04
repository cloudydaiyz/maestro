import { ApiService } from "../api";
import { CoreService } from "../core";
import { test, describe } from "@jest/globals";
import init from "../../util/server/tests/init-test";

init();

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