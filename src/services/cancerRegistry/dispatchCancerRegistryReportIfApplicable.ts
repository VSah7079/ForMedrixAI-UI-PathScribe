// src/services/cancerRegistry/dispatchCancerRegistryReportIfApplicable.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports
// gap — the real trigger function, called from a real SURGICAL
// PATHOLOGY case sign-out (useSignOutWorkflow.ts's own
// handleSignOutConfirm) and ONLY from there, per
// FHIR_DISPATCH_ARCHITECTURE_PLAN.md's own already-settled, critical
// finding: this must never be triggered from cytology sign-out.
//
// Resolves the facility's own effective registry settings (Tier 1
// enterprise default + Tier 2 facility override, same real cascade
// shape as cytology's own registry settings), and — only when a real
// registry is actually configured — checks each specimen's own real
// ICD-O finding for reportability (resolveCancerRegistryReportability.ts)
// before enqueueing. Fire-and-forget: a real dispatch-side failure
// must never block the case's own, already-successful sign-out.
// ─────────────────────────────────────────────────────────────────────────────

import { mockCancerRegistrySettingsService } from './mockCancerRegistrySettingsService';
import { mockFacilityCancerRegistryOverrideService } from './mockFacilityCancerRegistryOverrideService';
import { resolveEffectiveCancerRegistrySettings } from './resolveEffectiveCancerRegistrySettings';
import { resolveCancerRegistryReportability } from './resolveCancerRegistryReportability';
import { buildCancerRegistryReportPayload } from './buildCancerRegistryReportPayload';
import { mockCancerRegistryOutboundQueueService } from './mockCancerRegistryOutboundQueueService';
import type { Case } from '@/types/case/Case';

export interface DispatchCancerRegistryReportResult {
  dispatched: boolean;
  reason: string;
}

export async function dispatchCancerRegistryReportIfApplicable(
  caseData: Case,
  facilityId: string,
  facilityName: string | undefined,
): Promise<DispatchCancerRegistryReportResult> {
  const [enterpriseRes, overrideRes] = await Promise.all([
    mockCancerRegistrySettingsService.get(),
    mockFacilityCancerRegistryOverrideService.getForFacility(facilityId),
  ]);
  if (!enterpriseRes.ok) return { dispatched: false, reason: 'Could not resolve enterprise cancer registry settings.' };

  const effective = resolveEffectiveCancerRegistrySettings(enterpriseRes.data, overrideRes.ok ? overrideRes.data : null);
  if (effective.registryId === 'none') {
    return { dispatched: false, reason: 'No cancer registry configured for this facility.' };
  }

  // Real, per resolveCancerRegistryReportability.ts's own contract —
  // checked per real, individual ICD-O finding on the case, since a
  // multi-specimen case can genuinely carry a mix of reportable and
  // non-reportable findings (e.g. one specimen's invasive carcinoma
  // alongside another's benign polyp).
  let anyReportable = false;
  for (const specimen of caseData.specimens ?? []) {
    for (const icdO of specimen.coding?.icdO ?? []) {
      const reportability = resolveCancerRegistryReportability(icdO.code, undefined, caseData.diagnostic?.primaryDiagnosis ?? '');
      if (reportability.outcome === 'reportable') { anyReportable = true; break; }
    }
    if (anyReportable) break;
  }

  if (!anyReportable) {
    return { dispatched: false, reason: 'No reportable ICD-O finding on this case.' };
  }

  const payload = buildCancerRegistryReportPayload(caseData, effective.registryId, facilityId, facilityName);
  await mockCancerRegistryOutboundQueueService.enqueue({ caseId: caseData.id, registryId: effective.registryId });
  return { dispatched: true, reason: `Enqueued for ${effective.registryId} (message ${payload.messageId}).` };
}
