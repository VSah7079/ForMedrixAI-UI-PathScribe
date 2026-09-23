// src/services/auth/resolveCaseAccessGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// File-by-file cleanup sweep: consolidates the two-check "can this session
// actually open this case's report" sequence (Orchestration access, then
// Pediatric access if the case has a facility) that had been independently
// duplicated in two real places — src/loaders/synopticLoader.ts (the real
// enforcement point for /synoptic/:caseId) and FullReportPage.tsx's own
// useEffect (the same real enforcement for /report/:caseId). Both files'
// own comments already said as much ("this is now the single, real
// enforcement point" / "this is the second of the two real case-view entry
// points that needed the same real enforcement") — this makes that
// literally true by having both call the same function instead of two
// independently-maintained copies of it.
//
// This composes resolveOrchestrationAccess/resolvePediatricAccess
// (caseAccessControl.ts) with the real async facility lookup those pediatric
// checks depend on; it does not change either decision's own real logic.
// ─────────────────────────────────────────────────────────────────────────────
import { facilityService } from '@/services';
import { resolveOrchestrationAccess, resolvePediatricAccess, type SessionUser } from './caseAccessControl';

// Real, per this project's own tsconfig (strict: false, strictNullChecks:
// false): a discriminated union that only carries reason/detail on the
// "denied" branch does not reliably narrow under these settings (confirmed
// directly — TS2339 at every call site). So, matching the same "give every
// branch the same fields" shape SensitiveAccessDecision (caseAccessControl.ts)
// already uses for exactly this reason, this is one flat result shape
// rather than a narrowing-dependent union — reason/detail are simply null
// when access is granted.
export interface CaseAccessGateResult {
  granted: boolean;
  reason: 'orchestration' | 'pediatric' | null;
  detail: string | null;
}

export async function resolveCaseAccessGate(
  session: SessionUser | null,
  caseData: { reportingMode?: string | null; order?: { facilityId?: string | null } | null; patient?: { dateOfBirth?: string | null } | null } | null | undefined,
): Promise<CaseAccessGateResult> {
  const orchDecision = resolveOrchestrationAccess(session, caseData);
  if (!orchDecision.granted) {
    return { granted: false, reason: 'orchestration', detail: orchDecision.reason };
  }

  const facilityId = caseData?.order?.facilityId;
  if (facilityId) {
    const facilityRes = await facilityService.getById(facilityId).catch(() => undefined);
    const facility = facilityRes?.ok ? facilityRes.data : null;
    const pedDecision = resolvePediatricAccess(session, caseData, facility);
    if (!pedDecision.granted) {
      return { granted: false, reason: 'pediatric', detail: pedDecision.reason };
    }
  }

  return { granted: true, reason: null, detail: null };
}
