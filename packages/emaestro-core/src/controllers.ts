import EventEmitter from "events";
import { TroupeApiService } from "./services/api";
import { TroupeCoreService } from "./services/core";
import { TroupeSyncService } from "./services/sync";
import { ClientError } from "./util/error";
import { BodySchema, Paths, newController, newUtilController } from "./util/rest";
import { z } from "zod";
import { DEV_MODE } from "./util/env";
import { BaseDbService } from "./services/base";
import { addToSyncQueue, bulkAddToSyncQueue } from "./cloud/gcp";
import { SyncRequest } from "./types/service-types";
import { AuthService } from "./services/auth";

const initAuthService = AuthService.create();
const initApiService = TroupeApiService.create();
const initCoreService = TroupeCoreService.create();
const initSyncService = TroupeSyncService.create();

export const apiController = newController(async (path, method, headers, body) => {
    const [authService, apiService, coreService] = await Promise.all([initAuthService, initApiService, initCoreService]);

    const registerPath = Paths.Register.test(path);
    if(registerPath) {
        if(method == "POST") {
            const {username, email, password, troupeName} = BodySchema.RegisterRequest.parse(body);
            return {
                status: 200,
                headers: {},
                body: await authService.register(username, email, password, troupeName),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const loginPath = Paths.Login.test(path);
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

    const refreshPath = Paths.RefreshCredentials.test(path);
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

    const deleteUserPath = Paths.DeleteUser.test(path);
    if(deleteUserPath) {
        if(method == "DELETE") {
            const {usernameOrEmail, password} = BodySchema.DeleteUserRequest.parse(body);
            await authService.deleteUser(usernameOrEmail, password);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const troupesPath = Paths.Troupes.test(path);
    if(troupesPath) {
        if(method == "POST") {
            return {
                status: 200,
                headers: {},
                body: { troupeId: await coreService.createTroupe(BodySchema.CreateTroupeRequest.parse(body), true), },
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const troupePath = Paths.Troupe.test(path);
    if(troupePath) {
        if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getTroupe(troupePath.troupeId),
            }
        } else if(method == "PUT") {
            return {
                status: 200,
                headers: {},
                body: await apiService.updateTroupe(troupePath.troupeId, BodySchema.UpdateTroupeRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            await coreService.deleteTroupe(troupePath.troupeId);
            return {
                status: 200,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventsPath = Paths.Events.test(path);
    if(eventsPath) {
        if(method == "POST") {
            return {
                status: 200,
                headers: {},
                body: await apiService.createEvent(eventsPath.troupeId, BodySchema.CreateEventRequest.parse(body)),
            }
        } else if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getEvents(eventsPath.troupeId),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventPath = Paths.Event.test(path);
    if(eventPath) {
        if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getEvent(eventPath.eventId, eventPath.troupeId),
            }
        } else if(method == "PUT") {
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEvent(eventPath.troupeId, eventPath.eventId, BodySchema.UpdateEventRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            await apiService.deleteEvent(eventPath.troupeId, eventPath.eventId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventTypesPath = Paths.EventTypes.test(path);
    if(eventTypesPath) {
        if(method == "POST") {
            return {
                status: 200,
                headers: {},
                body: await apiService.createEventType(eventTypesPath.troupeId, BodySchema.CreateEventTypeRequest.parse(body)),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const eventTypePath = Paths.EventType.test(path);
    if(eventTypePath) {
        if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getEventType(eventTypePath.eventTypeId, eventTypePath.troupeId),
            }
        } else if(method == "PUT") {
            return {
                status: 200,
                headers: {},
                body: await apiService.updateEventType(eventTypePath.troupeId, eventTypePath.eventTypeId, BodySchema.UpdateEventTypeRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            await apiService.deleteEventType(eventTypePath.troupeId, eventTypePath.eventTypeId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const audiencePath = Paths.Audience.test(path);
    if(audiencePath) {
        if(method == "POST") {
            return {
                status: 200,
                headers: {},
                body: await apiService.createMember(audiencePath.troupeId, BodySchema.CreateMemberRequest.parse(body)),
            }
        } else if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getAudience(audiencePath.troupeId),
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const memberPath = Paths.Member.test(path);
    if(memberPath) {
        if(method == "GET") {
            return {
                status: 200,
                headers: {},
                body: await apiService.getMember(memberPath.memberId, memberPath.troupeId),
            }
        } else if(method == "PUT") {
            return {
                status: 200,
                headers: {},
                body: await apiService.updateMember(memberPath.troupeId, memberPath.memberId, BodySchema.UpdateMemberRequest.parse(body)),
            }
        } else if(method == "DELETE") {
            await apiService.deleteMember(memberPath.troupeId, memberPath.memberId);
            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    const syncPath = Paths.Sync.test(path);
    if(syncPath) {
        if(method == "POST") {
            console.log("Sending sync event for troupe " + syncPath.troupeId);

            // Send the sync event to the (dev/actual) sync service
            if(DEV_MODE) {
                syncServer.emit("sync", { troupeId: syncPath.troupeId });
            } else {
                await apiService.initiateSync(syncPath.troupeId);
            }

            return {
                status: 204,
                headers: {},
            }
        }
        throw new ClientError("Invalid method for path");
    }

    throw new ClientError("Invalid path");
});

export const syncController = newUtilController(async (body) => {
    const parsedBody = BodySchema.SyncRequest.parse(body);

    console.log(`Syncing troupe ${parsedBody.troupeId}...`);
    const syncService = await initSyncService;
    await syncService.sync(parsedBody.troupeId);
});

export const scheduleController = newUtilController(async (body) => {
    const [ coreService ] = await Promise.all([initCoreService]);
    const parsedBody = BodySchema.ScheduledTaskRequest.parse(body);

    console.log(`Performing scheduled task (${parsedBody.taskType})...`);
    if(parsedBody.taskType == "sync") {
        const db = await BaseDbService.create();
        const syncRequests: SyncRequest[] = await db.troupeColl.find({}).toArray()
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

/** 
 * // ========== EVENT EMITTERS ========== //
 * 
 * The event emitters acts as a separate service for responding to service requests.
 * 
 * This is to simulate the actual services other than the API that will be active in 
 * the system in production for the dev environment.
 * 
 * The emitter won't respond to events unless a server is set up (see `server.ts`).
 */

/** An event emitter that acts as the sync service to respond to sync requests. */
export const syncServer = new EventEmitter<{sync: [z.infer<typeof BodySchema.SyncRequest>]}>();

/** An event emitter that acts as the scheduled task service to respond to scheduled tasks. */
export const scheduleServer = new EventEmitter<{task: [z.infer<typeof BodySchema.ScheduledTaskRequest>]}>();