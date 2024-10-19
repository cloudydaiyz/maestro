// HTTP information for API

import { Path } from "path-parser";
import { ZodError, z } from "zod";

import { MemberPropertyType, VariableMemberProperties } from "../types/core-types";
import { CreateEventTypeRequest, UpdateEventTypeRequest, CreateEventRequest, UpdateEventRequest, UpdateTroupeRequest, CreateMemberRequest, UpdateMemberRequest } from "../types/api-types";
import { ClientError } from "./error";
import { CreateTroupeRequest } from "../types/service-types";
import assert from "assert";

/** Controller function to handle routing */
export type ApiResponse = {
    status: number,
    headers: Object,
    body?: Object,
};

export type ApiController = (path: string, method: keyof typeof Methods, headers: Object, body: Object) => Promise<ApiResponse>;

/** Creates a new API controller function */
export function newController(handler: ApiController): ApiController {
    return async (path, method, headers, body) => {
        try {
            return await handler(path, method, headers, body);
        } catch(e) {
            const err = e as Error;
            console.error(err);

            if(err instanceof ZodError) {
                return {
                    status: 400,
                    headers: {},
                    body: {
                        error: "Invalid request body",
                    },
                }
            } else if(err instanceof ClientError) {
                return {
                    status: 400,
                    headers: {},
                    body: {
                        error: err.message,
                    },
                }
            }

            return {
                status: 500,
                headers: {},
                body: {
                    error: "Internal server error",
                },
            }
        }
    }
};

export function newUtilController<T extends Object>(handler: (body: Object) => Promise<T | void>): ApiController {
    return newController(async (path, method, headers, body) => {
        if(path) assert(path == "POST", new ClientError("Invalid method"));
        const resBody = await handler(body);
        console.log(resBody);

        return resBody ? { status: 200, headers: {}, body: resBody } : { status: 204, headers: {} };
    });
}

/** path-parser Path with the path params in T */
type ParamPath<T extends string> = Path<{[key in T]: string}>;

/** All available paths for the API */
export namespace Paths {
    export const Troupes = Path.createPath("/t");
    export const Troupe: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId");

    export const Events: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/e");
    export const Event: ParamPath<"troupeId"|"eventId"> = Path.createPath("/t/:troupeId/e/:eventId");

    export const EventTypes: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/et");
    export const EventType: ParamPath<"troupeId"|"eventTypeId"> = Path.createPath("/t/:troupeId/et/:eventTypeId");

    export const Audience: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/a");
    export const Member: ParamPath<"troupeId"|"memberId"> = Path.createPath("/t/:troupeId/a/:memberId");

    export const Sync: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/sync");
}

/** All available methods for the API */
export const Methods = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    DELETE: "DELETE",
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

    const VariableMemberProperties: z.ZodType<VariableMemberProperties> = z.record(z.string(), z.object({
        value: z.union([z.string(), z.boolean(), z.number(), z.date()]),
        override: z.boolean(),
    }));


    // ====================
    // == API CONTROLLER ==

    export const CreateTroupeRequest: z.ZodType<CreateTroupeRequest> = z.object({
        name: z.string(),
    });

    export const UpdateTroupeRequest: z.ZodType<UpdateTroupeRequest> = z.object({
        name: z.string().optional(),
        originEventId: z.string().optional(),
        removeMemberProperties: z.string().array().optional(),
        updateMemberProperties: z.record(z.string(), MemberPropertyType).optional(),
        updatePointTypes: z.record(z.string(), z.object({
            startDate: z.string(),
            endDate: z.string(),
        })),
        removePointTypes: z.string().array().optional(),
    });

    export const CreateEventRequest: z.ZodType<CreateEventRequest> = z.object({
        title: z.string(),
        startDate: z.string(),
        sourceUri: z.string(),
        eventTypeId: z.string().optional(),
        value: z.number().optional(),
    });

    export const UpdateEventRequest: z.ZodType<UpdateEventRequest> = z.object({
        title: z.string().optional(),
        startDate: z.string().optional(),
        sourceUri: z.string().optional(),
        eventTypeId: z.string().optional(),
        value: z.number().optional(),
        updateProperties: z.record(z.string(), z.string()).optional(),
        removeProperties: z.string().array().optional(),
    });

    export const CreateEventTypeRequest: z.ZodType<CreateEventTypeRequest> = z.object({
        title: z.string(),
        value: z.number(),
        sourceFolderUris: z.string().array(),
    });

    export const UpdateEventTypeRequest: z.ZodType<UpdateEventTypeRequest> = z.object({
        title: z.string().optional(),
        value: z.number().optional(),
        addSourceFolderUris: z.string().array().optional(),
        removeSourceFolderUris: z.string().array().optional(),
    });

    export const CreateMemberRequest: z.ZodType<CreateMemberRequest> = z.object({
        properties: z.object({
            ["Member ID"]: z.object({ value: z.string(), override: z.boolean() }),
            ["First Name"]: z.object({ value: z.string(), override: z.boolean() }),
            ["Last Name"]: z.object({ value: z.string(), override: z.boolean() }),
            ["Email"]: z.object({ value: z.string(), override: z.boolean() }),
            ["Birthday"]: z.object({ value: z.string(), override: z.boolean() }),
        }).catchall(VariableMemberProperties),
    });

    export const UpdateMemberRequest: z.ZodType<UpdateMemberRequest> = z.object({
        updateProperties: z.record(z.string(), z.object({
            value: z.union([z.string(), z.boolean(), z.number()]).optional(),
            override: z.boolean().optional(),
        })).optional(),
        removeProperties: z.string().array().optional(),
    });


    // ========================
    // == SERVICE CONTROLLER ==

    export const SyncRequest: z.ZodType<{troupeId: string}> = z.object({
        troupeId: z.string(),
    });
}