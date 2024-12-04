import { google, sheets_v4, forms_v1, drive_v3 } from "googleapis";
import tasks from "@google-cloud/tasks";
import { GoogleAuth } from "google-auth-library";
import { DEV_MODE, GCP_CREDS, GCP_PROJECT_ID, GCP_REGION, GCP_SERVICE_ACCOUNT_EMAIL, SCHEDULE_FUNCTION_URL, SYNC_QUEUE_NAME } from "../util/env";
import { SyncRequest } from "../types/service-types";
import assert from "assert";
import { syncServer } from "../util/server/emitters";

let auth: GoogleAuth;
let sheets: sheets_v4.Sheets;
let forms: forms_v1.Forms;
let drive: drive_v3.Drive;

/** Load or request or authorization to call APIs from Google */
export async function authorizeGoogle() {
    assert(GCP_CREDS, "ENV: Missing GCP credentials");
    const credentials = JSON.parse(GCP_CREDS);
    const scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/drive",
    ];
    auth = new google.auth.GoogleAuth({ credentials, scopes });
}

/** Obtains the Google Drive client  */
export async function getDrive(): Promise<drive_v3.Drive> {
    if(drive) return drive;
    if(!auth) await authorizeGoogle();

    drive = google.drive({version: 'v3', auth});
    return drive;
}

/** Obtains the Google Sheets client */
export async function getSheets(): Promise<sheets_v4.Sheets> {
    if(sheets) return sheets;
    if(!auth) await authorizeGoogle();

    sheets = google.sheets({version: 'v4', auth});
    return sheets;
}

/** Obtains the Google Forms client  */ 
export async function getForms(): Promise<forms_v1.Forms> {
    if (forms) return forms;
    if(!auth) await authorizeGoogle();

    forms = google.forms({version: 'v1', auth});
    return forms;
}

/** Adds requests to the sync queue */ 
export async function bulkAddToGcpSyncQueue(requests: SyncRequest[]): Promise<void> {
    if(DEV_MODE) {
        for(const request of requests) {
            syncServer.emit("sync", request);
        }
        return;
    }

    assert(
        GCP_PROJECT_ID && GCP_REGION && SYNC_QUEUE_NAME && SCHEDULE_FUNCTION_URL && GCP_SERVICE_ACCOUNT_EMAIL, 
        "Missing GCP environment variables"
    );
    console.log("Adding sync requests to the queue...");
    const client = new tasks.v2.CloudTasksClient();
    
    const createTaskRequests: Promise<any>[] = [];
    for(const request of requests) {
        const seconds = Date.now() + 1000;
        const name = client.taskPath(GCP_PROJECT_ID, GCP_REGION, SYNC_QUEUE_NAME, `sync-${request.troupeId}-${seconds}`);

        createTaskRequests.push(
            client.createTask({
                parent: client.queuePath(GCP_PROJECT_ID, GCP_REGION, SYNC_QUEUE_NAME),
                task: {
                    name,
                    httpRequest: {
                        httpMethod: "POST",
                        url: SCHEDULE_FUNCTION_URL,
                        oidcToken: {
                            serviceAccountEmail: GCP_SERVICE_ACCOUNT_EMAIL,
                            audience: SCHEDULE_FUNCTION_URL,
                        },
                        headers: { "Content-Type": "application/json" },
                        body: Buffer.from(JSON.stringify(request)).toString("base64"),
                    },
                    scheduleTime: { seconds },
                }
            })
            .then(r => console.log("Created task", r[0].name))
            .catch(e => console.error("Error adding to sync queue for troupe " + request.troupeId, e))
        );
    }

    await Promise.all(createTaskRequests);
    await client.close();
}