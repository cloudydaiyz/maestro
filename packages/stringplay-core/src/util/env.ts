// TODO: make an env converter / adapter that prefixes env names to VITE_ so that 
// these can be pulled into @cloudydaiyz/springplay-shared
// https://vite.dev/guide/env-and-mode.html#env-files

// export const STRINGPLAY_SERVER_PORT = process.env.STRINGPLAY_SERVER_PORT;

export const MONGODB_URI = process.env.MONGODB_URI;
export const MONGODB_USER = process.env.MONGODB_USER;
export const MONGODB_PASS = process.env.MONGODB_PASS;
export const LOG_SHEET_DRIVE_ID = process.env.LOG_SHEET_DRIVE_ID;
export const DEV_MODE = process.env.NODE_ENV != "production";
export const CLOUD_PROVIDER = process.env.CLOUD_PROVIDER;
export const GCP_CREDS = process.env.GCP_CREDS;
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
export const GCP_REGION = process.env.GCP_REGION;
export const GCP_SERVICE_ACCOUNT_EMAIL = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
export const GCP_SYNC_QUEUE_NAME = process.env.GCP_SYNC_QUEUE_NAME;
export const GCP_SCHEDULE_FUNCTION_URL = process.env.GCP_SCHEDULE_FUNCTION_URL;
export const AWS_SYNC_QUEUE_NAME = process.env.AWS_SYNC_QUEUE_NAME;
export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
export const INVITE_CODES = process.env.INVITE_CODES;