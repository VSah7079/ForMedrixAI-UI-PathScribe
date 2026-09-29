// src/services/lisIngestion/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// The vendor-agnostic LIS ingestion layer (PS-87, Pete's design, Sep 24):
//
//   adapters (HL7 v2, JSON webhook, polling)
//        │  each turns its own input into NormalizedLisUpdate
//        ▼
//   universal staging queue (StagedLisEvent)
//        │  PathScribe's workflow reads only from here, never from the LIS
//        ▼
//   workers (today: services/assistPolling, the Assist AI draft)
//
// Pushed messages and polled results land in the same queue, so a site can
// use real-time messages, polling, or both.
// ─────────────────────────────────────────────────────────────────────────────

/** How an update reached PathScribe. */
export type LisIngestionSource = 'poll' | 'hl7v2' | 'webhook';

/** One LIS update, whatever it arrived as. Status and text are in the
 *  LIS's own vocabulary; the site's crosswalk interprets the status. */
export interface NormalizedLisUpdate {
  /** The LIS accession; for an Assist case this is PathScribe's case id. */
  accession: string;
  /** The LIS's own workflow status value, e.g. "GROSSED". */
  lisStatus: string;
  /** When the LIS says this changed (ISO). */
  updatedAt: string;
  grossText?: string;
  microscopicText?: string;
  diagnosisText?: string;
}

export type StagedEventState = 'pending' | 'processed' | 'failed';

/** A row in the universal staging queue. */
export interface StagedLisEvent extends NormalizedLisUpdate {
  id: string;
  source: LisIngestionSource;
  receivedAt: string;
  /** Identifies the same update arriving twice (a re-poll, or a push and
   *  a poll of the same change); the duplicate isn't staged. */
  fingerprint: string;
  state: StagedEventState;
  attempts: number;
  /** The worker's result code once handled (e.g. "draft_prepared"). */
  outcome?: string;
  error?: string;
  processedAt?: string;
}

/** A push adapter turns one raw inbound message into updates, or an
 *  error code the admin screen can translate. */
export type AdapterResult =
  | { ok: true; updates: NormalizedLisUpdate[] }
  | { ok: false; error: AdapterError };

export const ADAPTER_ERRORS = [
  'EMPTY_MESSAGE', 'NOT_HL7', 'UNSUPPORTED_MESSAGE_TYPE', 'INVALID_JSON',
  'MISSING_ACCESSION', 'MISSING_STATUS', 'INVALID_UPDATED_AT',
] as const;
export type AdapterError = typeof ADAPTER_ERRORS[number];

/** True for an adapter's error code (as opposed to free-text errors such
 *  as an unreachable LIS). */
export const isAdapterError = (code: string | undefined): code is AdapterError =>
  !!code && (ADAPTER_ERRORS as readonly string[]).includes(code);

export interface LisPushAdapter {
  source: Exclude<LisIngestionSource, 'poll'>;
  normalize(raw: string): AdapterResult;
}

export interface LisPollAdapter {
  source: 'poll';
  /** Every case the LIS reports as changed after `since` (null = all). */
  fetchChangedSince(since: string | null): Promise<NormalizedLisUpdate[]>;
}
