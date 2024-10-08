import { BaseService } from "./base-service";
import { CreateTroupeRequest } from "../types/service-types";
import { Collection } from "mongodb";
import { UserSchema, UserSessionSchema } from "../types/core-types";
import { DB_NAME } from "../util/constants";
import { TroupeCoreService } from "../core";

/**
 *  1. Encrypt passwords at rest
 *  2. Recycle keys to encrypt / decrypt tokens daily
 *  3. Recycle keys to encrypt / decrypt passwords weekly
 */
export class AuthCoreService extends TroupeCoreService {
    userColl: Collection<UserSchema>;
    sessionColl: Collection<UserSessionSchema>;

    constructor() { 
        super() 
        this.userColl = this.client.db(DB_NAME).collection("users");
        this.sessionColl = this.client.db(DB_NAME).collection("sessions");
    }

    /** Creates a new account with the associated troupe */
    register(email: string, password: string, request: CreateTroupeRequest) {
        this.createTroupe(request);
    }
    
    /** Creates a new session and returns the associated access and refresh tokens */
    login(email: string, password: string) {

    }

    /** Validates a given access token */
    validate(accessToken: string): boolean {
        const rand = Math.floor(Math.random() * 10);
        if (rand > 5) {
            return true;
        } else {

        }
        return false;
    }

    /** Refreshes access credentials */
    refresh(refreshToken: string) {

    }

    /** Deletes the account & troupe associated with the account */
    delete(accessToken: string) {

    }
}