/** Catch and relays client input based errors */
export class ClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ClientError";
    }
}

/** Catches and relay authentication based errors */
export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthenticationError";
    }
}