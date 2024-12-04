import { WithId } from "mongodb";
import { TroupeSchema, TroupeLimit, EventSchema, AttendeeSchema } from "../../types/core-types";
import { EventDataMap, AttendeeDataMap } from "../../types/service-types";
import { getMatcherRegex } from "../../util/helper";

/** Handles event/member data retrieval and synchronization from a data source */
export abstract class EventDataService {
    ready: Promise<void>;
    troupe: WithId<TroupeSchema>;
    eventMap: EventDataMap;
    attendeeMap: AttendeeDataMap;
    currentLimits: TroupeLimit;
    incrementLimits: Partial<TroupeLimit>;

    constructor(troupe: WithId<TroupeSchema>, events: EventDataMap, members: AttendeeDataMap,
        currentLimits: TroupeLimit, incrementLimits: Partial<TroupeLimit>) {
        this.ready = this.init();
        this.troupe = troupe;
        this.eventMap = events;
        this.attendeeMap = members;
        this.currentLimits = currentLimits;
        this.incrementLimits = incrementLimits;
    }

    abstract init(): Promise<void>;
    abstract discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void>;
}

/**
 * Handles the management of troupe logs. If provided, all events and attendee schema must be from the provided troupe.
 * Ensure the events are sorted by ascending start date, and audience by ascending total membership points. e.g.:
 * - `events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());`
 * - `audience.sort((a, b) => a.points["Total"] - b.points["Total"]);`
 */
export abstract class LogSheetService {

    /** Creates a log for the provided troupe, events, and audience (if provided) and returns the URI */
    abstract createLog(troupe: WithId<TroupeSchema>, events?: WithId<EventSchema>[], audience?: WithId<AttendeeSchema>[]): Promise<string>;

    /** Deletes the log at the provided URI */
    abstract deleteLog(uri: string): Promise<void>;

    /** Updates the log for the provided troupe with the provided events and audience */
    abstract updateLog(uri: string, troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<AttendeeSchema>[]): Promise<void>;

    /** 
     * Validates the log at the provided URI. The parameters and log sheet should pass the following checks:
     * - The log sheet URI must be valid and, if provided, must match the troupe log sheet URI
     * - The events must be sorted by ascending start date, and audience by ascending total membership points
     * - The **Event Type Log**, **Event Log**, and **Member Log** sheets exist in the respective order
     * - The values on the log must be correct according to the provided troupe, events, and audience
     * - The headers must be properly formatted according to the provided troupe, events, and audience
     */
    abstract validateLog(uri: string, troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<AttendeeSchema>[]): Promise<boolean>;

    /** Validates the log for the provided URI against the provided troupe, events, and audience */
    validateParams(uri?: string | undefined, troupe?: WithId<TroupeSchema>, events?: WithId<EventSchema>[], audience?: WithId<AttendeeSchema>[]): boolean {

        if(!uri) uri = troupe?.logSheetUri;
        if(!uri || !this.validateLogUri(uri)) return false;

        if(events) {
            const eventsSorted = events.every((event, i) => {
                if(i == events.length - 1) return true;
                return event.startDate.getTime() <= events[i + 1].startDate.getTime();
            });
            if(!eventsSorted) return false;
        }

        if(audience) {
             const audienceSorted = audience.every((member, i) => {
                if(i == audience.length - 1) return true;
                return member.points["Total"] <= audience[i + 1].points["Total"];
            });
            if(!audienceSorted) return false;
        }

        return true;
    };

    /** Validates the given log URI */
    abstract validateLogUri(uri: string): boolean;
}