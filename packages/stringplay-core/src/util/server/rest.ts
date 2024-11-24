// REST API controller and resource generation

import { ZodError } from "zod";
import { AuthenticationError, ClientError } from "../error";

/** All available methods for the API */
export const Methods = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    DELETE: "DELETE",
    OPTIONS: "OPTIONS",
}

/** Controller function to handle routing */
export type ApiResponse = {
    status: number,
    headers: Object,
    body?: Object,
};

export type ApiController = (path: string, method: keyof typeof Methods, headers: Object, body: Object) => Promise<ApiResponse>;

// const headers = {
//     "Access-Control-Allow-Origin": event.headers.origin == "http://localhost:5173" ?
//         "http://localhost:5173" : "https://qa-pup.pages.dev",
//     "Access-Control-Allow-Headers": "*",
//     "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
// };

const defaultHeaders = {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": Object.keys(Methods).join(','),
};

/** Creates a new API controller */
export function newController(handler: ApiController): ApiController {
    return async (path, method, headers, body) => {
        try {
            if(method == "OPTIONS") {
                return {
                    status: 204,
                    headers: defaultHeaders,
                }
            }

            const res = await handler(path, method, headers, body);
            res.headers = { ...res.headers, ...defaultHeaders };
            return res;
        } catch(e) {
            const err = e as Error;
            console.error(err);

            if(err instanceof ZodError) {
                return {
                    status: 400,
                    headers: defaultHeaders,
                    body: {
                        error: "Invalid request body",
                    },
                }
            } else if(err instanceof ClientError) {
                return {
                    status: 400,
                    headers: defaultHeaders,
                    body: {
                        error: err.message,
                    },
                }
            } else if(err instanceof AuthenticationError) {
                return {
                    status: 401,
                    headers: defaultHeaders,
                    body: {
                        error: err.message,
                    },
                }
            }

            return {
                status: 500,
                headers: defaultHeaders,
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