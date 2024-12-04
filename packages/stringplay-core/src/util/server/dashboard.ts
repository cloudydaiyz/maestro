import { WithId } from "mongodb";
import { TroupeDashboardSchema, EventSchema, MemberSchema, EventsAttendedBucketSchema, EventTypeSchema } from "../../types/core-types";
import { FULL_DAY } from "../constants";

export function calculateDashboardData(
    eventTypes: WithId<EventTypeSchema>[],
    events: EventSchema[],
    audience: WithId<MemberSchema>[],
    eventsAttended: EventsAttendedBucketSchema[],
    oldDashboard?: TroupeDashboardSchema,
): Omit<TroupeDashboardSchema, "_id" | "troupeId"> {

    // Initialize dashboard to update with statistics from event & audience update
    const dashboardUpdate: Omit<TroupeDashboardSchema, "_id" | "troupeId"> = {
        lastUpdated: new Date(),
        upcomingBirthdays: { 
            frequency: oldDashboard?.upcomingBirthdays.desiredFrequency || "monthly",
            desiredFrequency: oldDashboard?.upcomingBirthdays.desiredFrequency || "monthly",
            members: []
        },
        totalMembers: 0,
        totalEvents: 0,
        totalAttendees: 0,
        totalEventTypes: eventTypes.length,
        totalAttendeesByEventType: {},
        totalEventsByEventType: {},
        avgAttendeesPerEvent: 0,
        avgAttendeesByEventType: {},
        attendeePercentageByEventType: {},
        eventPercentageByEventType: {},
    };

    // Initialize dashboard statistics
    for(const eventType of eventTypes) {
        const eventTypeId = eventType._id.toHexString();
        const title = eventType.title;
        const value = 0;
        const percent = 0;

        dashboardUpdate.totalAttendeesByEventType![eventTypeId] = { title, value };
        dashboardUpdate.totalEventsByEventType![eventTypeId] = { title, value };
        dashboardUpdate.avgAttendeesByEventType![eventTypeId] = { title, value };
        dashboardUpdate.attendeePercentageByEventType![eventTypeId] = { title, value, percent };
        dashboardUpdate.eventPercentageByEventType![eventTypeId] = { title, value, percent };
    }

    // Populate the events to update
    for(const event of events) {
        const eventTypeId = event.eventTypeId;
        dashboardUpdate.totalEvents! += 1;

        if(eventTypeId) {
            dashboardUpdate.totalEventsByEventType![eventTypeId].value += 1;
            dashboardUpdate.eventPercentageByEventType![eventTypeId].value += 1;
        }
    }

    // Populate the members and events attended to update and delete arrays
    const birthdayCutoff = dashboardUpdate.upcomingBirthdays!.frequency == "weekly" 
        ? new Date(Date.now() + FULL_DAY * 7)
        : new Date(Date.now() + FULL_DAY * 30);

    for(const member of audience) {
        const memberId = member._id.toHexString();

        // Update dashboard
        const birthday = member.properties["Birthday"].value;
        if(birthday && birthday < birthdayCutoff) {
            dashboardUpdate.upcomingBirthdays!.members.push({
                id: memberId,
                firstName: member.properties["First Name"].value,
                lastName: member.properties["Last Name"].value,
                birthday,
            });
        }
        dashboardUpdate.totalMembers! += 1;

        for(const bucket of eventsAttended) {
            for(const eventId in bucket.events) {
                const event = bucket.events[eventId];
                const eventTypeId = event.typeId;
                if(eventTypeId) {
                    dashboardUpdate.totalAttendeesByEventType![eventTypeId].value += 1;
                    dashboardUpdate.avgAttendeesByEventType![eventTypeId].value += 1;
                    dashboardUpdate.attendeePercentageByEventType![eventTypeId].value += 1;
                }
                dashboardUpdate.totalAttendees! += 1;
            }
        }
    }

    const totalAttendees = dashboardUpdate.totalAttendees!;
    const totalEvents = dashboardUpdate.totalEvents!;
    dashboardUpdate.avgAttendeesPerEvent = totalEvents > 0 ? Math.round(totalEvents / totalAttendees) : 0;

    for(const eventType of eventTypes) {
        const eventTypeId = eventType._id.toHexString();
        const totalEventsByEventType = dashboardUpdate.totalEventsByEventType![eventTypeId].value;
        const totalAttendeesByEventType = dashboardUpdate.totalAttendeesByEventType![eventTypeId].value;

        dashboardUpdate.avgAttendeesByEventType![eventTypeId].value = totalEventsByEventType > 0
            ? Math.round(dashboardUpdate.avgAttendeesByEventType![eventTypeId].value / totalEventsByEventType) : 0;
        dashboardUpdate.attendeePercentageByEventType![eventTypeId].value = totalAttendees > 0 
            ? totalAttendeesByEventType / totalAttendees : 0;
        dashboardUpdate.eventPercentageByEventType![eventTypeId].value = totalEvents > 0 
            ? totalEventsByEventType / totalEvents : 0;
    }

    return dashboardUpdate;
}