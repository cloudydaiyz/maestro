import { Troupe } from "./api-types";

export type CreateTroupeRequest = Omit<
    Troupe, 
    "id" | "lastUpdated" | "refreshLock" | "eventTypes" | "logSheetUri"
> & { email: string, password: string };

export type UserSchema = {
    troupeId: string,
    emails: string[],
    password: string,
}