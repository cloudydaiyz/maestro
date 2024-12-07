// Initialization for all services

import { ClientSession, Collection, MongoClient, ObjectId, WithId } from "mongodb";
import { AttendeeSchema, EventsAttendedBucketSchema, EventSchema, EventTypeSchema, FieldMatcher, MemberSchema, TroupeDashboardSchema, TroupeLimit, TroupeSchema } from "../types/core-types";
import { AUDIENCE_COLL, DASHBOARD_COLL, DB_NAME, EVENT_COLL, EVENTS_ATTENDED_COLL, TROUPE_COLL } from "../util/constants";
import { EventDataMap, AttendeeDataMap } from "../types/service-types";
import { ClientError } from "../util/error";
import assert from "assert";
import { newDbConnection, removeDbConnection } from "../util/server/resources";
import { getMatcherRegex } from "../util/helper";

/** Base service for all services that interact with the database */
export class BaseDbService {
    /** 
     * Function that resolves on the completion of the class creation. This allows children
     * to define unique criteria that dictates the completion of class initialization.
     */
    ready: Promise<void>;
    client: MongoClient;
    readonly troupeColl: Collection<TroupeSchema>;
    readonly dashboardColl: Collection<TroupeDashboardSchema>;
    readonly eventColl: Collection<EventSchema>;
    readonly audienceColl: Collection<MemberSchema>;
    readonly eventsAttendedColl: Collection<EventsAttendedBucketSchema>;
    
    constructor() {
        // MongoDB URI could be changed from testing -- use the environment variable instead of MONGODB_URI const
        this.client = newDbConnection();

        this.troupeColl = this.client.db(DB_NAME).collection(TROUPE_COLL);
        this.dashboardColl = this.client.db(DB_NAME).collection(DASHBOARD_COLL);
        this.audienceColl = this.client.db(DB_NAME).collection(AUDIENCE_COLL);
        this.eventColl = this.client.db(DB_NAME).collection(EVENT_COLL);
        this.eventsAttendedColl = this.client.db(DB_NAME).collection(EVENTS_ATTENDED_COLL);
        this.ready = new Promise<void>(resolve => resolve());
    }

    static async create<T extends BaseDbService>(this: new() => T): Promise<T> {
        const service = new this();
        await service.client.connect();
        await service.ready;
        return service;
    }

    async close() { return removeDbConnection() }

    async getTroupeSchema(troupeId: string, clientError?: true, session?: ClientSession): Promise<WithId<TroupeSchema>> {
        const schema = await this.troupeColl.findOne({ _id: new ObjectId(troupeId) }, { session });
        assert(schema, clientError ? new ClientError("Unable to find troupe") : "Unable to find troupe");
        return schema;
    }

    async getEventSchema(troupeId: string, eventId: string, clientError?: true, session?: ClientSession): Promise<WithId<EventSchema>> {
        const event = await this.eventColl.findOne({ _id: new ObjectId(eventId), troupeId }, { session });
        assert(event, clientError ? new ClientError("Unable to find event") : "Unable to find event");
        return event;
    }

    async getEventTypeSchema(troupeId: string, eventTypeId: string, clientError?: true, session?: ClientSession): Promise<WithId<EventTypeSchema>> {
        const troupe = await this.getTroupeSchema(troupeId, true, session);
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, clientError ? new ClientError("Unable to find event type") : "Unable to find event type");
        return eventType;
    }

    getEventTypeSchemaFromTroupe(troupe: WithId<TroupeSchema>, eventTypeId: string, clientError?: true): WithId<EventTypeSchema> {
        const eventType = troupe.eventTypes.find((et) => et._id.toHexString() == eventTypeId);
        assert(eventType, clientError ? new ClientError("Unable to find event type") : "Unable to find event type");
        return eventType;
    }

    async getMemberSchema(troupeId: string, memberId: string, clientError?: true, session?: ClientSession): Promise<WithId<MemberSchema>> {
        const member = await this.audienceColl.findOne({ _id: new ObjectId(memberId), troupeId }, { session });
        assert(member, clientError ? new ClientError("Unable to find member") : "Unable to find member");
        return member;
    }

    async getAttendeeSchema(troupeId: string, memberId: string, clientError?: true, session?: ClientSession): Promise<WithId<AttendeeSchema>> {
        const member = await this.getMemberSchema(troupeId, memberId, clientError);
        const attendee: WithId<AttendeeSchema> = { ...member, eventsAttended: {} };

        const buckets = await this.eventsAttendedColl.find({ troupeId, memberId }, { session }).toArray();
        for(const bucket of buckets) {
            attendee.eventsAttended = { ...attendee.eventsAttended, ...bucket.events };
        }
        return attendee;
    }

    async getAttendeeSchemas(troupeId: string, clientError?: true, session?: ClientSession): Promise<WithId<AttendeeSchema>[]> {
        const members = await this.audienceColl.find({ troupeId }, { session }).toArray();
        const attendees = [];
        
        for (const member of members) {
            const attendee: WithId<AttendeeSchema> = { ...member, eventsAttended: {} };
            const memberId = member._id.toHexString();

            const buckets = await this.eventsAttendedColl.find({ troupeId, memberId }, { session }).toArray();
            for(const bucket of buckets) {
                attendee.eventsAttended = { ...attendee.eventsAttended, ...bucket.events };
            }
            attendees.push(attendee);
        }

        return attendees;
    }

    async getDashboardSchema(troupeId: string, clientError?: true, session?: ClientSession): Promise<WithId<TroupeDashboardSchema>> {
        const dashboard = await this.dashboardColl.findOne({ troupeId }, { session });
        assert(dashboard, clientError ? new ClientError("Unable to find dashboard") : "Unable to find dashboard");
        return dashboard;
    }
}