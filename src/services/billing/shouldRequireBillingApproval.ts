// src/services/billing/shouldRequireBillingApproval.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Feature Specification refinement
// (Pathology Billing Rules Engine & Audit Logging, "Opt-in Core"):
// resolved once per real charge at creation
// (recordChargeTransaction/recordCreditTransaction,
// SynopticReportPage.tsx; correctServiceCharge.ts), against the
// case's own real performing lab's configured
// Facility.requireBillingApproval.
//
// Deliberately a pure function taking the real flag directly, not
// resolving the facility itself - same "resolve async/real data at
// the call site, pass already-resolved data into the pure function"
// posture as shouldRandomlySampleForCodeReview.ts/
// resolveBillingDateOfService elsewhere in this app.
// ─────────────────────────────────────────────────────────────────────────────

import { facilityService } from '@/services';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';

/** Real, per direct guidance - true only when the performing lab's
 *  own requireBillingApproval flag is explicitly true. Undefined/false
 *  (the real, default state) means a new charge is created exactly as
 *  it always has been - no approvalStatus at all, treated by
 *  getEffectiveChargeStatus (mockServiceChargeService.ts) as
 *  already-cleared. Same "absence means off" convention
 *  Facility.requireBillingApproval's own doc comment describes. */
export function shouldRequireBillingApproval(requireBillingApproval: boolean | null | undefined): boolean {
  return requireBillingApproval === true;
}

/** Real, per direct guidance's own established resolution pattern
 *  (useSignOutWorkflow.ts's own random-sampling resolution) - resolves
 *  the real performing lab for a given case's own originHospitalId,
 *  then this pure function's own real check against that lab's
 *  configured requireBillingApproval. Returns false (the real,
 *  default, "absence means off" state) whenever any real step along
 *  the way can't resolve - no origin hospital linked yet, no real
 *  performing lab configured, or the facility lookup itself fails -
 *  never a fabricated true. */
export async function resolveRequireBillingApprovalForCase(originHospitalId: string | undefined): Promise<boolean> {
  if (!originHospitalId) return false;
  const orderingRes = await facilityService.getById(originHospitalId);
  if (!orderingRes.ok) return false;
  const labId = resolvePerformingLabFacilityId(orderingRes.data);
  if (!labId) return false;
  const labRes = labId === originHospitalId ? orderingRes : await facilityService.getById(labId);
  if (!labRes.ok) return false;
  return shouldRequireBillingApproval(labRes.data.requireBillingApproval);
}
