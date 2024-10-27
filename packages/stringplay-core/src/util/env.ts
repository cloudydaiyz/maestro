import assert from "assert";

export const MONGODB_URI = process.env.MONGODB_URI;
export const MONGODB_USER = process.env.MONGODB_USER;
export const MONGODB_PASS = process.env.MONGODB_PASS;
export const LOG_SHEET_DRIVE_ID = process.env.LOG_SHEET_DRIVE_ID;
export const DEV_MODE = process.env.NODE_ENV != "production";
export const GCP_CREDS = process.env.GCP_CREDS;
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
export const GCP_REGION = process.env.GCP_REGION;
export const GCP_SERVICE_ACCOUNT_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
export const SYNC_QUEUE_NAME = process.env.SYNC_QUEUE_NAME;
export const SCHEDULE_FUNCTION_URL = process.env.SCHEDULE_FUNCTION_URL;
export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;