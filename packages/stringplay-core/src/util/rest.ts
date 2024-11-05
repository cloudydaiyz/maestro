// REST API controller and resource generation

import { Path } from "path-parser";
import { ZodError, z } from "zod";

import { MemberPropertyType, MemberPropertyValue, VariableMemberProperties } from "../types/core-types";
import { CreateEventTypeRequest, UpdateEventTypeRequest, CreateEventRequest, UpdateEventRequest, UpdateTroupeRequest, CreateMemberRequest, UpdateMemberRequest, ApiType, RegisterRequest, LoginRequest, RefreshCredentialsRequest, DeleteUserRequest } from "../types/api-types";
import { AuthenticationError, ClientError } from "./error";
import { CreateTroupeRequest, SyncRequest, ScheduledTaskRequest } from "../types/service-types";
import assert from "assert";
import { TOKEN_HEADER_REGEX } from "./constants";

/** Controller function to handle routing */
export type ApiResponse = {
    status: number,
    headers: Object,
    body?: Object,
};

export type ApiController = (path: string, method: keyof typeof Methods, headers: Object, body: Object) => Promise<ApiResponse>;

/** Creates a new API controller */
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
            } else if(err instanceof AuthenticationError) {
                return {
                    status: 401,
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
}

export type ApiMiddleware = (path: string, method: keyof typeof Methods, headers: Object, body: Object, next: ApiController) => Promise<ApiResponse>;

/** Creates a new API controller with middleware */
export function newControllerWithMiddleware(handlers: ApiMiddleware[], last: ApiController): ApiController {
    const controllers: ApiController[] = [last];

    for(let i = handlers.length - 1; i >= 0; i--) {
        const j = handlers.length - 1 - i;

        // Create a new controller with the next controller as the one we just created
        const nextController: ApiController = async (path, method, headers, body) => {
            return handlers[i](path, method, headers, body, controllers[j]);
        };

        // Add the new controller to the list
        controllers.push(nextController);
    }

    // The last controller should be the entry point for the middleware chain
    return newController(controllers[controllers.length - 1]);
}

export type UtilController = (body: Object) => Promise<ApiResponse>;

/** Creates a new controller for a utility service */
export function newUtilController<T extends Object>(handler: (body: Object) => Promise<T | void>): UtilController {
    return async (body: Object) => {
        try {
            const resBody = await handler(body);
            console.log(resBody ? "Response: " + resBody.toString() : "No response body");
    
            return resBody ? { status: 200, headers: {}, body: resBody } : { status: 204, headers: {} };
        } catch(e) {
            const err = e as Error;
            console.error(err);

            return {
                status: 500,
                headers: {},
                body: {
                    error: "Internal server error",
                },
            }
        }
    };
}

/** path-parser Path with `T` as the union of the given path params */
type ParamPath<T extends string> = Path<{[key in T]: string}>;

/** 
 * All available paths for the API 
 * NOTE: If :troupeId == "me", then the troupeId is the user's troupe
 */
export namespace Paths {
    export const Register = Path.createPath("/auth/register");
    export const Login = Path.createPath("/auth/login");
    export const RefreshCredentials = Path.createPath("/auth/refresh");
    export const DeleteUser = Path.createPath("/auth/delete");

    export const Troupes = Path.createPath("/t");
    export const Troupe: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId");

    export const Console: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/console");
    export const Dashboard: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/dashboard");

    export const Events: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/e");
    export const Event: ParamPath<"troupeId"|"eventId"> = Path.createPath("/t/:troupeId/e/:eventId");

    export const EventTypes: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/et");
    export const EventType: ParamPath<"troupeId"|"eventTypeId"> = Path.createPath("/t/:troupeId/et/:eventTypeId");

    export const Audience: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/m");
    export const Member: ParamPath<"troupeId"|"memberId"> = Path.createPath("/t/:troupeId/m/:memberId");

    export const Attendees: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/a");
    export const Attendee: ParamPath<"troupeId"> = Path.createPath("/t/:troupeId/a");

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

    // ========== API CONTROLLERS ========== //

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

    // ========== SERVICE CONTROLLERS ========== //

    export const SyncRequest: z.ZodType<SyncRequest> = z.object({
        troupeId: z.string(),
    });

    export const ScheduledTaskRequest: z.ZodType<ScheduledTaskRequest> = z.object({
        taskType: z.literal("sync"),
    });
}