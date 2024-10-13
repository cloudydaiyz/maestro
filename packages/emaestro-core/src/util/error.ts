// To help catch and relay client-based errors
export class ClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ClientError";
    }
}