// src/types/cytology/CytologyHighRiskFactors.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the structured clinical inputs a real,
// standard LIS High-Risk Patient Identification Algorithm evaluates —
// CLIA '88 § 493.1274 / CAP's real, mandated targeted rescreen of
// negative cases from patients at higher statistical risk of cervical
// neoplasia. Every field here corresponds to one of the given
// algorithm's own real, named criteria — not invented, not
// paraphrased into a different shape.
//
// Real, honest scoping: this is the real, complete TARGET shape for
// what accessioning-time data capture should eventually populate.
// Most of these fields have no real, existing data source in this app
// yet (HPV co-test results, immunosuppression status, DES exposure,
// clinical symptoms) — that capture UI is real, separate, later work,
// the same real "LMP + patient history dictionary" scope already
// deferred earlier in this module. One real exception:
// `priorAbnormalPapWithinLookback` CAN be resolved from data this app
// already has (this patient's own past CytologyReviewRecord history)
// — see resolvePriorAbnormalPapFactor.ts (services/cytology/) for that
// real, data-driven resolution, rather than requiring it as manual
// input like every other field here.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyHighRiskFactors {
  // ── 1. Prior Cytology & Histology History ──────────────────────────────
  /** Real, per direct guidance: prior ASC-US, ASC-H, LSIL, HSIL, AGC, or
   *  Malignancy diagnosis within the real, standard 3–5 year lookback
   *  window. See resolvePriorAbnormalPapFactor.ts — real, data-driven
   *  from this patient's own past CytologyReviewRecord history, not
   *  manual input. */
  priorAbnormalPapWithinLookback?: boolean;
  /** Real, per direct guidance: history of CIN 1/2/3, AIS, or a prior
   *  cervical procedure — LEEP, Cold Knife Conization, Cryotherapy. */
  priorCervicalProcedureOrBiopsy?: boolean;

  // ── 2. Molecular & Co-Testing Results ───────────────────────────────────
  /** Real, per direct guidance: hrHPV-positive result within the real,
   *  standard 12–36 month window. */
  recentHrHpvPositive?: boolean;
  /** Real, per direct guidance: a specific positive result for HPV 16
   *  or HPV 18/45 — the real, highest-risk genotypes. */
  hpvHighRiskGenotype?: boolean;

  // ── 3. High-Risk Medical History & Immunosuppression ────────────────────
  /** Real, per direct guidance: HIV/AIDS, solid organ transplant
   *  recipient, long-term immunosuppressive/biologic therapy, or SLE. */
  immunocompromised?: boolean;
  /** Real, per direct guidance: in utero DES (Diethylstilbestrol)
   *  exposure history. */
  inUteroDesExposure?: boolean;

  // ── 4. Clinical Symptoms & Indications ──────────────────────────────────
  /** Real, per direct guidance: post-coital bleeding, unexplained
   *  postmenopausal bleeding (PMB), or abnormal uterine bleeding (AUB)
   *  recorded on the requisition. */
  abnormalBleedingPattern?: boolean;
  /** Real, per direct guidance: a grossly visible cervical lesion,
   *  unexplained cervical mass, or persistent contact bleeding during
   *  specimen collection. */
  abnormalExamFindings?: boolean;
}
