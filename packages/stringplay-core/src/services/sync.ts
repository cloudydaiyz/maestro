import { BaseDbService } from "./base";
import { TroupeSync } from "./sync/troupe-sync";

export class SyncService extends BaseDbService {
    constructor() { super() }

    async sync(troupeId: string, skipLogPublish?: true): Promise<void> {
        await TroupeSync.create().then(handler => handler.sync(troupeId, skipLogPublish));
    }
}