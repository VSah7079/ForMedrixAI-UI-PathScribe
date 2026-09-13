// src/services/cytology/resolveCytologyPrimaryHpvFailsafeAuditReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied UK-QA-01 specification
// ("Primary HPV Screening with Cytology Triage Diagnostic Yield &
// Failsafe Audit" — real regulatory driver: NHS Cervical Screening
// Programme, NHSCSP Document 20 / Public Health England).
//
// Real, buildable directly from data this app already captures, per
// real UK jurisdiction (GB_EW, GB_SCT, GB_NIR — the real, established
// set this module already uses for CSMS/BSCC work; there is no
// separate GB_WLS, since England and Wales share one real jurisdiction
// code here): HPV positivity from the existing hpvResult field,
// cytology triage performed from whether a real primary_screen review
// exists, and inadequate cytology rate from the same real adequacy
// data every other report in this module already uses.
//
// Real, honest gap, stated directly rather than fabricated: no
// tracking mechanism exists anywhere in this app for "a positive
// result required action" (a real colposcopy referral) or whether
// that action was actually taken or went unanswered — Failsafe_Direct_
// Colposcopy_Referrals and Non-Responded_Failsafe_Alerts are both
// genuinely `undefined` here, not a fabricated zero. Building that
// tracking is real, separate, larger infrastructure work.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyPrimaryHpvFailsafeSpecimenInput {
  jurisdiction: string;
  hpvPositive: boolean;
  /** Real, per this report's own definition: true when a real
   *  primary_screen review exists for this specimen, following a real
   *  positive HPV result. */
  cytologyTriagePerformed: boolean;
  /** Real, per this module's own established adequacy convention —
   *  only meaningful when cytologyTriagePerformed is true. */
  cytologyTriageInadequate: boolean;
}

export interface CytologyPrimaryHpvFailsafeAuditRow {
  jurisdiction: string;
  totalHpvPrimaryPositives: number;
  cytologyTriagePerformedCount: number;
  /** Real, honest 0 when no real triage has been performed yet — a
   *  genuine "nothing to report a rate on," not a data gap. */
  inadequateCytologyRatePercent: number;
  /** Real, honest undefined — see this file's own header. */
  failsafeDirectColposcopyReferrals: undefined;
  nonRespondedFailsafeAlerts: undefined;
}

export function resolveCytologyPrimaryHpvFailsafeAuditReport(
  specimens: CytologyPrimaryHpvFailsafeSpecimenInput[],
): CytologyPrimaryHpvFailsafeAuditRow[] {
  const byJurisdiction = new Map<string, CytologyPrimaryHpvFailsafeSpecimenInput[]>();
  for (const sp of specimens) {
    const list = byJurisdiction.get(sp.jurisdiction) ?? [];
    list.push(sp);
    byJurisdiction.set(sp.jurisdiction, list);
  }

  return Array.from(byJurisdiction.entries()).map(([jurisdiction, group]) => {
    const totalHpvPrimaryPositives = group.filter(sp => sp.hpvPositive).length;
    const triaged = group.filter(sp => sp.cytologyTriagePerformed);
    const cytologyTriagePerformedCount = triaged.length;
    const inadequateCount = triaged.filter(sp => sp.cytologyTriageInadequate).length;
    const inadequateCytologyRatePercent = cytologyTriagePerformedCount === 0 ? 0 : (inadequateCount / cytologyTriagePerformedCount) * 100;

    return {
      jurisdiction,
      totalHpvPrimaryPositives,
      cytologyTriagePerformedCount,
      inadequateCytologyRatePercent,
      failsafeDirectColposcopyReferrals: undefined,
      nonRespondedFailsafeAlerts: undefined,
    };
  });
}
