// src/types/cytology/CytologyReportContent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "I don't believe we have a defined
// template defined" — followed by the real, authoritative Bethesda
// System/CAP/CLIA standard structure for a complete, compliant GYN
// cytology report, supplied directly. Seven real, mandatory/standard
// sections; this type mirrors them exactly:
//   1. Administrative & Patient Identifiers
//   2. Specimen Type
//   3. Specimen Adequacy
//   4. General Categorization
//   5. Interpretation / Diagnostic Result
//   6. Adjunctive Testing & Integrated Results
//   7. Educational Notes, Comments, & Sign-Off
//
// Real, honest scoping: three real, standard §1 sub-items have no
// data source anywhere in this app yet — hormonal status, prior
// abnormal-Pap/HPV/procedure history, and IUD/contraception use (the
// same, already-deferred clinical-history-dictionary scope). Rather
// than carry three permanently-undefined fields implying that capture
// is imminent, they're genuinely omitted from this type — noted here,
// once, as a real gap, not silently dropped. Every other real,
// standard field below has a genuine, current data source.
//
// Real, standard §7 sign-off requirement: "Name and signature/
// electronic sign-off of the reviewing Cytotechnologist (if screened
// and finalized as NILM) and/or Pathologist (mandatory for any
// abnormal, suspicious, or high-risk findings)." Real, per this app's
// own review-history model (Phase 5): the Cytotechnologist who
// performed the real, initial primary_screen and the person who
// actually signed out are genuinely two different real attributions,
// captured separately here — never collapsed into one "signed by."
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyReportContent {
  // ── 1. Administrative & Patient Identifiers ─────────────────────────────
  patientName: string;
  patientDateOfBirth?: string;
  patientMrn?: string;
  accessionNumber: string;
  orderingProvider?: string;
  specimenCollectedAt?: string;
  specimenReceivedAt?: string;
  lastMenstrualPeriod?: string;

  // ── 2. Specimen Type ─────────────────────────────────────────────────────
  /** Real, per the specimen's own real dictionary entry — covers both
   *  the specimen type and its real anatomic origin (e.g. "Cervical/
   *  Vaginal Pap Smear, liquid-based"), not a separately-modeled field. */
  specimenTypeDescription: string;
  preparationMethod?: 'Liquid-Based' | 'Conventional';

  // ── 3. Specimen Adequacy ─────────────────────────────────────────────────
  specimenAdequacy: string[];

  // ── 4. General Categorization ────────────────────────────────────────────
  generalCategorization?: string;

  // ── 5. Interpretation / Diagnostic Result ────────────────────────────────
  primaryInterpretation: string;
  additionalInterpretations: string[];

  // ── 6. Adjunctive Testing & Integrated Results ───────────────────────────
  hpvResult?: string;
  computerAssistedScreening?: { used: boolean; system?: string };

  // ── 7. Educational Notes, Comments, & Sign-Off ───────────────────────────
  recommendations: string[];
  educationalNotes?: string;
  /** The real Cytotechnologist who performed the initial, real
   *  primary_screen review — undefined only if that review is
   *  genuinely missing (should not happen for a real, signed-out
   *  case, but this type does not assume it). */
  screenedBy?: { name: string };
  /** Who actually signed this report out, and when — the real,
   *  attributable act itself (CytologySignOutRecord's own
   *  responsibility to populate correctly). */
  signedBy: { name: string; isPathologist: boolean };
  signedAt: string;
}
