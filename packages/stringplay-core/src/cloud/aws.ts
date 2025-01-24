import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { SyncRequest } from "../types/service-types";
import { AWS_SYNC_QUEUE_URL } from "../util/env";

/** Adds requests to the sync queue */ 
type SyncQueueMetadata = SyncRequest & { attempts?: number };
export async function bulkAddToAwsSyncQueue(requests: SyncRequest[]): Promise<void> {
    const requestsMeta: SyncQueueMetadata[] = structuredClone(requests);
    const client = new SQSClient();
    
    for(let i = 0; i < requests.length; i++) {
        const request = requestsMeta[i];
        const command = new SendMessageCommand({
            QueueUrl: AWS_SYNC_QUEUE_URL,
            MessageBody: request.troupeId,
        });

        try {
            await client.send(command);
        } catch(e) {
            console.log(`Unable to add troupe ID ${request.troupeId} to the sync queue.`,
                request.attempts ? `(Attempt ${request.attempts})` : '');
            
            if(!request.attempts) {
                request.attempts = 1;
                requestsMeta.push(request);
            } else if(request.attempts < 3) {
                request.attempts++;
                requestsMeta.push(request);
            } else {
                console.log(`Max attempts reached for troupe ID ${request.troupeId}. Dropping the request.`);
            }
        }
    }
}