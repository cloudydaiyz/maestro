export const DB_NAME = "mytroupe";

export const MAX_POINT_TYPES = 5;
export const MAX_MEMBER_PROPERTIES = 10;
export const MAX_EVENT_TYPES = 10;
export const MAX_PAGE_SIZE = 30;

export const DRIVE_FOLDER_REGEX = /https:\/\/drive\.google\.com\/drive\/folders\/(?<folderId>[^\/&?#]+)/;
export const DRIVE_FOLDER_URL_TEMPL = "https://drive.google.com/drive/folders/<id>?nsldnadsnj";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export const SHEETS_REGEX = /https:\/\/docs.google.com\/spreadsheets\/d\/(?<spreadsheetId>[^/]+)\/.*/g;
export const SHEETS_URL_TEMPL = "https://docs.google.com/spreadsheets/d/<id>";
export const FORMS_REGEX = /https:\/\/docs.google.com\/forms\/d\/(?<formId>[^/]+)\/.*/g;
export const FORMS_URL_TEMPL = "https://docs.google.com/forms/d/<id>";