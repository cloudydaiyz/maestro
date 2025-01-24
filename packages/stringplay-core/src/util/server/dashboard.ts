import { WithId } from "mongodb";
import { TroupeDashboardSchema, EventSchema, MemberSchema, EventsAttendedBucketSchema, EventTypeSchema } from "../../types/core-types";
import { FULL_DAY } from "../constants";

export function calculateDashboardData(
    eventTypes: WithId<EventTypeSchema>[],
    events: EventSchema[],
    audience: WithId<MemberSchema>[],
    eventsAttended: EventsAttendedBucketSchema[],
    oldDashboard?: TroupeDashboardSchema,
) : Omit<TroupeDashboardSchema, "_id" | "troupeId"> {

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
    }

    for(const bucket of eventsAttended) {
        for(const eventId in bucket.events) {
            const event = bucket.events[eventId];
            const eventTypeId = event.typeId;
            if(eventTypeId) {
                dashboardUpdate.totalAttendeesByEventType![eventTypeId].value += 1;
            }
            dashboardUpdate.totalAttendees! += 1;
        }
    }

    // Overall dashboard statistics
    const totalAttendees = dashboardUpdate.totalAttendees!;
    const totalEvents = dashboardUpdate.totalEvents!;
    dashboardUpdate.avgAttendeesPerEvent = totalEvents > 0 ? Math.round(totalAttendees / totalEvents) : 0;

    // Event type specific dashboard statistics
    let remainingAttendees = totalAttendees;
    let remainingAttendeePercentage = 1;
    let remainingEvents = totalEvents;
    let remainingEventPercentage = 1;

    for(const eventType of eventTypes) {
        const eventTypeId = eventType._id.toHexString();
        const eventTypeTitle = eventType.title;

        const totalAttendeesByEventType = dashboardUpdate.totalAttendeesByEventType![eventTypeId].value;
        const totalAttendeesPercentByEventType = totalAttendees > 0 ? totalAttendeesByEventType / totalAttendees : totalAttendees;
        const totalEventsByEventType = dashboardUpdate.totalEventsByEventType![eventTypeId].value;
        const totalEventsPercentByEventType = totalEvents > 0 ? totalEventsByEventType / totalEvents : 0;
        const avgAttendeesByEventType = totalEventsByEventType > 0
            ? Math.round(totalAttendeesByEventType / totalEventsByEventType) : 0;
        
        dashboardUpdate.attendeePercentageByEventType![eventTypeId].title = eventTypeTitle;
        dashboardUpdate.attendeePercentageByEventType![eventTypeId].value = totalAttendeesByEventType;
        dashboardUpdate.attendeePercentageByEventType![eventTypeId].percent = totalAttendeesPercentByEventType;
        
        dashboardUpdate.eventPercentageByEventType![eventTypeId].title = eventTypeTitle;
        dashboardUpdate.eventPercentageByEventType![eventTypeId].value = totalEventsByEventType;
        dashboardUpdate.eventPercentageByEventType![eventTypeId].percent = totalEventsPercentByEventType;

        dashboardUpdate.avgAttendeesByEventType![eventTypeId].value = avgAttendeesByEventType;

        remainingAttendees -= totalAttendeesByEventType;
        remainingAttendeePercentage -= totalAttendeesPercentByEventType;
        remainingEvents -= totalEventsByEventType;
        remainingEventPercentage -= totalEventsPercentByEventType;
    }

    // Statistics for events without an event type
    dashboardUpdate.totalAttendeesByEventType["etc"] = {
        title: "Other", value: remainingAttendees,
    }

    dashboardUpdate.totalEventsByEventType["etc"] = {
        title: "Other", value: remainingEvents,
    }

    dashboardUpdate.attendeePercentageByEventType["etc"] = {
        title: "Other",
        value: remainingAttendees,
        percent: remainingAttendeePercentage,
    };

    dashboardUpdate.eventPercentageByEventType["etc"] = {
        title: "Other",
        value: remainingEvents,
        percent: remainingEventPercentage,
    };

    dashboardUpdate.avgAttendeesByEventType["etc"] = {
        title: "Other",
        value: remainingEvents > 0 ? Math.round(remainingAttendees / remainingEvents) : 0,
    };

    return dashboardUpdate;
}