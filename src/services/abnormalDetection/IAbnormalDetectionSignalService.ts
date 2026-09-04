// src/services/abnormalDetection/IAbnormalDetectionSignalService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-137 (part of PS-105) — "Level 1 AI learning" for the Abnormal
// Detection engine, real per direct guidance: "That would be an
// important thing to keep track of as part of QA. How often was
// their agreement. When not in agreement, an opportunity to feed that
// information back for learning, just like we do when we add or
// remove synoptic reports."
//
// That precedent is real, checked directly, not assumed — two existing
// services already do exactly this for two other suggestion shapes:
// TemplateSuggestionSignal (services/templateSuggestions/ — the literal
// synoptic-template add/override/dismiss tracker) and NarrativeEditSignal
// (services/narrativeSignals/ — de-identified AI-vs-pathologist text
// diffs). This mirrors both, unified into one shape rather than two
// fully separate services, since PS-129 (discrete) and PS-131
// (narrative) suggestions differ only in whether real clinical text is
// involved — everything else about the signal (severity, confidence,
// outcome) is identical.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { AbnormalSeverity } from './IAbnormalTriggerRuleService';

export interface AbnormalDetectionSignal {
  id: string;
  caseId: string;
  source: 'discrete' | 'narrative';
  /** Real, per direct guidance's own reasoning: for a 'narrative'
   *  signal, this is the matched text/reason run through
   *  deidentifyText() (services/narrativeSignals/deidentification.ts)
   *  before ever being stored — same real PHI-safety boundary as
   *  NarrativeEditSignal. For a 'discrete' signal, this is just the
   *  matched rule's field/value description (e.g. "Margin Status:
   *  Positive") — no de-identification needed, since it's a
   *  config-driven label, never real clinical narrative text. */
  reasonClean: string;
  suggestedSeverity: AbnormalSeverity;
  suggestedConfidence: number;
  /** 'confirmed' = the pathologist recorded a real notification
   *  (handleRecordCriticalNotification) — genuine agreement.
   *  'dismissed' = handleAcknowledgeCriticalFindings — same real
   *  "acknowledged without recording" semantics documented on that
   *  handler itself: the finding may have been real but already
   *  communicated another way this feature doesn't capture, or the
   *  pathologist judged the suggestion wasn't warranted. Deliberately
   *  not split into a third 'disputed' state — this app has no real,
   *  reliable way to distinguish those two cases from each other today. */
  outcome: 'confirmed' | 'dismissed';
  capturedAt: string;
}

export interface AbnormalDetectionSignalStats {
  totalSignals: number;
  confirmedCount: number;
  dismissedCount: number;
  /** confirmedCount / totalSignals — 0 when totalSignals is 0, never NaN. */
  agreementRate: number;
  bySeverity: Record<AbnormalSeverity, { total: number; confirmed: number }>;
  bySource: Record<'discrete' | 'narrative', { total: number; confirmed: number }>;
}

export interface IAbnormalDetectionSignalService {
  recordSignal(input: Omit<AbnormalDetectionSignal, 'id' | 'capturedAt'>): Promise<ServiceResult<AbnormalDetectionSignal>>;
  getByCaseId(caseId: string): Promise<ServiceResult<AbnormalDetectionSignal[]>>;
  getStats(): Promise<ServiceResult<AbnormalDetectionSignalStats>>;
}
