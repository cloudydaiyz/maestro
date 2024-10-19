import assert from "assert";
import { TroupeApiService } from "./services/api";
import { TroupeCoreService } from "./services/core";
import { TroupeSyncService } from "./services/sync";
import { ClientError } from "./util/error";
import { BodySchema, ApiController, Methods, Paths, newController, newUtilController } from "./util/http";

const initApiService = TroupeApiService.create();
const initCoreService = TroupeCoreService.create();
const initSyncService = TroupeSyncService.create();

export const apiController = newController(async (path, method, headers, body) => {
    const [apiService, coreService] = await Promise.all([initApiService, initCoreService]);

    const troupesPath = Paths.Troupes.test(path);
    if(troupesPath) {
        if(method == "POST") {
            return {
                status: 200,
                headers: {},
                body: await coreService.createTroupe(BodySchema.CreateTroupeRequest.parse(body), true),
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
    throw new ClientError("Invalid path");
});

export const syncController = newUtilController(async (body) => {
    const syncService = await initSyncService;
    await syncService.sync(BodySchema.SyncRequest.parse(body).troupeId);
});

export const scheduleController = newController(async (path, headers, body) => {
    // do something
    return { status: 200, headers: {}, body: {} };
});