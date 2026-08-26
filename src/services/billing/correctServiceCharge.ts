// src/services/billing/correctServiceCharge.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction: no business logic in UI code. This
// exact "find the original charge, reverse it with a credit, build and
// save a new corrected charge" sequence previously lived inline inside
// QualityAssurancePage.tsx's own handleResolveBillingDeficiency - real
// financial orchestration that belongs in the services layer, not a
// page component. Extracted here so every real call site (the QA
// CODE_CORRECTED resolution path, and BillingReviewPanel's own
// "Correct code" action on an already-applied code) shares the exact
// same real logic rather than each re-implementing it slightly
// differently.
//
// Deliberately still returns both the credit and the corrected charge
// (rather than void) so a caller can build its own, context-specific
// audit log entry (different wording for a QA resolution vs. a direct
// billing-panel correction) without this function needing to know
// anything about audit logging itself.
// ─────────────────────────────────────────────────────────────────────────────

import { mockServiceChargeService } from './mockServiceChargeService';
import { reverseServiceCharge, buildCorrectedServiceCharge } from './resolveServiceCharge';
import type { PostSignoutChangeContext } from './resolveServiceCharge';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import { resolveRequireBillingApprovalForCase } from './shouldRequireBillingApproval';
import { caseRouter } from '@/services/cases/CaseRouter';

export interface ServiceChargeCorrectionResult {
  original: ServiceChargeRecord;
  credit: ServiceChargeRecord;
  corrected: ServiceChargeRecord;
}

/** Real, per direct guidance's own established "credit the old, charge
 *  the new, all must be audited" pattern. Returns a real, honest error
 *  (never throws, never silently no-ops) when the original charge
 *  genuinely can't be found - a caller deciding what to do about a
 *  missing charge record is a real, per-context UI decision, not
 *  something this function should assume. */
export async function correctServiceCharge(
  caseId: string,
  originalChargeId: string,
  correctedCptCode: string,
  correctedBy: string,
  postSignoutContext?: PostSignoutChangeContext
): Promise<{ ok: true; data: ServiceChargeCorrectionResult } | { ok: false; error: string }> {
  const chargesRes = await mockServiceChargeService.getChargesForCase(caseId);
  if (chargesRes.ok === false) {
    const chargesError: string = chargesRes.error;
    return { ok: false, error: chargesError };
  }

  const original = chargesRes.data.find(c => c.id === originalChargeId);
  if (!original) return { ok: false, error: `No real charge record found with id ${originalChargeId} on case ${caseId}` };

  // Real, per direct guidance's own Feature Specification refinement
  // ("Opt-in Core"): same real gate as
  // recordChargeTransaction/recordCreditTransaction
  // (SynopticReportPage.tsx) - preserves today's exact behavior
  // unless the performing lab has explicitly opted in.
  const caseData = await caseRouter.getCase(caseId);
  const requiresApproval = await resolveRequireBillingApprovalForCase(caseData?.originHospitalId);

  const credit = reverseServiceCharge(original, correctedBy, undefined, postSignoutContext);
  if (requiresApproval) {
    credit.approvalStatus = 'DRAFT';
    credit.draftedBy = correctedBy;
    credit.draftedAt = new Date().toISOString();
  }
  await mockServiceChargeService.saveCharge(credit);

  const corrected = buildCorrectedServiceCharge(original, correctedCptCode, correctedBy, undefined, postSignoutContext);
  if (requiresApproval) {
    corrected.approvalStatus = 'DRAFT';
    corrected.draftedBy = correctedBy;
    corrected.draftedAt = new Date().toISOString();
  }
  await mockServiceChargeService.saveCharge(corrected);

  return { ok: true, data: { original, credit, corrected } };
}
