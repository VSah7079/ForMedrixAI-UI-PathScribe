// src/types/case/CaseComment.ts
// ─────────────────────────────────────────────────────────────
// Replaces the single-string comment field (both Case.order.
// accessionComment and Specimen.comment used to be a plain string,
// silently overwritten by whoever saved last) with a real, append-only
// thread — each entry is its own record with a real author and
// timestamp, nothing ever gets overwritten. Same shape used for both
// case-level and specimen-level comments.
// ─────────────────────────────────────────────────────────────

export interface CaseComment {
  id: string;
  authorId: string;
  authorName: string;
  /**
   * Real feature, per direct follow-up: "Stamp every saved draft...
   * with... station_id captured at the exact moment of saving...
   * specimen-log." Same real, additive shape as Case.
   * lastUpdatedFromStation/ReportVersionRecord.createdFromStation —
   * captured automatically at real comment creation
   * (SynopticReportPage.tsx's own handleAddCaseComment/
   * handleAddSpecimenComment), not a caller-provided value. Genuinely
   * absent for any comment posted before this field existed, or with
   * no station known at the moment it was posted.
   */
  stationId?: string | null;
  /** Rich text (HTML) — same PathScribeEditor content both comment
   *  modals already used before this change. */
  text: string;
  createdAt: string;

  /**
   * Where this comment actually originated — added for CoPilot mode,
   * where PathScribe is a sidecar to an owning LIS rather than the
   * system of record. Distinct from authorId/authorName (who wrote it)
   * the same way HL7's NTE-2 "comment source" field and FHIR's separate
   * Provenance resource both exist because "who wrote this" and "which
   * system does this comment live in" are different questions. A
   * comment with origin 'lis' was received from the owning LIS —
   * PathScribe can't edit or delete it, only append a new comment in
   * reply (which this whole type already only supports anyway, since
   * comments are append-only).
   *
   * Every comment authored through PathScribe's own composer (both
   * modals) is origin: 'pathscribe' — this is set automatically, not a
   * user choice.
   */
  origin: 'pathscribe' | 'lis';

  /**
   * Outbound delivery state — only meaningful when origin is
   * 'pathscribe' and the case is running in CoPilot mode (there's
   * nothing to sync in Orchestration mode, where PathScribe already is
   * the system of record). Mirrors the same "never silently lose track
   * of a real-world state" pattern already used for deficiency
   * resolution and audit logging elsewhere in this app — a comment that
   * needs to reach the LIS shouldn't just be "saved," it should be
   * trackable as pending/sent/acknowledged/failed.
   *
   * No real CoPilot inbound/outbound LIS message channel exists yet to
   * actually drive this field through its states — set to 'pending' at
   * creation and never actually transitions today. Built now so the UI
   * can visually demonstrate the distinction; the real transport is
   * separate, later work.
   */
  syncStatus?: 'pending' | 'sent' | 'acknowledged' | 'failed';
}
