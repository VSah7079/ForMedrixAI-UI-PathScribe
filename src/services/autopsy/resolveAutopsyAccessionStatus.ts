// src/services/autopsy/resolveAutopsyAccessionStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "temporary accession"
// need — now that Case.autopsy exists (Case.ts), a real case can be
// created the moment a body is received, with only the bare minimum
// on record (jurisdiction, caseAuthority, and — for a real forensic
// case — a logged verbal order). This function is the real, pure
// status read on that: never a gate, never blocking anything (intake
// itself is never blocked — only resolveAutopsyGrossExaminationGate.ts's
// own real gross-exam gate is), just an honest answer to "is this
// still a provisional, temporary accession, or has full authorization
// actually been logged."
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

export type AutopsyAccessionStatus = 'temporary' | 'fully_authorized';

/** Real, per direct guidance's own confirmed design. 'temporary' means
 *  the real case exists (a body has genuinely been received) but the
 *  real authorization this case's own gross-exam gate requires isn't
 *  on file yet — a real verbal-only forensic order, or no real
 *  hospital consent logged yet. 'fully_authorized' means the exact
 *  same real requirement resolveAutopsyGrossExaminationGate.ts checks
 *  is already satisfied — deliberately the same real criteria, never
 *  a second, separate definition of "authorized" that could drift
 *  from the actual gate's own. */
export function resolveAutopsyAccessionStatus(caseDetails: AutopsyCaseDetails): AutopsyAccessionStatus {
  if (caseDetails.caseAuthority === 'medicolegal_forensic') {
    const auth = caseDetails.forensicAuthorization;
    const hasWrittenOrder = Boolean(auth?.orderReference && auth.orderReference.trim().length > 0 && auth?.orderDate);
    return hasWrittenOrder ? 'fully_authorized' : 'temporary';
  }
  const consent = caseDetails.hospitalConsent;
  const hasActiveConsent = Boolean(consent?.consentGivenAt) && !consent?.revokedOrNarrowedAt;
  return hasActiveConsent ? 'fully_authorized' : 'temporary';
}
