// REST API route configuration

import { Path } from "path-parser";
import { z } from "zod";

import type { MemberPropertyType} from "./types/core-types";
import type { CreateEventTypeRequest, UpdateEventTypeRequest, CreateEventRequest, UpdateEventRequest, UpdateTroupeRequest, CreateMemberRequest, UpdateMemberRequest, ApiType, RegisterRequest, LoginRequest, RefreshCredentialsRequest, DeleteUserRequest } from "./types/api-types";
import type { CreateTroupeRequest, SyncRequest, ScheduledTaskRequest } from "./types/service-types";

/** 
 * All available paths for the API 
 * NOTE: If :troupeId == "me", then the troupeId is the user's troupe
 */
export namespace Paths {
    export const Register = "/auth/register";
    export const Login = "/auth/login";
    export const RefreshCredentials = "/auth/refresh";
    export const DeleteUser = "/auth/delete";

    export const Troupes = "/t";
    export const Troupe = "/t/:troupeId";

    export const Console = "/t/:troupeId/console";
    export const Dashboard = "/t/:troupeId/dashboard";

    export const Events = "/t/:troupeId/e";
    export const Event = "/t/:troupeId/e/:eventId";

    export const EventTypes = "/t/:troupeId/et";
    export const EventType = "/t/:troupeId/et/:eventTypeId";

    export const Audience = "/t/:troupeId/m";
    export const Member = "/t/:troupeId/m/:memberId";

    export const Attendees = "/t/:troupeId/a";
    export const Attendee = "/t/:troupeId/a";

    export const Sync = "/t/:troupeId/sync";
}

/** path-parser Path with `T` as the union of the given path params */
type ParamPath<T extends string> = Path<{[key in T]: string}>;

/** Parsers for all available paths for the API */
export namespace PathParsers {
    export const Register = Path.createPath(Paths.Register);
    export const Login = Path.createPath(Paths.Login);
    export const RefreshCredentials = Path.createPath(Paths.RefreshCredentials);
    export const DeleteUser = Path.createPath(Paths.DeleteUser);

    export const Troupes = Path.createPath(Paths.Troupes);
    export const Troupe: ParamPath<"troupeId"> = Path.createPath(Paths.Troupe);

    export const Console: ParamPath<"troupeId"> = Path.createPath(Paths.Console);
    export const Dashboard: ParamPath<"troupeId"> = Path.createPath(Paths.Dashboard);

    export const Events: ParamPath<"troupeId"> = Path.createPath(Paths.Events);
    export const Event: ParamPath<"troupeId"|"eventId"> = Path.createPath(Paths.Event);

    export const EventTypes: ParamPath<"troupeId"> = Path.createPath(Paths.EventTypes);
    export const EventType: ParamPath<"troupeId"|"eventTypeId"> = Path.createPath(Paths.EventType);

    export const Audience: ParamPath<"troupeId"> = Path.createPath(Paths.Audience);
    export const Member: ParamPath<"troupeId"|"memberId"> = Path.createPath(Paths.Member);

    export const Attendees: ParamPath<"troupeId"> = Path.createPath(Paths.Attendees);
    export const Attendee: ParamPath<"troupeId"> = Path.createPath(Paths.Attendee);

    export const Sync: ParamPath<"troupeId"> = Path.createPath(Paths.Sync);
}

/** Request body parsers for API are exported from this namespace */
export namespace BodySchema {
    const MemberPropertyType: z.ZodType<MemberPropertyType> = z.union([
        z.literal("string?"), 
        z.literal("string!"), 
        z.literal("number?"),
        z.literal("number!"), 
        z.literal("boolean?"),
        z.literal("boolean!"),
        z.literal("date?"),
        z.literal("date!"),
    ]);

    // ========== FOR API CONTROLLERS ========== //

    export const RegisterRequest: z.ZodType<RegisterRequest> = z.object({
        username: z.string(),
        email: z.string(),
        password: z.string(),
        troupeName: z.string(),
    });

    export const LoginRequest: z.ZodType<LoginRequest> = z.object({
        usernameOrEmail: z.string(),
        password: z.string(),
    });

    export const RefreshCredentialsRequest: z.ZodType<RefreshCredentialsRequest> = z.object({
        refreshToken: z.string(),
    });

    export const DeleteUserRequest: z.ZodType<DeleteUserRequest> = z.object({
        usernameOrEmail: z.string(),
        password: z.string(),
    });

    export const CreateTroupeRequest: z.ZodType<CreateTroupeRequest> = z.object({
        name: z.string(),
    });

    export const UpdateTroupeRequest: z.ZodType<UpdateTroupeRequest> = z.object({
        name: z.string().nullable().optional(),
        originEventId: z.string().nullable().optional(),
        removeMemberProperties: z.string().array().nullable().optional(),
        updateMemberProperties: z.record(z.string(), MemberPropertyType).nullable().optional(),
        updatePointTypes: z.record(z.string(), z.object({
            startDate: z.string(),
            endDate: z.string(),
        })).nullable().optional(),
        removePointTypes: z.string().array().nullable().optional(),
    });

    export const CreateEventRequest: z.ZodType<CreateEventRequest> = z.object({
        title: z.string(),
        startDate: z.string(),
        sourceUri: z.string(),
        eventTypeId: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
    });

    export const UpdateEventRequest: z.ZodType<UpdateEventRequest> = z.object({
        title: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        sourceUri: z.string().nullable().optional(),
        eventTypeId: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
        updateProperties: z.record(z.string(), z.string()).nullable().optional(),
        removeProperties: z.string().array().nullable().optional(),
    });

    export const CreateEventTypeRequest: z.ZodType<CreateEventTypeRequest> = z.object({
        title: z.string(),
        value: z.number(),
        sourceFolderUris: z.string().array(),
    });

    export const UpdateEventTypeRequest: z.ZodType<UpdateEventTypeRequest> = z.object({
        title: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
        addSourceFolderUris: z.string().array().nullable().optional(),
        removeSourceFolderUris: z.string().array().nullable().optional(),
    });
    
    export const CreateMemberRequest: z.ZodType<CreateMemberRequest> = z.object({
        properties: z.object({
            ["Member ID"]: z.string(),
            ["First Name"]: z.string(),
            ["Last Name"]: z.string(),
            ["Email"]: z.string(),
            ["Birthday"]: z.string().nullable(),
        }).catchall(z.union([z.string(), z.boolean(), z.number(), z.null()])),
    });

    export const UpdateMemberRequest: z.ZodType<UpdateMemberRequest> = z.object({
        updateProperties: z.record(z.string(), z.object({
            value: z.union([z.string(), z.boolean(), z.number()]).nullable().optional(),
            override: z.boolean().nullable().optional(),
        })).nullable().optional(),
        removeProperties: z.string().array().nullable().optional(),
    });

    // ========== FOR SERVICE CONTROLLERS ========== //

    export const SyncRequest: z.ZodType<SyncRequest> = z.object({
        troupeId: z.string(),
    });

    export const ScheduledTaskRequest: z.ZodType<ScheduledTaskRequest> = z.object({
        taskType: z.literal("sync"),
    });
}