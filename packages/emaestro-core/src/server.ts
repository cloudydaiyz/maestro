// Local express server to simulate production environment

import express from "express";
import { DEV_MODE } from "./util/env";
import { cleanDbConnections, cleanLogs, startDb } from "./util/resources";
import { Methods } from "./util/rest";
import { Server } from "http";

let server: Server;

/** Prepare for server initialization, start up MongoDB database */
async function init() {
    if(DEV_MODE) await startDb();
}

/** Clean up resources and exit this app */
async function exit() {
    await new Promise<void>((resolve, reject) => server.close((err) => { if(err) reject(err.message); else resolve() }));
    await cleanDbConnections();
    await cleanLogs();

    // Exiting the process will shut down the MongoDB memory server as well
    process.exit(0);
}

/** Start the API server */
export async function startServer() {
    await init();
    const { apiController, syncController, syncServer, scheduleController, scheduleServer } = await import("./controller");

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

    // Set up the event emitters
    if(DEV_MODE) {
        syncServer.on("sync", async (arg): Promise<void> => {
            console.log("Sync event received");
            await syncController(arg);
        });

        scheduleServer.on("task", async (arg): Promise<void> => {
            console.log("Scheduled task received");
            await scheduleController(arg);
        });

        // Set up scheduled tasks
        setInterval(() => {
            scheduleServer.emit("task", { taskType: "sync" });
        }, 60000);
    }

    // Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
    process.on('SIGINT', async () => { console.log('SIGINT signal received.'); await exit() });
    process.on('SIGTERM', async () => { console.log('SIGTERM signal received.'); await exit() });
}