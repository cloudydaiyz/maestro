import { Path } from "path-parser";

/** Controller function to handle routing */
type Controller = (path: string, headers: Object, body: Object) => {
    status: number,
    headers: Object,
    body?: Object,
    [key: string]: any,
};

namespace Paths {
    export const troupe = Path.createPath("/t/:troupeId");
    export const event = Path.createPath("/t/:troupeId/e/:eventId");
    export const eventType = Path.createPath("/t/:troupeId/et/:eventTypeId");
    export const member = Path.createPath("/t/:troupeId/a/:memberId");
    export const sync = Path.createPath("/t/:troupeId/sync");
}

export const apiController: Controller = (path, headers, body) => {
    // do something
    return { status: 200, headers: {}, body: {} };
}

export const syncController: Controller = (path, headers, body) => {
    // do something
    return { status: 200, headers: {}, body: {} };
}

export const scheduleController: Controller = (path, headers, body) => {
    // do something
    return { status: 200, headers: {}, body: {} };
}