// src/types/reports/ReportVersionRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// CORRECTED — restores the real, already-in-use schema (mode, trigger,
// createdBy, pdfBase64, generationError, synopticAnswersSnapshot). My
// earlier draft replaced this entirely with a case-wide `instances[]`
// bundle, which was wrong: it didn't know this PDF-based system already
// existed and was already relied on by SynopticReportPage.tsx.
//
// Only two fields are genuinely NEW here:
//   - instanceId: lets a per-synoptic-report version history be
//     filtered out of a case's records (a case can have multiple
//     synoptic instances, each amended independently).
//   - amendmentRecordId: links a version back to the AmendmentRecord
//     that produced it, so the banner can pull narrative (reason,
//     notification) for the version transition. Undefined for the
//     initial_signout trigger, since there's no amendment yet.
//
// Batch 366 (PS-68): this is the one release record. An earlier design,
// types/case/ReportSnapshot.ts, was never used and has been removed. Its
// release types live on here and on AmendmentRecord: `trigger` says
// original sign-out or amendment, and AmendmentRecord.type says whether an
// amendment corrects the report or adds to it (with its reason). Two of
// its points are not built yet and are for the API server:
//   - store the PDF by reference (object storage) rather than inline
//     like pdfBase64 does in the mock;
//   - record a SHA-256 of the PDF's bytes when the version is created,
//     and check it on retrieval, so a swapped file is detected (encryption
//     keeps it private; the hash shows it is unchanged).
// ─────────────────────────────────────────────────────────────────────────────

import type { PatientEncounterSnapshot } from './PatientEncounterSnapshot';

export type ReportVersionMode = 'assist' | 'orchestration';
export type ReportVersionTrigger = 'initial_signout' | 'amendment';

export interface ReportVersionRecord {
  id: string;
  caseId: string;
  versionNumber: number;
  createdAt: string;
  mode: ReportVersionMode;
  trigger: ReportVersionTrigger;
  createdBy: { userId: string; userName: string };
  /**
   * Real feature, per direct follow-up: "Stamp every saved draft...
   * with... station_id captured at the exact moment of saving."
   * Same real, additive shape as Case.lastUpdatedFromStation's own
   * doc comment — captured automatically by
   * mockReportVersionService.create() at the moment of creation,
   * same as patientEncounterSnapshot below. Genuinely absent for a
   * version created before this field existed, or if no station was
   * known at the moment of creation.
   */
  createdFromStation?: string | null;
  /** Full case PDF (every synoptic instance rendered together), same
   *  pipeline as the print button — not a second, separately-built artifact. */
  pdfBase64?: string;
  generationError?: string;
  /** One instance's structured answers at this version — the instance
   *  identified by `instanceId` below. */
  synopticAnswersSnapshot?: Record<string, unknown>;

  /** NEW — which synoptic instance this version's snapshot belongs to. */
  instanceId?: string;
  /** NEW — the AmendmentRecord that produced this version, if any. */
  amendmentRecordId?: string;

  /** NEW, Phase 5 — the real, immutable patient/encounter identity
   *  this version's report was signed against, captured automatically
   *  by mockReportVersionService.create() at the moment of creation.
   *  See PatientEncounterSnapshot.ts's own header comment for why this
   *  is distinct from pdfBase64. Genuinely absent for a version
   *  created before this field existed, or if the real patient/
   *  encounter lookup failed at capture time (never blocks the real
   *  sign-out itself on this - see mockReportVersionService.ts). */
  patientEncounterSnapshot?: PatientEncounterSnapshot;
}
