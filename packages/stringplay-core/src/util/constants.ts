export const DB_NAME = "maestro";
export const TROUPE_COLL = "troupes";
export const DASHBOARD_COLL = "dashboards";
export const AUDIENCE_COLL = "audience";
export const EVENT_COLL = "events";
export const EVENTS_ATTENDED_COLL = "eventsAttended";

export const FULL_DAY = 1000 * 60 * 60 * 24;

export const MAX_POINT_TYPES = 5;
export const MAX_MEMBER_PROPERTIES = 10;
export const MAX_EVENT_TYPES = 10;
export const MAX_PAGE_SIZE = 30;

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$/;

export const TOKEN_HEADER_REGEX = /^Bearer\s+(?<token>.+)$/;

// == Constants for event sources ==

export const GSHEETS_REGEX = /https:\/\/docs.google.com\/spreadsheets\/d\/(?<id>[^\/&?#]+).*/;
export const GSHEETS_URL_TEMPL = "https://docs.google.com/spreadsheets/d/<id>";

export const GFORMS_REGEX = /https:\/\/docs.google.com\/forms\/d\/(?<id>[^\/&?#]+).*/;
export const GFORMS_URL_TEMPL = "https://docs.google.com/forms/d/<id>";

export const EVENT_DATA_SOURCE_REGEX = [GFORMS_REGEX, GSHEETS_REGEX] as const;
export const EVENT_DATA_SOURCE_URLS = [GFORMS_URL_TEMPL, GSHEETS_URL_TEMPL] as const;
export const EVENT_DATA_SOURCES = [
    "Google Forms", 
    "Google Sheets"
] as const;
export const EVENT_DATA_SOURCE_MIME_TYPES = [
    "application/vnd.google-apps.form", 
    "application/vnd.google-apps.spreadsheet", 
] as const;
export const EVENT_DATA_SOURCE_MIME_QUERIES = EVENT_DATA_SOURCE_MIME_TYPES.map(mimeType => `mimeType = '${mimeType}'`);

// == Constants for event folder sources ==

export const GDRIVE_FOLDER_REGEX = /https:\/\/drive\.google\.com\/drive\/folders\/(?<id>[^\/&?#]+).*/;
export const GDRIVE_FOLDER_URL_TEMPL = "https://drive.google.com/drive/folders/<id>";
export const GDRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export const EVENT_FOLDER_DATA_SOURCE_REGEX = [GDRIVE_FOLDER_REGEX] as const;
export const EVENT_FOLDER_DATA_SOURCE_URLS = [GDRIVE_FOLDER_URL_TEMPL] as const;
export const EVENT_FOLDER_DATA_SOURCES = [
    "Google Drive Folder"
] as const;
export const EVENT_FOLDER_DATA_SOURCE_MIME_TYPES = [
    "application/vnd.google-apps.folder"
] as const;
export const EVENT_FOLDER_DATA_SOURCE_MIME_QUERIES = EVENT_DATA_SOURCE_MIME_TYPES.map(mimeType => `mimeType = '${mimeType}'`);

// == Constants for the core types ==

export const BIRTHDAY_UPDATE_FREQUENCIES = ["weekly", "monthly"] as const;

export const MEMBER_PROPERTY_TYPES = [
    "string?", "string!", 
    "number?", "number!", // entries must be convertible to a number
    "boolean?", "boolean!", // entries must be either true or false
    "date?", "date!", // entries must be in ISO format
] as const;

export const BASE_MEMBER_PROPERTY_TYPES = {
    "Member ID": "string!",
    "First Name": "string!",
    "Last Name": "string!",
    "Email": "string!",
    "Birthday": "date?",
} as const;

export const BASE_POINT_TYPES_OBJ = {
    "Total": {
        startDate: new Date(0),
        endDate: new Date(3000000000000),
    },
} as const;

export const DEFAULT_MATCHERS = [
    {
        matchCondition: "contains" as const,
        fieldExpression: "ID" as const,
        memberProperty: "Member ID",
        filters: [],
        priority: 0
    },
    {
        matchCondition: "contains" as const,
        fieldExpression: "First Name" as const,
        memberProperty: "First Name",
        filters: [],
        priority: 1
    },
    {
        matchCondition: "contains" as const,
        fieldExpression: "Last Name" as const,
        memberProperty: "Last Name",
        filters: [],
        priority: 2
    },
    {
        matchCondition: "contains" as const,
        fieldExpression: "Email" as const,
        memberProperty: "Email",
        filters: [],
        priority: 3
    },
    {
        matchCondition: "contains" as const,
        fieldExpression: "Birthday" as const,
        memberProperty: "Birthday",
        filters: [],
        priority: 4
    },
];

export const INVITED_TROUPE_LIMIT = {
    docType: "troupeLimit" as const,
    modifyOperationsLeft: 30,
    manualSyncsLeft: 5,

    memberPropertyTypesLeft: 10,
    pointTypesLeft: 5,
    fieldMatchersLeft: 15,

    eventTypesLeft: 20,
    sourceFolderUrisLeft: 20,

    eventsLeft: 100,
    membersLeft: 200,
} as const;

// : Omit<LimitSchema, "troupeId" | "hasInviteCode">
export const UNINVITED_TROUPE_LIMIT = {
    docType: "troupeLimit" as const,
    modifyOperationsLeft: 10,
    manualSyncsLeft: 2,

    memberPropertyTypesLeft: 5,
    pointTypesLeft: 3,
    fieldMatchersLeft: 10,

    eventTypesLeft: 5,
    sourceFolderUrisLeft: 5,

    eventsLeft: 20,
    membersLeft: 200,
} as const;