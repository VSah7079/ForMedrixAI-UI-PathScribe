// src/services/liveUpdates/ILiveUpdateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: live updates for the intraoperative screens (OR Suite Live Board,
// Intraop Queue). Two implementations:
//   • signalRLiveUpdateService — the API server's SignalR hub (production)
//   • localLiveUpdateService   — no server: this browser's own windows,
//                                fed by the mock services' writes
// `@/services` exports whichever applies as `liveUpdateService`.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntraopChangedEvent, IntraopScope, PrintJobStatusEvent } from './liveUpdateContract';
import type { LiveConnectionState } from './liveUpdatePolicy';

export interface LiveUpdateSubscription {
  unsubscribe(): void;
}

export interface ILiveUpdateService {
  readonly transport: 'signalr' | 'local';
  /** Calls `onEvent` for each change inside `scope`. Connects on first use. */
  subscribeIntraop(scope: IntraopScope, onEvent: (event: IntraopChangedEvent) => void): LiveUpdateSubscription;
  /** Calls `onEvent` for each network print result sent to this user
   *  (Batch 347, PS-54). Connects on first use, like subscribeIntraop. */
  subscribePrintJobs(onEvent: (event: PrintJobStatusEvent) => void): LiveUpdateSubscription;
  getState(): LiveConnectionState;
  onStateChange(listener: (state: LiveConnectionState) => void): () => void;
  /** Called after a (re)connection: events may have been missed, so re-read. */
  onResync(listener: () => void): () => void;
}
