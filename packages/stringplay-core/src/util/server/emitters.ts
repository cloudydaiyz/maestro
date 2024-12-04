import EventEmitter from "events";
import { z } from "zod";
import { BodySchema } from "../../body";

/** 
 * // ========== EVENT EMITTERS ========== //
 * 
 * The event emitters acts as a separate service for responding to service requests.
 * 
 * This is to simulate the actual services other than the API that will be active in 
 * the system in production for the dev environment.
 * 
 * The emitter won't respond to events unless a server is set up (see `server.ts`).
 */

/** An event emitter that acts as the sync service to respond to sync requests. */
export const syncServer = new EventEmitter<{sync: [z.infer<typeof BodySchema.SyncRequest>]}>();

/** An event emitter that acts as the scheduled task service to respond to scheduled tasks. */
export const scheduleServer = new EventEmitter<{task: [z.infer<typeof BodySchema.ScheduledTaskRequest>]}>();