// src/types/events/MolecularRunResultsPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §4.2 "Inbound Result &
// Execution Payload (Interface Engine → PathScribe)" — the exact JSON
// shape that section specifies, field for field, matching
// MolecularWorklistPayload.ts's own reasoning for keeping this file's
// snake_case wire naming rather than translating to camelCase.
//
// Real, deliberate, separate entity from this app's own already-
// existing MolecularBatchResultEventPayload.ts (types/events/) —
// confirmed by reading that file and its own real, working ingestion
// (processInboundMolecularBatchEvent.ts) directly before writing this
// one. That event's own real job is QC-run association for MOL-QA-02/
// 04 (which specimens ran together, feeding
// IMolecularQcRunRecordService's own invalidControlCount/inhibitorCount/
// controlResults shape) — a genuinely different real payload than this
// specification's own §4.2, which reports a specific well's own raw
// Ct/RFU result and interpretation against a plate this app itself
// built and dispatched (§4.1). Forcing the two together would distort
// a real, already-working pipeline to accommodate a shape it was never
// designed for.
// ─────────────────────────────────────────────────────────────────────────────

export type MolecularRunStatus = 'COMPLETED' | 'FAILED' | 'ABORTED';
export type MolecularReviewStatus = 'AUTO_PASSED' | 'PENDING_REVIEW' | 'BLOCKED';
export type MolecularInterpretation = 'POSITIVE' | 'NEGATIVE' | 'INVALID' | 'INDETERMINATE';
export type MolecularResultFlag = 'NONE' | 'INHIBITED' | 'LOW_SIGNAL' | 'REPEAT_REQUIRED';

export interface MolecularRunResultsBatchInfo {
  batch_uuid: string;
  instrument_id: string;
  run_status: MolecularRunStatus;
}

/** Real, per the given specification's own §5.2 "Run Validation
 *  Gating": the real, authoritative signal this app's own processing
 *  logic (resolveMolecularRunValidationGating.ts) checks before ever
 *  allowing a result to auto-verify. */
export interface MolecularControlValidation {
  controls_passed: boolean;
  review_status: MolecularReviewStatus;
}

export interface MolecularRawResultData {
  ct_value?: number;
  internal_control_ct?: number;
  rfu_signal?: number;
}

export interface MolecularWellResult {
  well_position: string;
  specimen_uuid: string | null;
  accession_number?: string;
  raw_data: MolecularRawResultData;
  interpretation: MolecularInterpretation;
  flag: MolecularResultFlag;
}

export interface MolecularRunResultsPayload {
  event_type: 'MOLECULAR_RUN_RESULTS';
  timestamp: string;
  batch_info: MolecularRunResultsBatchInfo;
  control_validation: MolecularControlValidation;
  results: MolecularWellResult[];
}
