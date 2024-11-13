// Transforms data

import type { ApiType, Attendee, EventType, Member, PublicEvent, Troupe, TroupeDashboard } from "../types/api-types";
import type { AttendeeSchema, EventSchema, EventTypeSchema, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import type { Replace } from "../types/util-types";
import { removeId } from "./helper";

/** Converts troupe dashboard schema to its public, api-facing counterpart */
export function toTroupeDashboard(schema: TroupeDashboardSchema, id: string): TroupeDashboard {

    const newUpcomingBirthdays: Replace<TroupeDashboardSchema["upcomingBirthdays"]["members"], string, string> = [];
    for(const member of schema.upcomingBirthdays.members) {
        newUpcomingBirthdays.push({
            ...removeId(member),
            birthday: member.birthday.toISOString(),
        });
    }

    return {
        ...removeId(schema),
        id,
        upcomingBirthdays: {
            ...schema.upcomingBirthdays,
            members: newUpcomingBirthdays,
        },
        lastUpdated: schema.lastUpdated.toISOString(),
    }
}

/** Converts troupe schema to its public, api-facing counterpart */
export function toTroupe(schema: TroupeSchema, id: string): Troupe {
    const { eventTypes, ...publicTroupe } = schema;

    // Get the public version of the point types and synchronized point types
    let pointTypes: Troupe["pointTypes"] = {} as Troupe["pointTypes"];
    let synchronizedPointTypes: Troupe["synchronizedPointTypes"] = {} as Troupe["synchronizedPointTypes"];

    for(const key in publicTroupe.pointTypes) {
        const data = publicTroupe.pointTypes[key];
        pointTypes[key] = {
            startDate: data.startDate.toISOString(),
            endDate: data.endDate.toISOString(),
        }
    }

    for(const key in publicTroupe.synchronizedPointTypes) {
        const data = publicTroupe.synchronizedPointTypes[key];
        synchronizedPointTypes[key] = {
            startDate: data.startDate.toISOString(),
            endDate: data.endDate.toISOString(),
        }
    }

    return {
        ...removeId(publicTroupe),
        lastUpdated: publicTroupe.lastUpdated.toISOString(),
        id,
        pointTypes,
        synchronizedPointTypes,
    }
}

/** Converts event schema to its public, api-facing counterpart */
export function toPublicEvent(schema: EventSchema, id: string): PublicEvent {
    return {
        ...removeId(schema),
        id,
        lastUpdated: schema.lastUpdated.toISOString(),
        startDate: schema.startDate.toISOString(),
    }
}

/** Converts event type schema to its public, api-facing counterpart */
export function toEventType(schema: EventTypeSchema, id: string): EventType {

    return {
        ...removeId(schema),
        id,
        lastUpdated: schema.lastUpdated.toISOString(),
    }
}

/** Converts member schema to its public, api-facing counterpart */
export function toMember(schema: MemberSchema, id: string): Member {

    const properties = {} as ApiType<MemberSchema["properties"]>;
    for(const key in schema.properties) {
        properties[key] = {
            value: schema.properties[key].value instanceof Date 
                ? schema.properties[key]!.value!.toString()
                : schema.properties[key].value as ApiType<MemberPropertyValue>,
            override: schema.properties[key].override,
        }
    }

    return {
        ...removeId(schema),
        id,
        lastUpdated: schema.lastUpdated.toISOString(),
        properties,
    };
}

/** Converts attendee schema to its public, api-facing counterpart */
export function toAttendee(schema: AttendeeSchema, id: string): Attendee {
    
    const properties = {} as ApiType<MemberSchema["properties"]>;
    for(const key in schema.properties) {
        properties[key] = {
            value: schema.properties[key].value instanceof Date 
                ? schema.properties[key]!.value!.toString()
                : schema.properties[key].value as ApiType<MemberPropertyValue>,
            override: schema.properties[key].override,
        }
    }

    const eventsAttended = Object.keys(schema.eventsAttended);
    
    return {
        ...removeId(schema),
        id,
        lastUpdated: schema.lastUpdated.toISOString(),
        properties,
        eventsAttended,
    };
}