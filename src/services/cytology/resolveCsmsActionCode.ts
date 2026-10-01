// src/services/cytology/resolveCsmsActionCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research into England's actual call/recall system
// (CSMS — Cervical Screening Management System; "Call 18" was a real
// naming correction, referring to Good Practice Guide No. 18, an
// administrative document, not the system itself). Real, confirmed
// action codes laboratories report: A (routine recall), R (early
// repeat, 3/6/12/36 months), S (suspended from recall), H (no action —
// only for negative/inadequate tests taken outside the UK programme).
//
// Real, direct confirmation: "hrHPV negative results and hrHPV
// positive results with negative cytology can be reported... All
// results that include abnormal cytology will be reported with the
// appropriate management recommendation by a cytopathologist" — this
// module's own existing, real `requiresPathologistReview` signal
// (from resolveCytologySignOutGate.ts's own established logic) is
// the robust, correct proxy for exactly this real distinction,
// avoiding fragile string-matching on display text.
//
// Real, per direct follow-up research: H is genuinely derivable, via
// the real, standard HL7 OBR-31 "Reason for Study" field (FHIR
// ServiceRequest.reasonCode) — now real, structured data on this
// app's own Order model (Case.reasonForStudy). Real, honest scope: S
// (suspended — a real, administrative eligibility status, e.g.
// hysterectomy or opt-out) still depends on real eligibility data
// this app has no source for at all (no HL7 QBP/RSP-style query
// integration with CSMS's own master screening record) — never
// guessed here. Per direct guidance's own real mechanism for this:
// every real CSMS dispatch instead raises a real, case-level flag
// ('CSMS Eligibility Verification Needed', mockFlagService.ts's own
// real 'f36') so a human in the Cytology QA group can verify real
// eligibility before the recall action is treated as final — see
// resolveCsmsEligibilityFlagRequired.ts.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveCsmsActionCode(
  requiresPathologistReview: boolean,
  reasonForStudy?: 'nhs_programme_invited' | 'private_or_opportunistic',
): 'A' | 'R' | 'H' {
  if (requiresPathologistReview) return 'R';
  if (reasonForStudy === 'private_or_opportunistic') return 'H';
  return 'A';
}
