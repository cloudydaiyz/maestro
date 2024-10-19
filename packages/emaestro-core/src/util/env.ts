import assert from "assert";

export const MONGODB_URI = process.env.MONGODB_URI!;
export const MONGODB_USER = process.env.MONGODB_USER;
export const MONGODB_PASS = process.env.MONGODB_PASS;
export const SERVICE_KEY_PATH = process.env.SERVICE_KEY_PATH!;
export const BASE_LOG_SHEET_ID = process.env.BASE_LOG_SHEET_ID!;
export const LOG_SHEET_DRIVE_ID = process.env.LOG_SHEET_DRIVE_ID!;
export const DEV_MODE = process.env.DEV_MODE == "1" || process.env.JEST_WORKER_ID || process.env.NODE_ENV == "test" || process.env.NODE_ENV == "dev";

const requiredEnvVars = [
    MONGODB_URI,
    MONGODB_USER,
    MONGODB_PASS,
];

assert(requiredEnvVars.every((envVar) => envVar), "Missing required environment variables");