// src/types/cytology/CytologyRoseEvaluation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Step 4 ask: "ROSE / Bedside
// Evaluations Queue: Active/recent Rapid On-Site Evaluation tracking
// linked to the rose_discrepancy QC engine trigger." Confirmed before
// building: no data model existed anywhere in this app for tracking a
// real ROSE event itself — only the QC engine's own downstream
// trigger (services/cytologyQc/resolveNewQcCaseAssignment.ts's
// resolveNewQcCaseAssignmentFromRoseDiscrepancy) existed, which
// assumes a real discrepancy has already been detected elsewhere.
// This is that "elsewhere" — the real, new event record, plus the
// real, pure discrepancy-detection logic in
// resolveCytologyRoseDiscrepancy.ts that decides when to actually
// call that existing trigger.
//
// Real, deliberate scope: a ROSE session can involve multiple real
// needle passes, each independently assessed for adequacy — a
// radiologist/proceduralist genuinely needs to know per-pass, not
// just an overall session verdict, whether to take another pass.
// ─────────────────────────────────────────────────────────────────────────────

export type CytologyRoseLocation = 'radiology' | 'clinic' | 'operating_room' | 'other';
export type CytologyRoseAdequacyAssessment = 'adequate' | 'inadequate' | 'indeterminate';

export interface CytologyRosePass {
  passNumber: number;
  adequacyAssessment: CytologyRoseAdequacyAssessment;
  /** Real, free-text preliminary impression (e.g. "Suspicious for
   *  malignancy," "Benign, consistent with colloid nodule") — this
   *  app has no structured, at-the-bedside diagnostic category
   *  dictionary for ROSE to reference instead; a real, separate
   *  follow-up if one is wanted later. */
  preliminaryImpression?: string;
}

export interface CytologyRoseEvaluation {
  id: string;
  performedAt: string;
  performedBy: { userId: string; userName: string };
  location: CytologyRoseLocation;
  /** Real, per this file's own header — one or more real, independent
   *  per-pass assessments within this one real ROSE session. */
  passes: CytologyRosePass[];
  /** Real, per direct guidance's own explicit link ("linked to the
   *  rose_discrepancy QC engine trigger") — set once a real, matching
   *  QcCaseAssignment (triggerSource: 'rose_discrepancy') has
   *  genuinely been created for this evaluation. Undefined until a
   *  real discrepancy is actually detected — never assumed absent
   *  just because this field hasn't been checked yet. */
  qcCaseAssignmentId?: string;
}
