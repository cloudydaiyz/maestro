import * as fs from "node:fs/promises";
import { google, sheets_v4, forms_v1, drive_v3 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { SERVICE_KEY_PATH } from "../util/env";
import { BASE_LOG_SHEET_ID, LOG_SHEET_DRIVE_ID } from "../util/constants";

let auth: GoogleAuth;
let sheets: sheets_v4.Sheets;
let forms: forms_v1.Forms;
let drive: drive_v3.Drive;

// Load or request or authorization to call APIs from Google
export async function authorizeGoogle() {
    const credentials = JSON.parse(String(await fs.readFile(SERVICE_KEY_PATH)));
    const scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/drive",
    ];
    auth = new google.auth.GoogleAuth({ credentials, scopes });
}

// Obtains the Google Drive client 
export async function getDrive(): Promise<drive_v3.Drive> {
    if(drive) return drive;
    if(!auth) await authorizeGoogle();

    drive = google.drive({version: 'v3', auth});
    return drive;
}

// Obtains the Google Sheets client
export async function getSheets(): Promise<sheets_v4.Sheets> {
    if(sheets) return sheets;
    if(!auth) await authorizeGoogle();

    sheets = google.sheets({version: 'v4', auth});
    return sheets;
}

// Obtains the Google Forms client 
export async function getForms(): Promise<forms_v1.Forms> {
    if (forms) return forms;
    if(!auth) await authorizeGoogle();

    forms = google.forms({version: 'v1', auth});
    return forms;
}

// Creating a new spreadsheet
// Copy the file, move it to the appropriate folder and rename it
// https://developers.google.com/drive/api/reference/rest/v3/files/copy

// https://developers.google.com/drive/api/reference/rest/v3/files/update
// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

// Delete spreadsheet
// https://developers.google.com/drive/api/reference/rest/v3/files/delete

// Updating the spreadsheet
// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate

// Get spreadsheet values (for validation)
// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/get
// https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/batchGet

export async function initTroupeSheet(name: string) {
    return getDrive()
        .then(client => client.files.copy({
            fileId: BASE_LOG_SHEET_ID,
            requestBody: { name, parents: [ LOG_SHEET_DRIVE_ID ] }
        }))
}

export async function getTroupeSheetData() {}

export async function clearTroupeSheet() {}

// NOTE: The service account can only delete files that it creates itself. This
// isn't a problem in this case since the service account is the one creating the sheets.
export async function deleteTroupeSheet(id: string) {
    return getDrive().then(client => client.files.delete({ fileId: id }));
}