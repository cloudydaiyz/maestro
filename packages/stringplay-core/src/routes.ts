// REST API route configuration

import { Path } from "path-parser";

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