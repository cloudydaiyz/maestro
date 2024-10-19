// Local express server
import express from "express";
import { apiController } from "./controller";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { DEV_MODE } from "./util/env";
import { cleanDbConnections, cleanLogs, closeServers, startDb, stopDb } from "./util/resources";
import { Server } from "http";

let mongod: MongoMemoryReplSet;


async function start() {
    if(DEV_MODE) {
        await startDb();
    }
}

async function end() {
    await closeServers();
    await cleanDbConnections();
    await stopDb();
    await cleanLogs();
}

start().then(() => {
    const apiApp = express();
    apiApp.use(express.json());
    apiApp.all("*", (req, res) => {
        // console.log(req.path);
        // console.log(req.headers);
        // console.log(req.body);
        // console.log(req.method);
        // res.send("Hello World from " + req.path);
        // return;

        apiController(req.path, req.method as any, req.headers, req.body).then((response) => {
            res.status(response.status).header(response.headers);
            if(response.body) res.json(response.body);
            res.end();
        });
    });

    const apiServer = apiApp.listen(3000, () => {
        console.log("API Server running on port 3000");
    });

    // Handle server close event
    apiServer.on('close', () => {
        console.log('Server closing...');

        // Perform cleanup tasks here, like closing database connections
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        console.log('SIGINT signal received.');

        apiServer.close(() => {
            console.log('API server closed.');
            process.exit(0);
        });
    });
});