// Initialization for all services

import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AttendeeSchema, EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import { MONGODB_PASS, MONGODB_USER } from "../util/env";
import { DB_NAME, SHEETS_REGEX } from "../util/constants";
import { EventDataMap, AttendeeDataMap } from "../types/service-types";
import { ClientError } from "../util/error";
import assert from "assert";
import { newDbConnection, removeDbConnection } from "../util/resources";

/** Allows multiple database services to share the same MongoDB connection */
export class SharedMongoClient {
    // FUTURE: Implement a pseudo connection pool
    static connections: number = 0;
    static client: MongoClient | null = null;
}

/** Base service for all services that interact with the database */
export class BaseDbService {
    /** 
     * Function that resolves on the completion of the class creation. This allows children
     * to define unique criteria that dictates the completion of class initialization.
     */
    ready: Promise<void>;
    readonly client: MongoClient;
    readonly troupeColl: Collection<TroupeSchema>;
    readonly dashboardColl: Collection<TroupeDashboardSchema>;
    readonly eventColl: Collection<EventSchema>;
    readonly audienceColl: Collection<MemberSchema>;
    readonly eventsAttendedColl: Collection<EventsAttendedBucketSchema>;
    
    constructor() {
        // MongoDB URI could be changed from testing -- use the environment variable instead of MONGODB_URI const
        this.client = newDbConnection();

        this.troupeColl = this.client.db(DB_NAME).collection("troupes");
        this.dashboardColl = this.client.db(DB_NAME).collection("dashboards");
        this.audienceColl = this.client.db(DB_NAME).collection("audience");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.eventsAttendedColl = this.client.db(DB_NAME).collection("eventsAttended");
        this.ready = new Promise<void>(resolve => resolve());
    }

    static async create<T extends BaseDbService>(this: new() => T): Promise<T> {
        const service = new this();
        await service.client.connect();
        await service.ready;
        return service;
    }

    async getTroupeSchema(troupeId: string, clientError?: true): Promise<WithId<TroupeSchema>> {
        const schema = await this.troupeColl.findOne({ _id: new ObjectId(troupeId) });
        assert(schema, clientError ? new ClientError("Unable to find troupe") : "Unable to find troupe");
        return schema;
    }

    async getEventSchema(troupeId: string, eventId: string, clientError?: true): Promise<WithId<EventSchema>> {
        const event = await this.eventColl.findOne({ _id: new ObjectId(eventId), troupeId });
        assert(event, clientError ? new ClientError("Unable to find event") : "Unable to find event");
        return event;
    }

    async getEventTypeSchema(troupeId: string, eventTypeId: string, clientError?: true): Promise<WithId<EventTypeSchema>> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, clientError ? new ClientError("Unable to find event type") : "Unable to find event type");
        return eventType;
    }

    getEventTypeSchemaFromTroupe(troupe: WithId<TroupeSchema>, eventTypeId: string, clientError?: true): WithId<EventTypeSchema> {
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, clientError ? new ClientError("Unable to find event type") : "Unable to find event type");
        return eventType;
    }

    async getMemberSchema(troupeId: string, memberId: string, clientError?: true): Promise<WithId<MemberSchema>> {
        const member = await this.audienceColl.findOne({ _id: new ObjectId(memberId), troupeId });
        assert(member, clientError ? new ClientError("Unable to find member") : "Unable to find member");
        return member;
    }

    async getAttendeeSchema(troupeId: string, memberId: string, clientError?: true): Promise<WithId<AttendeeSchema>> {
        const member = await this.getMemberSchema(troupeId, memberId, clientError);
        const attendee: WithId<AttendeeSchema> = { ...member, eventsAttended: {} };

        const buckets = await this.eventsAttendedColl.find({ troupeId, memberId }).toArray();
        for(const bucket of buckets) {
            attendee.eventsAttended = { ...attendee.eventsAttended, ...bucket.events };
        }
        return attendee;
    }

    async getAttendeeSchemas(troupeId: string, clientError?: true): Promise<WithId<AttendeeSchema>[]> {
        const members = await this.audienceColl.find({ troupeId }).toArray();
        const attendees = [];
        
        for (const member of members) {
            const attendee: WithId<AttendeeSchema> = { ...member, eventsAttended: {} };
            const memberId = member._id.toHexString();

            const buckets = await this.eventsAttendedColl.find({ troupeId, memberId }).toArray();
            for(const bucket of buckets) {
                attendee.eventsAttended = { ...attendee.eventsAttended, ...bucket.events };
            }
            attendees.push(attendee);
        }

        return attendees;
    }

    async getDashboardSchema(troupeId: string, clientError?: true): Promise<WithId<TroupeDashboardSchema>> {
        const dashboard = await this.dashboardColl.findOne({ troupeId });
        assert(dashboard, clientError ? new ClientError("Unable to find dashboard") : "Unable to find dashboard");
        return dashboard;
    }

    async close() { return removeDbConnection(this.client) }
}

/** Handles event/member data retrieval and synchronization from a data source */
export abstract class EventDataService {
    ready: Promise<void>;
    troupe: WithId<TroupeSchema>;
    eventMap: EventDataMap;
    attendeeMap: AttendeeDataMap;

    constructor(troupe: WithId<TroupeSchema>, events: EventDataMap, members: AttendeeDataMap) {
        this.troupe = troupe;
        this.eventMap = events;
        this.attendeeMap = members;
        this.ready = this.init();
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
export abstract class TroupeLogService {

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