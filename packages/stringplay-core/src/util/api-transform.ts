// Transforms data

import { WithId } from "mongodb";
import { ApiType, Attendee, EventType, Member, PublicEvent, Troupe, TroupeDashboard } from "../types/api-types";
import { AttendeeSchema, EventSchema, EventTypeSchema, MemberPropertyValue, MemberSchema, TroupeDashboardSchema, TroupeSchema } from "../types/core-types";
import { Replace } from "../types/util-types";

/** Converts troupe dashboard schema to its public, api-facing counterpart */
export function toTroupeDashboard(schema: WithId<TroupeDashboardSchema>): TroupeDashboard {
    const {_id, ...publicDashboard} = schema;

    const newUpcomingBirthdays: Replace<TroupeDashboardSchema["upcomingBirthdays"]["members"], string, string> = [];
    for(const member of publicDashboard.upcomingBirthdays.members) {
        newUpcomingBirthdays.push({
            ...member,
            birthday: member.birthday.toISOString(),
        });
    }

    return {
        ...publicDashboard,
        upcomingBirthdays: {
            ...publicDashboard.upcomingBirthdays,
            members: newUpcomingBirthdays,
        },
        lastUpdated: publicDashboard.lastUpdated.toISOString(),
    }
}

/** Converts troupe schema to its public, api-facing counterpart */
export function toTroupe(schema: WithId<TroupeSchema>): Troupe {
    const { _id, ...publicTroupe } = schema;

    // Replace the ObjectId with a string ID
    const id = _id.toHexString();

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
        ...publicTroupe,
        lastUpdated: publicTroupe.lastUpdated.toISOString(),
        id,
        pointTypes,
        synchronizedPointTypes,
    }
}

/** Converts event schema to its public, api-facing counterpart */
export function toPublicEvent(schema: WithId<EventSchema>): PublicEvent {
    const { _id, ...publicEvent } = schema;
    const eid = _id.toHexString();

    return {
        ...publicEvent,
        id: eid,
        lastUpdated: publicEvent.lastUpdated.toISOString(),
        startDate: publicEvent.startDate.toISOString(),
    }
}

/** Converts event type schema to its public, api-facing counterpart */
export function toEventType(schema: WithId<EventTypeSchema>): EventType {
    const { _id, ...eType } = schema;
    const eid = _id!.toHexString();

    return {
        ...eType,
        id: eid,
        lastUpdated: eType.lastUpdated.toISOString(),
    }
}

/** Converts member schema to its public, api-facing counterpart */
export function toMember(schema: WithId<MemberSchema>): Member {
    const { _id, ...m } = schema;

    const memberId = _id.toHexString();

    const properties = {} as ApiType<MemberSchema["properties"]>;
    for(const key in m.properties) {
        properties[key] = {
            value: m.properties[key].value instanceof Date 
                ? m.properties[key]!.value!.toString()
                : m.properties[key].value as ApiType<MemberPropertyValue>,
            override: m.properties[key].override,
        }
    }

    return {
        ...m,
        id: memberId,
        lastUpdated: m.lastUpdated.toISOString(),
        properties,
    };
}

/** Converts attendee schema to its public, api-facing counterpart */
export function toAttendee(schema: WithId<AttendeeSchema>): Attendee {
    const { _id, ...m } = schema;
    const memberId = _id.toHexString();
    
    const properties = {} as ApiType<MemberSchema["properties"]>;
    for(const key in m.properties) {
        properties[key] = {
            value: m.properties[key].value instanceof Date 
                ? m.properties[key]!.value!.toString()
                : m.properties[key].value as ApiType<MemberPropertyValue>,
            override: m.properties[key].override,
        }
    }

    const eventsAttended = Object.keys(m.eventsAttended);
    
    return {
        ...m,
        id: memberId,
        lastUpdated: m.lastUpdated.toISOString(),
        properties,
        eventsAttended,
    };
}