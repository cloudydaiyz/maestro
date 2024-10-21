// https://cloud.google.com/functions/docs/functions-framework
// https://cloud.google.com/functions/docs/running/predeploy-test
// https://cloud.google.com/functions/docs/writing
// https://cloud.google.com/functions/docs/calling
// https://cloud.google.com/functions/docs/tutorials/http

// node --check index.js

import * as functions from '@google-cloud/functions-framework';
import { apiController } from "@cloudydaiyz/emaestro-core";
import assert from "assert";

functions.http('api', async (req, res) => {
    assert(req.method == "GET" || req.method == "POST" || req.method == "PUT" || req.method == "DELETE", "Invalid HTTP method");
    apiController(req.path, req.method, req.headers, req.body).then((response) => {
        res.status(response.status).header(response.headers);
        if(response.body) res.json(response.body);
        res.end();
    });
});