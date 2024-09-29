import assert from "assert";

export const MONGODB_URI = process.env.MONGODB_URI!;
export const MONGODB_USER = process.env.MONGODB_USER;
export const MONGODB_PASS = process.env.MONGODB_PASS;

assert(MONGODB_URI);