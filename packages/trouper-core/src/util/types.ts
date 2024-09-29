/**
 * "Total Points" = {
 *     startDate: Date,
 *     endDate: Date
 * }
 */

// Bucket pattern for attendees, members, events
// Limit the max number of event types?

/**
 * == DASHBOARD ==
 * - Upcoming birthdays (day / week / month)
 * - Total number of members
 * - Total number of events
 * - Average number of attendees per event
 * - Average number of points per event
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
 * - Refresh Lock
 * 
 * Member
 * - Properties
 *   - Member Property => Value
 * - Events Attended (Array of Event IDs)
 * - Total Points
 * 
 * Member Bucket (in future)
 * - Member ID
 * - Events Attended
 * 
 * Event Type
 * - ID
 * - Title
 * - Value (in Points) | Worth (higher # = greater worth, used for dynamic valuation)
 * 
 * Event
 * - Event Title
 * - Event Type | Points | Worth (higher # = greater worth, used for dynamic valuation)
 * - Event Date | [ Event Start Date && Event End Date ]
 * - URI (full or shortened google sheets / google forms link)
 * - Source Type (Google Forms / Google Sheets)
 * - FieldToPropertyMapping
 * 
 * Refresh rules:
 * - Cannot perform an action that requires a refresh if the refresh lock is on
 * - Origin event ID mappings override all other property mappings
 * - If all required member properties are not present for a member after going
 *   through all event information, the member is not added to the list of members
 * 
 * Future:
 * - Dynamic valuation of events
 * - Full forms & sheet support for Box and Microsoft OneDrive (spreadsheet)
 * - Event file source type: CSV file, .XLSX file
 * - Log sheet URI: Google Sheets / Microsoft Sheet URI on Box, or Microsoft Sheet URI on OneDrive
 * - Authentication
 * - Landing Page
 */

type MemberPropertyType = "string" | "number" | "boolean" | "date";

export interface GroupSchema {
    name: string,
    logSheetUri: string,
    originEventId?: string,
    memberProperties: {
        "First Name": "string",
        "Last Name": "string",
        "Member ID": "string",
        "Email": "string",
        "Birthday": "date",
        [key: string]: MemberPropertyType,
    },
    refreshLock: boolean,
    eventTypes: EventTypeSchema[],
}

export interface EventTypeSchema {
    id: string,
    name: string,
    points: number,
}

export interface MemberSchema {
    eventsAttended: string[],
}

// export interface MemberSchema {
//     [key in BaseMemberProperty]: AllowedTypes
// }

export enum SourceType {
    GoogleForms = "GoogleForms",
    GoogleSheets = "GoogleSheets"
}

export interface QuestionPropertyMatch {
    questionId: string;
    // property: BaseMemberProperty;
}



export interface EventSchema {
    eventName: string,
    semester: string,
    eventDate: Date,
    eventType: EventTypeSchema,
    source: string, // original link where the data came from
    sourceType: SourceType, // note that question IDs for this event depends on the source type
    // attendees: GenericMap<Member>,
    sims: string, // sign in mapping string
}