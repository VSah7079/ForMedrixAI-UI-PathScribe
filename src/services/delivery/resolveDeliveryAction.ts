// src/services/delivery/resolveDeliveryAction.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct spec (Section 3 — Delivery Configuration Rules
// Engine): "A configurable rules engine evaluates client/provider
// preferences at event runtime." Pure, testable resolution — never
// fetches its own data; the caller (dispatchDeliveryDecision.ts)
// resolves the real, live criteria values first.
//
// Real, most-specific-wins scoring, same real precedence convention
// as TemplateRoutingService.ts's own facility/physician passes and
// RoutingRule.performingLabFacilityId's own Global-vs-scoped rule: a
// rule disqualifies itself the moment ANY criterion it specifies
// doesn't match the real input — an unspecified criterion on the rule
// is a wildcard, neither disqualifying nor scoring. Among the
// remaining, real, qualifying rules, the one matching the most real
// criteria wins; ties broken by whichever was updated more recently
// (the admin's own most recent, deliberate intent).
// ─────────────────────────────────────────────────────────────────────────────

import type { DeliveryRule, DeliveryAction } from '@/types/delivery/DeliveryRule';

export interface DeliveryDecisionInput {
  providerId?: string;
  orderingFacilityId?: string;
  pointOfCare?: string;
  reportType?: 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'ADDENDUM';
}

export interface DeliveryDecisionResult {
  action: DeliveryAction;
  /** Real, honest trace — which real rule (if any) actually won, so a
   *  caller/UI can show why a given case's delivery was decided this
   *  way, same real transparency posture as
   *  TemplateRoutingService.ts's own traceReportTemplateResolution. */
  matchedRuleId?: string;
}

/** Real, per the source spec's own stated default ("Electronic
 *  Dispatch Only (Default for EHR-integrated providers)") — applied
 *  only when no real, active rule qualifies at all, never silently
 *  substituted for a real rule's own decision. */
const DEFAULT_ACTION: DeliveryAction = 'ELECTRONIC_ONLY';

export function resolveDeliveryAction(input: DeliveryDecisionInput, rules: DeliveryRule[]): DeliveryDecisionResult {
  let best: { rule: DeliveryRule; score: number } | null = null;

  for (const rule of rules) {
    if (!rule.active) continue;

    let score = 0;
    let disqualified = false;

    const checks: [string | undefined, string | undefined][] = [
      [rule.providerId, input.providerId],
      [rule.orderingFacilityId, input.orderingFacilityId],
      [rule.pointOfCare, input.pointOfCare],
      [rule.reportType, input.reportType],
    ];
    for (const [ruleValue, inputValue] of checks) {
      if (ruleValue === undefined) continue; // wildcard — neutral
      if (ruleValue !== inputValue) { disqualified = true; break; }
      score++;
    }
    if (disqualified) continue;

    if (!best || score > best.score || (score === best.score && rule.updatedAt > best.rule.updatedAt)) {
      best = { rule, score };
    }
  }

  if (!best) return { action: DEFAULT_ACTION };
  return { action: best.rule.action, matchedRuleId: best.rule.id };
}
