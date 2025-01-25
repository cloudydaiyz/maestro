import EventEmitter from "events";
import { ApiService } from "./services/api";
import { CoreService } from "./services/core";
import { SyncService } from "./services/sync";
import { AuthenticationError, ClientError } from "./util/error";
import { ApiController, ApiMiddleware, newController, newControllerWithMiddleware, newUtilController } from "./util/server/rest";
import { z } from "zod";
import { DEV_MODE } from "./util/env";
import { BaseDbService } from "./services/base";
import { SyncRequest } from "./types/service-types";
import { AuthService } from "./services/auth";
import assert from "assert";
import { AccessTokenPayload, AuthorizationHeader } from "./types/api-types";
import { PathParsers } from "./routes";
import { BodySchema } from "./body";
import { syncServer } from "./util/server/emitters";

const initAuthService = AuthService.create();
const initApiService = ApiService.create();
const initCoreService = CoreService.create();
const initSyncService = SyncService.create();

/** All paths in the API with a prefix of `/t/:troupeId` will be handled by this controller to simplify authentication. */ 
const apiTroupePathsHandler: ApiController = async (path, method, headers, body) => {
    const [authService, apiService] = await Promise.all([initAuthService, initApiService]);
    const accessToken = "_accessToken" in headers ? headers["_accessToken"] as AccessTokenPayload | null : null;

    let troupeId = PathParsers.Troupe.partialTest(path)?.troupeId;
    if(!troupeId) {
        throw new Error("Invalid path");
    } else if(troupeId == "me") {
        assert(accessToken, new ClientError("Missing access token"));
        troupeId = accessToken.troupeId;
    }

    const troupePath = PathParsers.Troupe.test(path);
    if(troupePath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getTroupe(troupeId),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateTroupe(troupeId, BodySchema.UpdateTroupeRequest.parse(body)),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const consolePath = PathParsers.Console.test(path);
    if(consolePath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getConsoleData(troupeId),
            }
        }
    }

    const dashboardPath = PathParsers.Dashboard.test(path);
    if(dashboardPath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getDashboard(troupeId),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventsPath = PathParsers.Events.test(path);
    if(eventsPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createEvent(troupeId, BodySchema.CreateEventRequest.parse(body)),
            }
        } else if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getEvents(troupeId),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkEventsPath = PathParsers.BulkEvents.test(path);
    if(bulkEventsPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createEvents(troupeId, BodySchema.CreateEventsRequest.parse(body)),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEvents(troupeId, BodySchema.UpdateEventsRequest.parse(body)),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkDeleteEventsPath = PathParsers.BulkDeleteEvents.test(path);
    if(bulkDeleteEventsPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteEvents(troupeId, BodySchema.DeleteEventsRequest.parse(body));
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventPath = PathParsers.Event.test(path);
    if(eventPath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getEvent(eventPath.eventId, troupeId),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEvent(troupeId, eventPath.eventId, BodySchema.UpdateEventRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteEvent(troupeId, eventPath.eventId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventTypesPath = PathParsers.EventTypes.test(path);
    if(eventTypesPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createEventType(troupeId, BodySchema.CreateEventTypeRequest.parse(body)),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkEventTypesPath = PathParsers.BulkEventTypes.test(path);
    if(bulkEventTypesPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createEventTypes(troupeId, BodySchema.CreateEventTypesRequest.parse(body)),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEventTypes(troupeId, BodySchema.UpdateEventTypesRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteEventTypes(troupeId, BodySchema.DeleteEventTypesRequest.parse(body));
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkDeleteEventTypesPath = PathParsers.BulkDeleteEventTypes.test(path);
    if(bulkDeleteEventTypesPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteEventTypes(troupeId, BodySchema.DeleteEventTypesRequest.parse(body));
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventTypePath = PathParsers.EventType.test(path);
    if(eventTypePath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getEventType(eventTypePath.eventTypeId, troupeId),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEventType(troupeId, eventTypePath.eventTypeId, BodySchema.UpdateEventTypeRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteEventType(troupeId, eventTypePath.eventTypeId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const audiencePath = PathParsers.Audience.test(path);
    if(audiencePath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createMember(troupeId, BodySchema.CreateMemberRequest.parse(body)),
            }
        } else if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getAudience(troupeId),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkAudiencePath = PathParsers.BulkAudience.test(path);
    if(bulkAudiencePath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.createMembers(troupeId, BodySchema.CreateMembersRequest.parse(body)),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateMembers(troupeId, BodySchema.UpdateMembersRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteMembers(troupeId, BodySchema.DeleteMembersRequest.parse(body));
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const bulkDeleteAudiencePath = PathParsers.BulkDeleteAudience.test(path);
    if(bulkDeleteAudiencePath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteMembers(troupeId, BodySchema.DeleteMembersRequest.parse(body));
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const memberPath = PathParsers.Member.test(path);
    if(memberPath) {
        if(method == "GET") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.getMember(memberPath.memberId, troupeId),
            }
        } else if(method == "PUT") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            return {
                status: 200,
                headers: {},
                body: await apiService.updateMember(troupeId, memberPath.memberId, BodySchema.UpdateMemberRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.deleteMember(troupeId, memberPath.memberId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const syncPath = PathParsers.Sync.test(path);
    if(syncPath) {
        if(method == "POST") {
            assert(authService.validate(accessToken, troupeId, 0), new AuthenticationError("Invalid credentials"));
            await apiService.initiateSync(troupeId);

            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    throw new ClientError("Invalid path");
};

const authMiddleware: ApiMiddleware = async (path, method, headers: AuthorizationHeader, body, next) => {
    const [authService] = await Promise.all([initAuthService]);

    const registerPath = PathParsers.Register.test(path);
    if(registerPath) {
        if(method == "POST") {
            const { username, email, password, troupeName, inviteCode } = BodySchema.RegisterRequest.parse(body);
            await authService.register(username, email, password, troupeName, inviteCode);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const loginPath = PathParsers.Login.test(path);
    if(loginPath) {
        if(method == "POST") {
            const {usernameOrEmail, password} = BodySchema.LoginRequest.parse(body);
            return {
                status: 200,
                headers: {},
                body: await authService.login(usernameOrEmail, password),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const refreshPath = PathParsers.RefreshCredentials.test(path);
    if(refreshPath) {
        if(method == "POST") {
            const {refreshToken} = BodySchema.RefreshCredentialsRequest.parse(body);
            return {
                status: 200,
                headers: {},
                body: await authService.refreshCredentials(refreshToken),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const deleteUserPath = PathParsers.DeleteUser.test(path);
    if(deleteUserPath) {
        if(method == "POST") {
            const {usernameOrEmail, password} = BodySchema.DeleteUserRequest.parse(body);
            await authService.deleteUser(usernameOrEmail, password);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    headers._accessToken = authService.fromHeaders(headers);
    return next(path, method, headers, body);
};

export const initController = newUtilController(async () => {
    const coreService = await initCoreService;
    await coreService.initSystem();
});

export const apiController = newControllerWithMiddleware([authMiddleware], apiTroupePathsHandler);

export const syncController = newUtilController(async (body) => {
    const parsedBody = BodySchema.SyncRequest.parse(body);

    console.log(`Syncing troupe ${parsedBody.troupeId}...`);
    const syncService = await initSyncService;
    await syncService.sync(parsedBody.troupeId);
});

export const scheduleController = newUtilController(async (body) => {
    const [coreService] = await Promise.all([initCoreService]);
    const parsedBody = BodySchema.ScheduledTaskRequest.parse(body);

    console.log(`Performing scheduled task (${parsedBody.taskType})...`);
    if(parsedBody.taskType == "sync") {
        const db = await BaseDbService.create();
        const syncRequests: SyncRequest[] = await db.troupeColl.find().toArray()
            .then(troupes => troupes.map(t => ({ troupeId: t._id.toHexString() })));

        // Sync all the troupes currently in the collection
        if(DEV_MODE && syncServer.listenerCount("sync") > 0) {
            for(const request of syncRequests) {
                syncServer.emit("sync", request);
            }
        } else if(!DEV_MODE) {
            await coreService.syncTroupes();
        }
    }
});