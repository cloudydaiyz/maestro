import { init } from '@cloudydaiyz/emaestro-core/server';
import { ApiResponse } from '@cloudydaiyz/emaestro-core/types/rest';
import * as functions from '@google-cloud/functions-framework';
import assert from "assert";

type ControllerModule = typeof import("@cloudydaiyz/emaestro-core");
let controllers: ControllerModule;

/** Sends the API response in a HTTP response */
function sendResponse(httpRes: functions.Response, apiRes: ApiResponse) {
    httpRes.status(apiRes.status).header(apiRes.headers);
    if(apiRes.body) httpRes.json(apiRes.body);
    httpRes.end();
}

// Initialize the controllers with lazy import
init().then(c => controllers = c);

// API HTTP function
functions.http('api', async (req, res) => {
    assert(req.method == "GET" || req.method == "POST" || req.method == "PUT" || req.method == "DELETE", "Invalid HTTP method");
    await controllers.apiController(req.path, req.method, req.headers, req.body).then((response) => sendResponse(res, response));
});

// Cloud Task triggered HTTP function
functions.http('sync', async (req, res) => {
    assert(req.method == "POST", "Invalid HTTP method");
    await controllers.syncController(req.body).then((response) => sendResponse(res, response));
});

// Scheduled HTTP function
functions.http('schedule', async (req, res) => {
    assert(req.method == "POST", "Invalid HTTP method");
    await controllers.scheduleController(req.body).then((response) => sendResponse(res, response));
});