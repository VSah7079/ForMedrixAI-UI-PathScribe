// src/services/liveUpdates/localLiveUpdateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: live updates without a server. The mock services publish each
// write here (standing in for the API server, which publishes after it
// commits), and a BroadcastChannel carries it to this browser's other
// windows — so two boards open on one computer, or a board and the Intraop
// Queue, update each other instantly. Other devices can't be reached
// without the hub; the screens keep polling for those (state `local`).
//
// Batch 347 (PS-54): network print results travel the same way. With no
// server nobody ever sends one, so the demo publishes a simulated result
// (publishPrintJobStatus) to show the flow end to end.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LIVE_UPDATES_CONTRACT_VERSION, parseIntraopChangedEvent, parsePrintJobStatusEvent,
  type IntraopChangedEvent, type IntraopScope, type PrintJobStatusEvent,
} from './liveUpdateContract';
import { createDuplicateFilter, eventMatchesScope, type LiveConnectionState } from './liveUpdatePolicy';
import type { ILiveUpdateService, LiveUpdateSubscription } from './ILiveUpdateService';

export const LOCAL_CHANNEL_NAME = 'pathscribe-live-intraop';

interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface LocalLiveUpdateService extends ILiveUpdateService {
  /** What the API server will do after a committed write. */
  publish(change: Omit<IntraopChangedEvent, 'v' | 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: string }): IntraopChangedEvent;
  /** What the API server will do when the interface engine reports on a print job. */
  publishPrintJobStatus(result: Omit<PrintJobStatusEvent, 'v' | 'eventId' | 'occurredAt'> & { eventId?: string; occurredAt?: string }): PrintJobStatusEvent;
}

let counter = 0;
const newEventId = () => `local-${Date.now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createLocalLiveUpdateService(deps: {
  channelFactory?: (name: string) => ChannelLike | null;
  now?: () => Date;
} = {}): LocalLiveUpdateService {
  const now = deps.now ?? (() => new Date());
  const channelFactory = deps.channelFactory ?? ((name: string) =>
    (typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(name) as unknown as ChannelLike)));
  const subscribers = new Map<number, { scope: IntraopScope; onEvent: (e: IntraopChangedEvent) => void }>();
  const printSubscribers = new Map<number, (e: PrintJobStatusEvent) => void>();
  const isNew = createDuplicateFilter();
  let nextId = 1;
  let channel: ChannelLike | null | undefined;

  const deliver = (event: IntraopChangedEvent) => {
    if (!isNew(event.eventId)) return;
    for (const s of [...subscribers.values()]) {
      if (!eventMatchesScope(event, s.scope)) continue;
      try { s.onEvent(event); } catch (e) { console.error('[liveUpdates] subscriber failed:', e); }
    }
  };

  const deliverPrint = (event: PrintJobStatusEvent) => {
    if (!isNew(event.eventId)) return;
    for (const onEvent of [...printSubscribers.values()]) {
      try { onEvent(event); } catch (e) { console.error('[liveUpdates] print-result subscriber failed:', e); }
    }
  };

  const ensureChannel = () => {
    if (channel !== undefined) return channel;
    try { channel = channelFactory(LOCAL_CHANNEL_NAME); } catch { channel = null; }
    if (channel) {
      channel.onmessage = ev => {
        const e = parseIntraopChangedEvent(ev.data);
        if (e) { deliver(e); return; }
        const p = parsePrintJobStatusEvent(ev.data);
        if (p) deliverPrint(p);
      };
    }
    return channel;
  };

  return {
    transport: 'local',
    subscribeIntraop(scope, onEvent): LiveUpdateSubscription {
      ensureChannel();
      const id = nextId++;
      subscribers.set(id, { scope, onEvent });
      return { unsubscribe: () => { subscribers.delete(id); } };
    },
    subscribePrintJobs(onEvent): LiveUpdateSubscription {
      ensureChannel();
      const id = nextId++;
      printSubscribers.set(id, onEvent);
      return { unsubscribe: () => { printSubscribers.delete(id); } };
    },
    getState: (): LiveConnectionState => 'local',
    onStateChange: () => () => {},
    onResync: () => () => {},
    publish(change) {
      const event: IntraopChangedEvent = {
        ...change,
        v: LIVE_UPDATES_CONTRACT_VERSION,
        eventId: change.eventId ?? newEventId(),
        occurredAt: change.occurredAt ?? now().toISOString(),
      };
      deliver(event);
      try { ensureChannel()?.postMessage(event); } catch { /* another window may be closing */ }
      return event;
    },
    publishPrintJobStatus(result) {
      const event: PrintJobStatusEvent = {
        ...result,
        v: LIVE_UPDATES_CONTRACT_VERSION,
        eventId: result.eventId ?? newEventId(),
        occurredAt: result.occurredAt ?? now().toISOString(),
      };
      deliverPrint(event);
      // Other windows of this browser hear it too; only the one that sent
      // the job knows it and acts on it.
      try { ensureChannel()?.postMessage(event); } catch { /* another window may be closing */ }
      return event;
    },
  };
}

/** The shared instance: the mock services publish to it, and `@/services`
 *  hands it to the screens when no hub is configured. */
export const localLiveUpdateService = createLocalLiveUpdateService();
