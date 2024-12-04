import { ApiService } from "../api";
import { CoreService } from "../core";
import { test, describe } from "@jest/globals";
import { AuthService } from "../auth";
import { INVITE_CODES } from "../../util/env";
import init from "../../util/server/tests/init-test";

init();

describe("basic auth", () => {
    afterEach(async () => {
        const auth = await AuthService.create();
        await auth.userColl.deleteMany({});
    });

    test("register", async () => {
        const auth = await AuthService.create();
        
        // Invalid email
        await expect(auth.register("user1", "bad email", "blahblah", "new troupe for user 1")).rejects.toThrow();

        // Weak password
        await expect(auth.register("user1", "good.email@gmail.com", "weakpassword", "new troupe for user 1")).rejects.toThrow();

        // Valid registration
        const pass = crypto.randomUUID();
        await expect(auth.register("user1", "good.email@gmail.com", pass, "new troupe for user 1")).resolves.not.toThrow();

        // Username already exists
        await expect(auth.register("user1", "blah@gmail.com", crypto.randomUUID(), "another new troupe for user 1")).rejects.toThrow();

        // Email already exists
        await expect(auth.register("anotherawesomeusername1", "good.email@gmail.com", crypto.randomUUID(), "new troupe for anotherawesomeusername1")).rejects.toThrow();

        // Troupe name already exists
        await expect(auth.register("anotherawesomeusername1", "blah@gmail.com", crypto.randomUUID(), "new troupe for user 1")).rejects.toThrow();

        // Successful login
        await expect(auth.login("user1", pass)).resolves.not.toThrow();
    });

    test("login", async () => {
        const auth = await AuthService.create();
        const pass = crypto.randomUUID();
        await auth.register("user1", "good.email@gmail.com", pass, "new troupe");

        // Successful login with username
        await expect(auth.login("user1", pass)).resolves.not.toThrow();

        // Successful login with email
        await expect(auth.login("good.email@gmail.com", pass)).resolves.not.toThrow();

        // Invalid password
        await expect(auth.login("user1", "badpassword")).rejects.toThrow();

        // Invalid user
        await expect(auth.login("user", "badpassword")).rejects.toThrow();
    });

    test("validate and refresh", async () => {
        const auth = await AuthService.create();
        const api = await ApiService.create();

        const pass = crypto.randomUUID();
        const troupeId = await auth.register("user1", "good.email@gmail.com", pass, "new troupe");
        const {accessToken, refreshToken} = await auth.login("user1", pass);

        const payload1 = auth.extractAccessTokenPayload(accessToken);
        expect(auth.validate(payload1)).toBe(true);

        const newCreds = await auth.refreshCredentials(refreshToken);

        const payload2 = auth.extractAccessTokenPayload(newCreds.accessToken);
        expect(auth.validate(payload2)).toBe(true);
    });

    test("delete", async () => {
        const auth = await AuthService.create();
        
        const pass = crypto.randomUUID();
        await auth.register("user1", "good.email@gmail.com", pass, "new troupe");

        await expect(auth.deleteUser("user1", pass)).resolves.not.toThrow();
    });

    test("invite code", async () => {
        const auth = await AuthService.create();
        const core = await CoreService.create();
        const pass = crypto.randomUUID();
        const validInviteCode = INVITE_CODES ? INVITE_CODES.split(",")[0] : "invalid code";
        const invalidInviteCode = "invalid code";

        await core.initSystem();

        if(INVITE_CODES) {
            await expect(
                auth.register("user1", "good.email@gmail.com", pass, "new troupe", validInviteCode)
            ).resolves.not.toThrow();
        }

        await expect(
            auth.register("user1", "good.email@gmail.com", pass, "new troupe", invalidInviteCode)
        ).rejects.toThrow();
    });
});