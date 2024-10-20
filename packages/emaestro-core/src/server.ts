// Local express server to simulate production environment

import "dotenv/config";

import express from "express";
import { DEV_MODE } from "./util/env";
import { cleanDbConnections, cleanLogs, closeServers, registerServer, startDb, stopDb } from "./util/resources";
import { Methods } from "./util/rest";
import { syncController, syncServer } from "./controller";

/** Prepare for server initialization, start up MongoDB database */
async function init() {
    if(DEV_MODE) {
        await startDb();
    }
}

/** Clean up resources and exit this app */
async function exit() {
    await closeServers();
    await cleanDbConnections();
    await cleanLogs();

    // Exiting the process will shut down the MongoDB memory server as well
    process.exit(0);
}

// Start the server
init().then(async () => {
    const { apiController } = await import("./controller");

    // Set up the API as an express app
    const apiApp = express();
    apiApp.use(express.json());
    apiApp.all("*", (req, res) => {
        apiController(req.path, req.method as keyof typeof Methods, req.headers, req.body).then((response) => {
            res.status(response.status).header(response.headers);
            if(response.body) res.json(response.body);
            res.end();
        });
    });
    apiApp.listen(3000, () => {
        console.log("API Server running on port 3000");
    });

    // Set up the sync server to listen to events
    if(DEV_MODE) {
        syncServer.on("sync", async (arg): Promise<void> => {
            await syncController("", "POST", {}, arg);
        });
    }

    // Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
    process.on('SIGINT', async () => { console.log('SIGINT signal received.'); await exit() });
    process.on('SIGTERM', async () => { console.log('SIGTERM signal received.'); await exit() });
});