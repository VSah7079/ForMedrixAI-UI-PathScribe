// src/services/cytology/resolveCytologyAbnormalSeverity.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-132 (part of PS-105's Core Abnormal Detection Engine), item 2:
// "Bethesda screening: flag ASC-US, HSIL, LSIL, or malignant findings."
//
// Real, direct investigation confirmed before writing this (PS-132's
// own required first step): Bethesda classification is NOT free text
// in this app. A CytologyReviewRecord's primaryInterpretationId/
// additionalInterpretations already reference real, discrete
// CytologyCategoryEntry ids (the Bethesda dictionary,
// ICytologyCategoryService.ts) — the same discrete data model
// resolveCytologyReviewRequirement.ts (Phase 2) already reduces to a
// pathologist-review boolean. Each category already carries a real,
// admin-recorded suggestedAbnormalSeverity (this app's own
// AbnormalSeverity vocabulary — 'Abnormal' | 'Critical' | 'Malignant',
// services/abnormalDetection/) — LSIL → Abnormal, HSIL/ASC-H/
// AGC-favor-neoplastic/AIS → Critical, carcinoma → Malignant, ASC-US
// deliberately left unset (genuinely ambiguous at this app's own
// three-level granularity). This mapping was recorded but, per this
// module's own README ("Not consumed anywhere yet — this phase only
// records the mapping decision"), never actually reduced to a real
// flag for any review. This function is that missing reduction — the
// direct cytology equivalent of evaluateAbnormalTriggerRules.ts's own
// highestSeverityMatch() for PS-129's discrete synoptic triggers,
// reusing the exact same shared ranking (ABNORMAL_SEVERITY_RANK,
// IAbnormalTriggerRuleService.ts) rather than a second, cytology-only
// severity scale.
//
// Real, per direct guidance's own "the human makes the final call, we
// just offer the suggestion" posture already established for PS-129/
// PS-131: this is a pure, advisory signal, never itself a sign-out
// block — resolveCytologySignOutGate.ts's own requiresPathologistReview
// check (a real, independent, already-computed boolean) is what
// actually gates CT sign-out; this function's job is only to surface
// WHICH severity tier a flagged case falls into (e.g. for a future
// worklist badge or the unified sign-out review), not to decide
// whether review is required at all.
//
// The QC-rescreening half of PS-132 (item 3 — random + targeted
// mandatory rescreening) needed no new code: it's already fully built
// and wired (resolveCytologyRandomQcSelection.ts, PS-157's own
// two-tier random rate; resolveCytologyPendingMandatoryQc.ts, the
// real, separate 100%-of-high-risk mandatory targeted QC queue; the
// 3-tier Enterprise/Facility/Staff settings cascade,
// CytologyQcSettingsSection.tsx) — reusing that existing precedent
// rather than a third implementation, exactly as this ticket asked.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import { ABNORMAL_SEVERITY_RANK, type AbnormalSeverity } from '@/services/abnormalDetection/IAbnormalTriggerRuleService';

/**
 * Real, pure reduction over a review's own selected interpretation/
 * result category ids: returns the single highest-ranked
 * suggestedAbnormalSeverity among them, or undefined when none of the
 * selected categories carry one. Deliberately NOT the same "unknown id
 * defaults to the conservative case" safety rule
 * resolveCytologyReviewRequirement.ts uses for its own boolean gate —
 * that function's own, separate, already-computed
 * requiresPathologistReview is the real safety gate; this function is
 * a purely advisory severity signal layered on top of it, so an id
 * that doesn't resolve to any real, known category (or resolves to one
 * with no severity configured, e.g. ASC-US's own deliberate omission)
 * simply contributes no severity, rather than forcing a fabricated
 * worst-case tier.
 *
 * Real callers pass allCytologyInterpretationIds(review)
 * (types/cytology/CytologyReviewRecord.ts) for interpretationResultIds
 * — this function only ever cares about the flat set of selected ids,
 * not which one is primary, same convention
 * resolveCytologyReviewRequirement.ts already established.
 */
export function resolveCytologyAbnormalSeverity(
  interpretationResultIds: string[] | undefined,
  categories: CytologyCategoryEntry[],
): AbnormalSeverity | undefined {
  if (!interpretationResultIds || interpretationResultIds.length === 0) return undefined;
  const byId = new Map(categories.map(c => [c.id, c]));

  let best: AbnormalSeverity | undefined;
  for (const id of interpretationResultIds) {
    const severity = byId.get(id)?.suggestedAbnormalSeverity;
    if (!severity) continue;
    if (!best || ABNORMAL_SEVERITY_RANK[severity] > ABNORMAL_SEVERITY_RANK[best]) best = severity;
  }
  return best;
}
