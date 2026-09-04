// src/components/Config/AI/resolveClientAiModel.ts
// ─────────────────────────────────────────────────────────────
// Real source of truth for "which AI model version does this client's
// work actually get drafted with," and the hard-block gate on ever
// changing that.
//
// Same two-layer "null/unset = inherit" shape already proven for
// orchestratorModeConfig.ts:
//   1. ORG DEFAULT   — modelService.getDefault() (the model flagged
//      isDefault: true in the Models admin screen).
//   2. PER-LAB OVERRIDE — Client.internalAiModelId on the internal
//      client that actually performs the work (resolved via
//      resolvePerformingLabFacilityId(), same as every other lab-scoped
//      setting). Wins over the org default when set.
//
// The real difference from orchestrator mode: that override can be set
// freely by an admin. This one cannot. Per direct product decision,
// Client.internalAiModelId may only be set to a model this exact
// client has a `reported`, PASS-graded ValidationStudy for — an
// absolute block, no soft-warning path, since an accidental or
// unvalidated model change on a live clinical account is a real
// liability concern, not just a UX one. hasPassingValidationForModel()
// below is that check; every UI that lets an admin change this field
// must call it before allowing the change, not just before saving.
// ─────────────────────────────────────────────────────────────

import { facilityService, modelService } from '../../../services';
import { mockValidationStudyService as validationStudyService } from '../../../services/validationStudies/mockValidationStudyService';
import { resolvePerformingLabFacilityId } from '../../../services/facilities/IFacilityService';
import type { AiProviderConfig } from './aiProviderConfig';

/**
 * The actual hard-block check: does this exact (clientId, modelId) pair
 * have a completed, PASS-graded validation study behind it? Checks
 * study.clientIds (a study can be scoped to more than one client) and
 * study.status === 'reported' with finalGrade === 'PASS' specifically —
 * a study that's merely 'closed' (data collection ended, report not
 * yet generated) does NOT count, since finalGrade is only ever set at
 * report-generation time. See IValidationStudyService.ts's own comment
 * on why that's a persisted, one-time fact rather than a live
 * recomputation.
 */
export async function hasPassingValidationForModel(clientId: string, modelId: string): Promise<boolean> {
  const res = await validationStudyService.getAll();
  if (!res.ok) return false;
  return res.data.some(s =>
    s.modelId === modelId &&
    s.status === 'reported' &&
    s.finalGrade === 'PASS' &&
    s.clientIds.includes(clientId)
  );
}

/**
 * Every model this exact client currently has a passing, reported
 * validation study for — the real, enforced list an admin is allowed
 * to choose from when setting Client.internalAiModelId. Not "every
 * model in the system," deliberately: showing a model here that this
 * client hasn't actually validated would just move the accidental-
 * override risk from "can select it" to "can see it and be tempted to
 * ask for it anyway."
 */
export async function getEligibleModelIdsForClient(clientId: string): Promise<string[]> {
  const res = await validationStudyService.getAll();
  if (!res.ok) return [];
  const passing = res.data.filter(s =>
    s.status === 'reported' && s.finalGrade === 'PASS' && s.clientIds.includes(clientId)
  );
  return Array.from(new Set(passing.map(s => s.modelId)));
}

/**
 * Effective, per-case resolution (async — needs a Facility lookup and the
 * org default model). Pass the case's ordering facility id
 * (caseData?.order?.facilityId). Resolves through to whichever facility's
 * lab actually performs the work, same as resolveOrchestratorMode().
 * Falls back to the org default whenever no facility/model can be
 * resolved — same fail-safe posture used everywhere else in this
 * codebase.
 */
export async function resolveClientAiModelId(orderingFacilityId?: string): Promise<string | null> {
  const defaultRes = await modelService.getDefault();
  const orgDefault = defaultRes.ok ? (defaultRes.data?.id ?? null) : null;
  if (!orderingFacilityId) return orgDefault;

  const orderingRes = await facilityService.getById(orderingFacilityId);
  if (!orderingRes.ok) return orgDefault;

  const labId = resolvePerformingLabFacilityId(orderingRes.data);
  if (!labId) return orgDefault;

  if (labId === orderingFacilityId) {
    return orderingRes.data.internalAiModelId ?? orgDefault;
  }
  const labRes = await facilityService.getById(labId);
  if (!labRes.ok) return orgDefault;
  return labRes.data.internalAiModelId ?? orgDefault;
}

/**
 * The real fix that makes any of the above actually matter: turns
 * "which model is this client on" into the literal request-shape
 * override callAi() needs to call the correct vendor. Previously,
 * Client.internalAiModelId and everything built on it was a pure
 * tracking/governance layer with no connection at all to what the app
 * actually called — this function is that connection.
 *
 * Returns {} (a no-op override) rather than throwing whenever
 * resolution can't complete for any reason — a missing/misconfigured
 * client-model link should fail safe to the existing org-wide .env
 * default (the same fallback callAi() already has), never block a
 * real AI call outright.
 */
export async function resolveAiConfigOverrideForClient(orderingClientId?: string): Promise<Partial<AiProviderConfig>> {
  const modelId = await resolveClientAiModelId(orderingClientId);
  if (!modelId) return {};
  const modelRes = await modelService.getById(modelId);
  if (!modelRes.ok) return {};
  return { providerId: modelRes.data.requestFormat, modelId: modelRes.data.apiModelId };
}
