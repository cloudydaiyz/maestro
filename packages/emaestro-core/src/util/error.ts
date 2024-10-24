// To help catch and relay client input based errors
export class ClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ClientError";
    }
}

// To help relay authentication based errors
export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ClientError";
    }
}