// REST API request bodies

import { z } from "zod";

import type { MemberPropertyType} from "./types/core-types";
import type { CreateEventTypeRequest, UpdateEventTypeRequest, CreateEventRequest, UpdateEventRequest, UpdateTroupeRequest, CreateMemberRequest, UpdateMemberRequest, ApiType, RegisterRequest, LoginRequest, RefreshCredentialsRequest, DeleteUserRequest } from "./types/api-types";
import type { CreateTroupeRequest, SyncRequest, ScheduledTaskRequest } from "./types/service-types";

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