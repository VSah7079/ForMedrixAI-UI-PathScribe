// src/services/assistPolling/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-87: Assist-mode LIS polling. In Assist mode the external LIS owns the
// case, and it rarely pushes preliminary results, so PathScribe polls it
// for workflow milestones (Pete, Sep 2026). Each milestone found drives an
// AI synoptic draft for the pathologist to review.
//
// Since Batch 323 (Pete's ingestion-layer design) every update, polled or
// pushed, goes through the universal staging queue in services/lisIngestion/
// first; this folder is the worker that turns staged events into drafts.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalizedLisUpdate, LisIngestionSource } from '../lisIngestion/types';

/** The two LIS milestones PathScribe acts on. */
export type AssistMilestone = 'gross_complete' | 'micro_diagnosis_complete';

export const ASSIST_MILESTONES: readonly AssistMilestone[] = ['gross_complete', 'micro_diagnosis_complete'];

/** One LIS update. Since Batch 323 this is the ingestion layer's
 *  NormalizedLisUpdate (services/lisIngestion/); the name is kept for the
 *  Assist code that reads it. */
export type LisCaseSnapshot = NormalizedLisUpdate;

/** Maps one LIS status value to a milestone (site-configured). */
export interface LisStatusCrosswalkEntry {
  lisStatus: string;
  milestone: AssistMilestone;
}

export interface AssistPollingSettings {
  enabled: boolean;
  /** How often the server-side schedule should poll. */
  intervalMinutes: number;
  statusCrosswalk: LisStatusCrosswalkEntry[];
}

export type AssistItemOutcome =
  | 'draft_prepared'         // the AI ran and the draft was created or refreshed
  | 'text_only_ai_disabled'  // text synced; the matching AI Behavior toggle is off
  | 'text_only_superseded'   // Gross arrived after Micro/Diagnosis was already drafted
  | 'no_milestone'           // the LIS status isn't in the crosswalk
  | 'already_processed'      // same milestone, same text as last time
  | 'case_not_found'
  | 'not_assist_case'
  | 'case_signed_out'
  | 'failed';

export interface AssistPollItemResult {
  /** The staging-queue event this result is for. */
  eventId: string;
  source: LisIngestionSource;
  accession: string;
  lisStatus: string;
  milestone?: AssistMilestone;
  outcome: AssistItemOutcome;
  /** Draft synoptic instances created. */
  draftsCreated: number;
  /** Synoptic fields the AI suggested a value for. */
  fieldsSuggested: number;
  /** Template changes left for the pathologist to review. */
  pendingReviewChanges: number;
  error?: string;
}

export interface AssistPollRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  /** manual = Poll now; scheduled = the server schedule; push = an
   *  inbound message; retry = an admin retried failed events. */
  trigger: 'manual' | 'scheduled' | 'push' | 'retry';
  /** Updates the poll adapter returned (0 for push and retry runs). */
  fetched: number;
  /** New events added to the staging queue (duplicates are skipped). */
  staged: number;
  items: AssistPollItemResult[];
  /** Set when the LIS couldn't be reached, or a pushed message couldn't
   *  be read (an adapter error code). */
  error?: string;
}

export interface AssistMilestoneRecord {
  processedAt: string;
  /** Fingerprint of the LIS text the draft was built from. */
  textHash: string;
}

/** Per accession: which milestones have been drafted, and from what. */
export type AssistCaseRecords = Record<string, Partial<Record<AssistMilestone, AssistMilestoneRecord>>>;

export interface AssistPollingState {
  settings: AssistPollingSettings;
  /** Latest LIS updatedAt the poll adapter has staged; the next poll asks
   *  for later changes. Failures no longer hold it back: they wait in the
   *  staging queue. */
  cursor: string | null;
  records: AssistCaseRecords;
  /** Most recent runs, newest first. */
  runs: AssistPollRun[];
}
