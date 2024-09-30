import assert from "assert";

export const MONGODB_URI = process.env.MONGODB_URI!;
export const MONGODB_USER = process.env.MONGODB_USER;
export const MONGODB_PASS = process.env.MONGODB_PASS;
export const SERVICE_KEY_PATH = process.env.SERVICE_KEY_PATH!;

const requiredEnvVars = [
    MONGODB_URI,
    MONGODB_USER,
    MONGODB_PASS,
];

assert(requiredEnvVars.every((envVar) => envVar), "Missing required environment variables");