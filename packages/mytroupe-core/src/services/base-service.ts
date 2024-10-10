// Initialization for all services

import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AttendeeSchema, EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "../util/env";
import { DB_NAME } from "../util/constants";
import { EventMap, MemberMap } from "../types/service-types";
import assert from "assert";
import { MyTroupeClientError } from "../util/error";

export class BaseService {
    protected client: MongoClient;
    protected connection: Promise<MongoClient>;
    protected troupeColl: Collection<TroupeSchema>;
    protected dashboardColl: Collection<TroupeDashboardSchema>;
    protected eventColl: Collection<EventSchema>;
    protected audienceColl: Collection<MemberSchema>;
    protected eventsAttendedColl: Collection<EventsAttendedBucketSchema>;
    
    constructor() {
        this.client = new MongoClient(MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        this.connection = this.client.connect();
        this.troupeColl = this.client.db(DB_NAME).collection("troupes");
        this.dashboardColl = this.client.db(DB_NAME).collection("dashboards");
        this.audienceColl = this.client.db(DB_NAME).collection("audience");
        this.eventColl = this.client.db(DB_NAME).collection("events");
        this.eventsAttendedColl = this.client.db(DB_NAME).collection("eventsAttended");
    }

    protected async getTroupeSchema(troupeId: string, clientError?: true): Promise<WithId<TroupeSchema>> {
        const schema = await this.troupeColl.findOne({ _id: new ObjectId(troupeId) });
        assert(schema, clientError ? new MyTroupeClientError("Unable to find troupe") : "Unable to find troupe");
        return schema;
    }

    protected async getEventSchema(troupeId: string, eventId: string, clientError?: true): Promise<WithId<EventSchema>> {
        const event = await this.eventColl.findOne({ _id: new ObjectId(eventId), troupeId });
        assert(event, clientError ? new MyTroupeClientError("Unable to find event") : "Unable to find event");
        return event;
    }

    protected async getEventTypeSchema(troupeId: string, eventTypeId: string, clientError?: true): Promise<EventTypeSchema> {
        const troupe = await this.getTroupeSchema(troupeId, true);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, clientError ? new MyTroupeClientError("Unable to find event type") : "Unable to find event type");
        return eventType;
    }

    protected async getMemberSchema(troupeId: string, memberId: string, clientError?: true): Promise<WithId<MemberSchema>> {
        const member = await this.audienceColl.findOne({ _id: new ObjectId(memberId), troupeId });
        assert(member, clientError ? new MyTroupeClientError("Unable to find member") : "Unable to find member");
        return member;
    }
}

// Handles event/member data retrieval and synchronization from a data source
export abstract class EventDataService {
    ready: Promise<void>;
    troupe: WithId<TroupeSchema>;
    events: EventMap;
    members: MemberMap;

    constructor(troupe: WithId<TroupeSchema>, events: EventMap, members: MemberMap) {
        this.troupe = troupe;
        this.events = events;
        this.members = members;
        this.ready = this.init();
    }

    abstract init(): Promise<void>;
    abstract discoverAudience(event: WithId<EventSchema>, lastUpdated: Date): Promise<void>;
}

// Handles the update of troupe logs
export abstract class TroupeLogService {
    abstract createLog(troupe: WithId<TroupeSchema>): Promise<string>;
    abstract deleteLog(troupe: WithId<TroupeSchema>): Promise<void>;
    protected abstract updateLog(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<AttendeeSchema>[]): Promise<void>;
}