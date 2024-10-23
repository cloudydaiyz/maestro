// Local express server to simulate production environment
// Decouples server creation from GCP functions to allow for local testing & server deployment in future
// FUTURE: Implement functionality to handle multiple controllers

import express from "express";
import { DEV_MODE } from "./util/env";
import { cleanDbConnections, cleanLogs, startDb } from "./util/resources";
import { Methods } from "./util/rest";
import { Server } from "http";

type ControllerModule = typeof import("./controllers");
let server: Server;

/** Prepares for server initialization, starts up MongoDB database */
export async function init(): Promise<ControllerModule> {
    if(DEV_MODE) {
        await startDb();
    }

    // To cover the case of testing locally, delay the controller imports so that the in-memory MongoDB server can be used
    const controllers = await import("./controllers");

    // Set up the event emitters
    if(DEV_MODE) {
        controllers.syncServer.on("sync", async (arg): Promise<void> => {
            console.log("Sync event received");
            await controllers.syncController(arg);
        });

        controllers.scheduleServer.on("task", async (arg): Promise<void> => {
            console.log("Scheduled task received");
            await controllers.scheduleController(arg);
        });

        // Set up scheduled tasks
        setInterval(() => {
            controllers.scheduleServer.emit("task", { taskType: "sync" });
        }, 10000);
    }
    return controllers;
}

/** Cleans up resources and exit this app */
export async function exit() {
    await new Promise<void>((resolve, reject) => server.close((err) => { if(err) reject(err.message); else resolve() }));
    await cleanDbConnections();
    await cleanLogs();

    // Exiting the process will shut down the MongoDB memory server as well
    process.exit(0);
}

/** Starts an express.js server for the API controller */
export async function startApiServer() {
    const { apiController } = await init();

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

    server = apiApp.listen(3000, () => {
        console.log("API server running on port 3000\n");
    });

    // Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
    process.on('SIGINT', async () => { console.log('SIGINT signal received.'); await exit() });
    process.on('SIGTERM', async () => { console.log('SIGTERM signal received.'); await exit() });
}