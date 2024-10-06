import { MyTroupeCoreService } from "./services/core-service";
import { CreateTroupeRequest } from "./types/service-types";

export class AuthService extends MyTroupeCoreService {
    constructor() { super() }

    /** Resets the credentials */
    reset(email: string, newPassword: string, overrideKey: string) {

    }

    register(email: string, password: string, request: CreateTroupeRequest) {
        
    }
    
    login(email: string, password: string) {

    }

    validate(accessToken: string): boolean {
        return false;
    }

    /** Refreshes access credentials */
    refresh(refreshToken: string) {

    }

    /** Deletes the account & troupe associated with the account */
    delete(accessToken: string) {

    }
}