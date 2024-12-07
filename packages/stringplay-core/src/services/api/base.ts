import assert from "assert";
import { BaseDbService } from "../base";
import { LimitService } from "../limits";
import { LimitSchema } from "../../types/core-types";
import { ClientSession, DeleteManyModel, DeleteOneModel, Document, InsertOneModel, UpdateManyModel, UpdateOneModel } from "mongodb";
import { LimitContext, TroupeLimitSpecifier } from "../../types/service-types";
import { ClientError } from "../../util/error";

export type DbWriteRequest<T extends Document> = {
    collection: string;
    request: InsertOneModel<T> | UpdateOneModel<T> | UpdateManyModel<T> | DeleteOneModel<T> | DeleteManyModel<T>;
};

export abstract class ApiRequestBuilder<ApiRequestType, ApiResponseType> extends BaseDbService {
    limitService!: LimitService;
    troupeId: string | null;
    requests: ApiRequestType[];
    limits: boolean;
    limitContext?: LimitContext;
    session?: ClientSession;

    constructor() { 
        super();
        
        this.troupeId = null;
        this.requests = [];
        this.limits = true;
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

    setLimitContext(limitContext?: LimitContext): void {
        this.limitContext = limitContext;
    }

    setSession(session: ClientSession): void {
        this.session = session;
    }

    /** Executes the request */
    async execute(): Promise<ApiResponseType[]> {
        await this.ready;

        let responses: ApiResponseType[];
        if(this.session) {
            await this.readData(this.session);
            const [updateLimits, writeRequests] = this.processRequests();

            if(this.limits) {
                const limitsUpdated = await this.limitService.incrementTroupeLimits(
                    this.limitContext, this.troupeId!, updateLimits, this.session
                );
                assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));
            }
            responses = await this.writeProcessedRequests(writeRequests, this.session);
        } else {
            await this.client.withSession(session => session.withTransaction(
                async (session) => {
                    await this.readData(session);
                    const [updateLimits, writeRequests] = this.processRequests();

                    if(this.limits) {
                        const limitsUpdated = await this.limitService.incrementTroupeLimits(
                            this.limitContext, this.troupeId!, updateLimits, session
                        );
                        assert(limitsUpdated, new ClientError("Operation not within limits for this troupe"));
                    }
                    responses = await this.writeProcessedRequests(writeRequests, session);
                }
            ));
        }

        return responses!;
    }

    // Factory version of the execute method, unique to each subclass
    static execute<Request, Response>(
        this: new() => ApiRequestBuilder<Request, Response>, 
        troupeId: string, 
        request: Request, 
        limits?: boolean,
        limitContext?: LimitContext,
    ): Promise<Response[]> {
        const builder = new this();
        builder.addTroupeId(troupeId);
        builder.addRequest(request);
        if(limits !== undefined) builder.setLimits(limits);
        if(limitContext !== undefined) {
            builder.setLimits(true);
            builder.setLimitContext(limitContext);
        }

        return builder.execute();
    }

    static bulkExecute<Request, Response>(
        this: new() => ApiRequestBuilder<Request, Response>, 
        troupeId: string, 
        requests: Request[], 
        limits?: boolean,
        limitContext?: LimitContext,
    ): Promise<Response[]> {
        const builder = new this();
        builder.addTroupeId(troupeId);
        requests.forEach(request => builder.addRequest(request));
        if(limits !== undefined) builder.setLimits(limits);
        if(limitContext !== undefined) {
            builder.setLimits(true);
            builder.setLimitContext(limitContext);
        }

        return builder.execute();
    }

    /** Obtains data from the DB necessary for the request */
    abstract readData(session: ClientSession): Promise<void>;

    /** 
     * Processes the data and returns the resulting update to the troupe 
     * and the other writes to the DB in order to perform request (if any). 
     */
    abstract processRequests(): [TroupeLimitSpecifier, DbWriteRequest<any>[]];

    /** 
     * Processes the data to write to the DB (limits increment included) in order 
     * to perform the specified request. Returns responses to each request.
     */
    abstract writeProcessedRequests(writeRequests: DbWriteRequest<any>[], session: ClientSession): Promise<ApiResponseType[]>;
}