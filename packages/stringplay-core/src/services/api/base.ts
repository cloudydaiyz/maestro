import assert from "assert";
import { BaseDbService } from "../base";
import { LimitService } from "../limits";
import { LimitSchema } from "../../types/core-types";
import { DeleteManyModel, DeleteOneModel, Document, InsertOneModel, UpdateManyModel, UpdateOneModel } from "mongodb";
import { TroupeLimitSpecifier } from "../../types/service-types";

export type DbWriteRequest<T extends Document> = {
    collection: string;
    request: InsertOneModel<T> | UpdateOneModel<T> | UpdateManyModel<T> | DeleteOneModel<T> | DeleteManyModel<T>;
};

export abstract class ApiRequestBuilder<ApiRequestType, ApiResponseType> extends BaseDbService {
    limitService!: LimitService;
    troupeId: string | null;
    requests: ApiRequestType[];
    limits: boolean;
    atomic: boolean;

    constructor() { 
        super();
        
        this.troupeId = null;
        this.requests = [];
        this.limits = true;
        this.atomic = true;
        this.ready = this.init();
    }

    async init(): Promise<void> {
        this.limitService = await LimitService.create();
    }

    /** Specifies a troupe ID for this operation */
    addTroupeId(troupeId: string): void {
        this.troupeId = troupeId;
    }

    /** Adds the request to the list of requests to be processed */
    addRequest(request: ApiRequestType): void {
        this.requests.push(request);
    }

    /** Sets whether or not this request will check limits on execute */
    setLimits(limits: boolean): void {
        this.limits = limits;
    }

    /** Sets whether or not this request will perform a transaction on execute */
    setAtomic(atomic: boolean): void {
        this.atomic = atomic;
    }

    /** 
     * Prepares for execution by obtaining data from the DB and processing the requests. 
     * This gives flexibility on when & how to perform the rest of the execution. 
     */
    async beginExecute(): Promise<[TroupeLimitSpecifier, DbWriteRequest<any>[]]> {
        assert(this.troupeId, "Invalid state; no troupe ID specified");

        await this.readData();
        return this.processRequests();
    }

    /** Executes the request */
    async execute(): Promise<ApiResponseType[]> {
        const [updateLimits, writeRequests] = await this.beginExecute();

        let responses: ApiResponseType[];
        if(this.atomic) {
            this.client.startSession().withTransaction(async () => {
                if(this.limits) {
                    await this.limitService.incrementTroupeLimits(this.troupeId!, updateLimits);
                }
                responses = await this.writeProcessedRequests(writeRequests);
            });
        } else {
            if(this.limits) {
                await this.limitService.incrementTroupeLimits(this.troupeId!, updateLimits);
            }
            responses = await this.writeProcessedRequests(writeRequests);
        }

        return responses!;
    }

    // Factory version of the execute method, unique to each subclass
    static execute<Request, Response>(
        this: new() => ApiRequestBuilder<Request, Response>, 
        troupeId: string, 
        request: Request, 
        limits?: boolean,
        atomic?: boolean,
    ): Promise<Response[]> {
        const builder = new this();
        builder.addTroupeId(troupeId);
        builder.addRequest(request);
        if(limits !== undefined) builder.setLimits(limits);
        if(atomic !== undefined) builder.setAtomic(atomic);

        return builder.execute();
    }

    /** Obtains data from the DB necessary for the request */
    abstract readData(): Promise<void>;

    /** 
     * Processes the data and returns the resulting update to the troupe 
     * and the other writes to the DB in order to perform request (if any). 
     */
    abstract processRequests(): [TroupeLimitSpecifier, DbWriteRequest<any>[]];

    /** 
     * Processes the data to write to the DB (limits increment included) in order 
     * to perform the specified request. Returns responses to each request.
     */
    abstract writeProcessedRequests(writeRequests: DbWriteRequest<any>[]): Promise<ApiResponseType[]>;
}