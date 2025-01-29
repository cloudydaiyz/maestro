// Manages the resources created during app execution

import { MONGODB_PASS, MONGODB_USER } from "../env";
import { MongoClient } from "mongodb";
import assert from "assert";

let mongod: any = null;

export async function startDb(): Promise<void> {
    assert(MONGODB_USER && MONGODB_PASS, "ENV: Missing required environment variables");
    
    await stopDb();
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
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
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    const mmrs = mongod as Awaited<ReturnType<typeof MongoMemoryReplSet.create>>;
    if(mmrs) {
        await cleanDbConnections().then(() => mmrs!.stop());
    }
    mongod = null;
}

// == MONGO CLIENT MANAGEMENT == //
let client: MongoClient | null;
let numClientUsers: number;

export function newDbConnection(): MongoClient {
    assert(process.env.MONGODB_URI && MONGODB_USER && MONGODB_PASS, "ENV: Missing required environment variables");

    // MongoDB URI could be changed from testing -- use the environment variable instead of MONGODB_URI const
    if(!client) {
        client = new MongoClient(process.env.MONGODB_URI, { auth: { username: MONGODB_USER, password: MONGODB_PASS } });
        client.on("connecting", () => console.log("Connecting to MongoDB..."));
        client.on("connected", () => console.log("Connected to MongoDB"));
        client.on("error", (err) => console.error("Connection error:", err));
    }

    numClientUsers++;
    return client;
}

export async function removeDbConnection() {
    if(numClientUsers > 0) {
        numClientUsers--;
    }

    if(client && numClientUsers === 0) {
        await client.close();
        client = null;
    }
}

export async function cleanDbConnections() {
    if(client) await client.close();
    numClientUsers = 0;
}

export async function cleanLogs() {
    console.log("Cleaning logs");
    const { GoogleSheetsLogService } = await import("../../services/sync/logs/gsheets-log");
    const gsheets = new GoogleSheetsLogService();

    const deletes: Promise<any>[] = [];
    for(let i = GoogleSheetsLogService.logsCreated.length - 1; i >= 0; i--) {
        const log = GoogleSheetsLogService.logsCreated[i];
        console.log("Deleting log sheet at: " + log);
        deletes.push(gsheets.deleteLog(log));
        GoogleSheetsLogService.logsCreated.pop();
    }
    await Promise.all(deletes);
}