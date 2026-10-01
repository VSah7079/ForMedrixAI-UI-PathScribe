// src/components/Config/AI/orchestratorModeConfig.ts
// ─────────────────────────────────────────────────────────────
// Real source of truth for "is AI Orchestrator narrative auto-draft on."
//
// Two layers, same "null/unset = inherit" convention used throughout:
//   1. ORG DEFAULT   — org-wide, admin-editable here, persisted to
//      localStorage. Falls back to narrativeTemplateConfig.orchestratorEnabled
//      only if never explicitly set (fresh install).
//   2. PER-LAB OVERRIDE — Facility.internalAiOrchestratorEnabled on the
//      facility that actually performs the work (resolved via
//      resolvePerformingLabFacilityId(), same as every other lab-scoped
//      setting). Wins over the org default when set.
//
// Real feature, per direct confirmation: "AI configuration should be
// gated exclusively by the performing_lab role" — only meaningful on a
// facility whose roles include 'performing_lab'; resolvePerformingLabFacilityId()
// only ever resolves to such a facility (see its own doc comment), so no
// separate role check is needed here beyond that resolution itself.
//
// Deliberately distinct from the Orchestration *case-routing* concept
// (O26-/S26- prefixes, CaseRouter.ts, StaffUser.canViewOrchestration) — see
// Facility.internalAiOrchestratorEnabled's own doc comment.
// ─────────────────────────────────────────────────────────────

import { narrativeTemplateConfig } from '../NarrativeTemplates/narrativeTemplateConfig';
import { facilityService } from '../../../services';
import { resolvePerformingLabFacilityId } from '../../../services/facilities/IFacilityService';

const ORG_ORCHESTRATOR_MODE_KEY = 'pathscribe_orchestrator_mode';

// ── Org-level default (sync — safe to call from render) ────────────────────

export function getOrgOrchestratorDefault(): boolean {
  try {
    const stored = localStorage.getItem(ORG_ORCHESTRATOR_MODE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // localStorage unavailable (SSR / sandboxed env) — ignore
  }
  return narrativeTemplateConfig.orchestratorEnabled;
}

export function setOrgOrchestratorDefault(enabled: boolean): void {
  try {
    localStorage.setItem(ORG_ORCHESTRATOR_MODE_KEY, String(enabled));
  } catch {
    // ignore write failures
  }
}

// ── Effective, per-case resolution (async — needs a Facility lookup) ───────
//
// Pass the case's ordering facility id (caseData?.order?.facilityId).
// Resolves through to whichever facility's lab actually performs the
// work, same as jurisdiction resolution in OrchestratorSectionEditor.tsx.
// Falls back to the org default whenever no facility can be resolved
// (missing id, lookup failure, or no override set on the performing lab)
// — same fail-safe posture used everywhere else in this codebase.
export async function resolveOrchestratorMode(orderingFacilityId?: string): Promise<boolean> {
  const orgDefault = getOrgOrchestratorDefault();
  if (!orderingFacilityId) return orgDefault;

  const orderingRes = await facilityService.getById(orderingFacilityId);
  if (!orderingRes.ok) return orgDefault;

  const labId = resolvePerformingLabFacilityId(orderingRes.data);
  if (!labId) return orgDefault;

  if (labId === orderingFacilityId) {
    return orderingRes.data.internalAiOrchestratorEnabled ?? orgDefault;
  }
  const labRes = await facilityService.getById(labId);
  if (!labRes.ok) return orgDefault;
  return labRes.data.internalAiOrchestratorEnabled ?? orgDefault;
}
