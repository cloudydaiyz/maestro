import { CloudProvider, SyncRequest } from "../types/service-types";
import { CLOUD_PROVIDER } from "../util/env";

export async function addToSyncQueue(request: SyncRequest): Promise<void> {
    const cp = CLOUD_PROVIDER as CloudProvider | undefined || 'gcp';
    if(cp == 'aws') {
        const { bulkAddToAwsSyncQueue } = await import("../cloud/aws");
        await bulkAddToAwsSyncQueue([ request ]);
    } else if(cp == 'gcp') {
        const { bulkAddToGcpSyncQueue } = await import("../cloud/gcp");
        await bulkAddToGcpSyncQueue([ request ]);
    }
}

export async function bulkAddToSyncQueue(requests: SyncRequest[]): Promise<void> {
    const cp = CLOUD_PROVIDER as CloudProvider | undefined || 'gcp';
    if(cp == 'aws') {
        const { bulkAddToAwsSyncQueue } = await import("../cloud/aws");
        await bulkAddToAwsSyncQueue(requests);
    } else if(cp == 'gcp') {
        const { bulkAddToGcpSyncQueue } = await import("../cloud/gcp");
        await bulkAddToGcpSyncQueue(requests);
    }
}