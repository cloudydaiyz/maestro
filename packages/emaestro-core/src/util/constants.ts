export const DB_NAME = "maestro";

export const FULL_DAY = 1000 * 60 * 60 * 24;

export const MAX_POINT_TYPES = 5;
export const MAX_MEMBER_PROPERTIES = 10;
export const MAX_EVENT_TYPES = 10;
export const MAX_PAGE_SIZE = 30;

// == Constants for event source URLs ==
export const DRIVE_FOLDER_REGEX = /https:\/\/drive\.google\.com\/drive\/folders\/(?<folderId>[^\/&?#]+).*/;
export const DRIVE_FOLDER_URL_TEMPL = "https://drive.google.com/drive/folders/<id>?nsldnadsnj";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export const SHEETS_REGEX = /https:\/\/docs.google.com\/spreadsheets\/d\/(?<spreadsheetId>[^\/&?#]+).*/;
export const SHEETS_URL_TEMPL = "https://docs.google.com/spreadsheets/d/<id>";

export const FORMS_REGEX = /https:\/\/docs.google.com\/forms\/d\/(?<formId>[^\/&?#]+).*/;
export const FORMS_URL_TEMPL = "https://docs.google.com/forms/d/<id>";

// == Constants for the core types ==
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
    "Birthday": "date!",
} as const;

export const BASE_POINT_TYPES_OBJ = {
    "Total": {
        startDate: new Date(0),
        endDate: new Date(3000000000000),
    },
} as const;

export const EVENT_DATA_SOURCES = ["Google Forms", "Google Sheets", ""] as const;
export const EVENT_DATA_SOURCE_REGEX = [FORMS_REGEX, SHEETS_REGEX] as const;
export const EVENT_DATA_SOURCE_MIME_TYPES = ["application/vnd.google-apps.form", "application/vnd.google-apps.spreadsheet"] as const;
export const EVENT_DATA_SOURCE_URLS = [FORMS_URL_TEMPL, SHEETS_URL_TEMPL] as const;

export const BIRTHDAY_UPDATE_FREQUENCIES = ["weekly", "monthly"] as const;

export const MIME_QUERY: string[] = [];
for(const mimeType of EVENT_DATA_SOURCE_MIME_TYPES) {
    MIME_QUERY.push(`mimeType = '${mimeType}'`);
}