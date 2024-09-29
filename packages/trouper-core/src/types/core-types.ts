/**
 * == DASHBOARD ==
 * - Upcoming birthdays (month, sorted)
 * - Total number of members
 * - Total number of events
 * - Average number of points per event
 * - Average number of attendees per event
 * - Average number of attendees per event type
 * - Average percentage of attendees per event type 
 * 
 * == ENTITIES ==
 * Group
 * - Group Name
 * - Log Sheet URI
 * - Origin Event ID
 * - Members
 * - Member Properties
 * - Events
 * - Event Types
 * - Point Data
 * - Refresh Lock
 * 
 * Member
 * - Properties
 *   - Member Property => Value
 * - Events Attended (Array of Event IDs)
 * - Points
 * 
 * Event Type
 * - ID
 * - Title
 * - Value (in Points) | Worth (in %; higher # = greater worth, used for dynamic valuation)
 * - Source Folder URIs
 * 
 * Event
 * - Event Title
 * - Event Type | Value (in Points) | Worth (in %; higher # = greater worth, used for dynamic valuation)
 * - Event Date | [ Event Start Date && Event End Date ]
 * - URI (full or shortened google sheets / google forms link)
 * - Source Type (Google Forms / Google Sheets)
 * - FieldToPropertyMapping
 */

// Modifiers: ? = optional, ! = required
type MemberPropertyType = "string" | "number" | "boolean" | "date";

export interface PointData {
    startDate: Date,
    endDate: Date,
}

export interface GroupSchema {
    lastUpdated: Date, // last time the group was updated
    name: string, // name of the group
    logSheetUri: string, // spreadsheet URI to post log data to
    originEventId?: string, // event that takes precedence during member property mapping
    refreshLock: boolean, // lock to prevent refreshing conflict
    eventTypes: EventTypeSchema[], // all event types for group (MAX: 10)

    memberProperties: BaseMemberProperties & { // valid properties for members
        [key: string]: MemberPropertyType,
    },
    pointTypes: BasePointTypes & { // point types for group
        [key: string]: PointData,
    },

    // == FUTURE ==
    // demo: boolean, // whether or not this group is being used in a demo
    // demoActionsLeft: number, // number of demo actions left
}

export interface BaseMemberProperties {
    "First Name": "string",
    "Last Name": "string",
    "Member ID": "string",
    "Email": "string",
    "Birthday": "date",
}

export interface BasePointTypes {
    "Total": PointData,
}

export interface EventTypeSchema {
    lastUpdated: Date, // last time the event type was updated
    title: string, // title of the event type
    points: number, // points for the event type
    sourceFolderUris: string[]; // URIs to the source folders for the event type
}

export interface EventSchema {
    lastUpdated: Date, // last time the event was updated
    title: string, // name of the event
    sourceUri: string, // source URI of the data for the event (Google Forms / Google Sheets)
    timeline: {
        startDate: Date,
        endDate?: Date,
    },

    // oneof type or points to calculate value associated with the event
    type?: EventTypeSchema,
    points?: number,

    fieldToPropertyMapping: { // mapping of form fields to member properties
        [fieldId: string]: string,
    },
}

export interface MemberSchema {
    lastUpdated: Date, // last time the member was updated
    properties: { // member properties
        [key: string]: string | number | boolean | Date,
    },
    eventsAttended: string[], // event IDs
    points: { // points for each type specified in the group schema
        [key: string]: number,
    },
}