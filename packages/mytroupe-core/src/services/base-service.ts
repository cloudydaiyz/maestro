// Initialization for all services

import { Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { EventsAttendedBucketSchema, EventSchema, EventTypeSchema, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import { MONGODB_PASS, MONGODB_URI, MONGODB_USER } from "../util/env";
import { DB_NAME } from "../util/constants";
import { EventMap, MemberMap } from "../types/service-types";
import assert from "assert";
import { MyTroupeClientError } from "../util/error";

export class BaseService {
    client: MongoClient;
    connection: Promise<MongoClient>;
    troupeColl: Collection<TroupeSchema>;
    dashboardColl: Collection<TroupeDashboardSchema>;
    eventColl: Collection<EventSchema>;
    audienceColl: Collection<MemberSchema>;
    eventsAttendedColl: Collection<EventsAttendedBucketSchema>;
    
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
export abstract class TroupeLogService extends BaseService {
    constructor() { super() }

    async updateLog(troupe: string | WithId<TroupeSchema>, events?: WithId<EventSchema>[], audience?: WithId<MemberSchema>[], 
        eventsAttendedSchema?: WithId<EventsAttendedBucketSchema>[]): Promise<void> {
        if(typeof troupe == "string") {
            assert(!events && !audience && !eventsAttendedSchema);
            const findTroupe = this.getTroupeSchema(troupe);
            const findEvents = this.eventColl.find({ troupeId: troupe }).toArray();
            const findAudience = this.audienceColl.find({ troupeId: troupe }).toArray();
            const findEventsAttended = this.eventsAttendedColl.find({ troupeId: troupe }).toArray();

            // Search for troupe, events, audience, and events attended asynchronously
            [ troupe, events, audience, eventsAttendedSchema ] = await Promise.all([ findTroupe, findEvents, findAudience, findEventsAttended ]);
        } else {
            assert(events && audience && eventsAttendedSchema);
        }
        return this.updateLogHelper(troupe as WithId<TroupeSchema>, events, audience, eventsAttendedSchema);
    }
    
    abstract initLog(troupe: WithId<TroupeSchema>): Promise<string>;
    abstract deleteLog(troupeId: string): Promise<void>;
    protected abstract updateLogHelper(troupe: WithId<TroupeSchema>, events: WithId<EventSchema>[], audience: WithId<MemberSchema>[], 
        eventsAttendedSchema: WithId<EventsAttendedBucketSchema>[]): Promise<void>;
}