// Manages the resources created during app execution

import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MONGODB_PASS, MONGODB_USER } from "./env";
import { MongoClient } from "mongodb";
import { Server } from "http";


let mongod: MongoMemoryReplSet | null = null;
const dbConn: MongoClient[] = [];
const servers: Server[] = [];

export async function startDb(): Promise<void> {
    await stopDb();
    mongod = await MongoMemoryReplSet.create({ replSet: { auth: { enable: true, customRootName: MONGODB_USER, customRootPwd: MONGODB_PASS } } });
    const uri = mongod.getUri();

    // Connect to and ping the server to ensure everything is setup
    const client = new MongoClient(uri, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
    client.on("connecting", () => console.log("Connecting to MongoDB..."));
    client.on("connected", () => console.log("Connected to MongoDB"));
    client.on("error", (err) => console.error("Connection error:", err));

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    await client.close();

    process.env.MONGODB_URI = uri;
}

export async function stopDb(): Promise<void> {
    if(mongod) {
        await cleanDbConnections().then(() => mongod!.stop());
    }
    mongod = null;
}

export function newDbConnection(): MongoClient {

    // MongoDB URI could be changed from testing -- use the environment variable instead of MONGODB_URI const
    const client = new MongoClient(process.env.MONGODB_URI!, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
    client.on("connecting", () => console.log("Connecting to MongoDB..."));
    client.on("connected", () => console.log("Connected to MongoDB"));
    client.on("error", (err) => console.error("Connection error:", err));

    dbConn.push(client);
    return client;
}

export async function removeDbConnection(client: MongoClient) {
    const i = dbConn.findIndex(c => c === client);
    if(i >= 0) {
        await client.close();
        dbConn.splice(i, 1);
    }
}

export async function cleanDbConnections() {
    await Promise.all(dbConn.map(c => c.close()));
    dbConn.splice(0, dbConn.length);
}

export async function cleanLogs() {
    const { GoogleSheetsLogService } = await import("../services/logs/gsheets-log");
    const gsheets = new GoogleSheetsLogService();
    for(let i = GoogleSheetsLogService.length - 1; i >= 0; i--) {
        const log = GoogleSheetsLogService.logsCreated[i];
        console.log("Deleting log sheet at: " + log);
        await gsheets.deleteLog(log);
        GoogleSheetsLogService.logsCreated.pop();
    }
}

export function registerServer(server: Server) {
    servers.push(server);
}

export function closeServers() {
    return new Promise<void>((resolve, reject) => {
        let toClose = servers.length;

        servers.forEach(s => {
            s.close(() => {
                toClose--;
                if(toClose == 0) {
                    servers.splice(0, servers.length);
                    resolve();
                }
            }).on("error", reject);
        });
    });
}