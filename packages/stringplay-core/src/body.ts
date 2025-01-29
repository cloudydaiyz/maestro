// REST API request bodies

import { z } from "zod";

import type { MemberPropertyType} from "./types/core-types";
import type { CreateEventTypeRequest, UpdateEventTypeRequest, CreateEventRequest, UpdateEventRequest, UpdateTroupeRequest, CreateMemberRequest, UpdateMemberRequest, ApiType, RegisterRequest, LoginRequest, RefreshCredentialsRequest, DeleteUserRequest, BulkUpdateEventRequest, BulkUpdateEventTypeRequest, BulkUpdateMemberRequest } from "./types/api-types";
import type { CreateTroupeRequest, SyncRequest, ScheduledTaskRequest } from "./types/service-types";

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

/** Request body parsers for API are exported from this namespace */
export namespace BodySchema {
    
    // ========== FOR API CONTROLLERS ========== //

    export const RegisterRequest: z.ZodType<RegisterRequest> = z.object({
        username: z.string(),
        email: z.string(),
        password: z.string(),
        troupeName: z.string(),
        inviteCode: z.string().optional(),
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
        updateFieldMatchers: z.object({
            matchCondition: z.union([z.literal("contains"), z.literal("exact")]),
            fieldExpression: z.string(),
            memberProperty: z.string(),
            filters: z.literal("nocase").array(),
            priority: z.number(),
        }).nullable().array().nullable().optional(),
        removeFieldMatchers: z.number().array().nullable().optional(),
    });

    export const CreateEventRequest: z.ZodType<CreateEventRequest> = z.object({
        title: z.string(),
        startDate: z.string(),
        sourceUri: z.string(),
        eventTypeId: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
    });

    export const CreateEventsRequest: z.ZodType<CreateEventRequest[]> = z.array(CreateEventRequest);

    export const UpdateEventRequest: z.ZodType<UpdateEventRequest> = z.object({
        title: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        sourceUri: z.string().nullable().optional(),
        eventTypeId: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
        updateProperties: z.record(
            z.string(), 
            z.object({ 
                property: z.string().optional(), 
                override: z.boolean().optional(),
            })
        ).nullable().optional(),
        removeProperties: z.string().array().nullable().optional(),
    });

    export const UpdateEventsRequest: z.ZodType<BulkUpdateEventRequest> = z.record(z.string(), UpdateEventRequest);

    export const DeleteEventsRequest: z.ZodType<string[]> = z.array(z.string());

    export const CreateEventTypeRequest: z.ZodType<CreateEventTypeRequest> = z.object({
        title: z.string(),
        value: z.number(),
        sourceFolderUris: z.string().array(),
    });

    export const CreateEventTypesRequest: z.ZodType<CreateEventTypeRequest[]> = z.array(CreateEventTypeRequest);

    export const DeleteEventTypesRequest: z.ZodType<string[]> = z.array(z.string());

    export const UpdateEventTypeRequest: z.ZodType<UpdateEventTypeRequest> = z.object({
        title: z.string().nullable().optional(),
        value: z.number().nullable().optional(),
        addSourceFolderUris: z.string().array().nullable().optional(),
        removeSourceFolderUris: z.string().array().nullable().optional(),
    });

    export const UpdateEventTypesRequest: z.ZodType<BulkUpdateEventTypeRequest> = z.record(z.string(), UpdateEventTypeRequest);
    
    export const CreateMemberRequest: z.ZodType<CreateMemberRequest> = z.object({
        properties: z.object({
            ["Member ID"]: z.string(),
            ["First Name"]: z.string(),
            ["Last Name"]: z.string(),
            ["Email"]: z.string(),
            ["Birthday"]: z.string().nullable(),
        }).catchall(z.union([z.string(), z.boolean(), z.number(), z.null()])),
    });

    export const CreateMembersRequest: z.ZodType<CreateMemberRequest[]> = z.array(CreateMemberRequest);

    export const UpdateMemberRequest: z.ZodType<UpdateMemberRequest> = z.object({
        updateProperties: z.record(z.string(), z.object({
            value: z.union([z.string(), z.boolean(), z.number()]).nullable().optional(),
            override: z.boolean().nullable().optional(),
        })).nullable().optional(),
        removeProperties: z.string().array().nullable().optional(),
    });

    export const UpdateMembersRequest: z.ZodType<BulkUpdateMemberRequest> = z.record(z.string(), UpdateMemberRequest);

    export const DeleteMembersRequest: z.ZodType<string[]> = z.array(z.string());

    // ========== FOR SERVICE CONTROLLERS ========== //

    export const SyncRequest: z.ZodType<SyncRequest> = z.object({
        troupeId: z.string(),
    });

    export const ScheduledTaskRequest: z.ZodType<ScheduledTaskRequest> = z.object({
        taskType: z.enum(["sync", "refreshLimits", "unlockSync"]),
    });
}