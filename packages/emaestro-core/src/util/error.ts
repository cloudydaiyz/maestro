// To help catch and relay client-based errors
export class MaestroClientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MaestroClientError";
    }
}