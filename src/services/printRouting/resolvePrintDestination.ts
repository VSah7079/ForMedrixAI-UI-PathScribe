// src/services/printRouting/resolvePrintDestination.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-278 §2.1.1/§2.1.2. Pure, testable resolution — never
// fetches its own data, same real discipline as
// resolveDeliveryAction.ts/resolveCaseMaskScopeCandidates.ts. See
// types/printRouting/PrintRoutingRule.ts's own header for the full,
// real reasoning behind the deliberate hybrid this implements:
//
//   OUTER pass — a strict, ordered walk of the four real scope tiers,
//   most to least specific (PRINT_DESTINATION_SCOPE_PRECEDENCE below),
//   exactly as §2.1.2 names them. The FIRST tier with at least one
//   real, active, matching rule wins outright — a facility-level rule
//   is never even considered once a location-level rule already
//   matched, no scoring across tiers at all. Same real convention
//   resolveCaseMaskScopeCandidates.ts/TemplateRoutingService.ts's own
//   ordered passes already establish.
//
//   INNER pass — WITHIN that one winning tier, more than one real,
//   active rule can share the same scopeId (e.g. two rules at the
//   same workstation, one for FROZEN_SECTION cases and one with no
//   criteria at all, wildcard-everything). Real, most-specific-wins
//   scoring picks among those — same real convention
//   resolveDeliveryAction.ts's own criteria-count scoring already
//   establishes, applied here to exactly the two real, optional
//   §2.1.1 criteria this rule shape carries (specimenCaseType,
//   eventTriggerType). A rule specifying a criterion that doesn't
//   match this job's own real, resolved value disqualifies itself
//   entirely at this tier — it never falls back to being treated as a
//   less-specific match; the job simply isn't a candidate for that
//   one rule, though it may still match a different rule at the same
//   tier, or the resolver moves on to the next tier if none do.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrintDestination } from '@/types/printRouting/PrintDestination';
import type {
  EventTriggerType,
  PrintDestinationScopeType,
  PrintRoutingRule,
  SpecimenCaseType,
} from '@/types/printRouting/PrintRoutingRule';

/** Real, per §2.1.2's own literal "most to least specific" order —
 *  this array's own order IS the real precedence the resolver below
 *  walks. Changing this order would change what "more specific" means
 *  for every real site using this engine, so it's named and exported
 *  here rather than inlined, for one real, single source of truth. */
export const PRINT_DESTINATION_SCOPE_PRECEDENCE: readonly PrintDestinationScopeType[] = [
  'workstation',
  'location',
  'clientAccount',
  'facility',
];

export interface PrintDestinationResolutionInput {
  /** Real, per §2.1.2's own "User/Workstation override" — this app
   *  has no real, separate concept of "the workstation currently
   *  printing" distinct from "the user currently printing" (both are
   *  real, disclosed gaps at the automated dispatch layer — see
   *  resolveRealPrintRoutingContext.ts's own header). Either one, if
   *  a real caller has it, resolves the same real 'workstation' tier;
   *  workstationId is tried first when both are somehow present. */
  workstationId?: string;
  userId?: string;
  /** Real Location.pointOfCare value — same real field
   *  DeliveryRule.pointOfCare already resolves against. */
  pointOfCare?: string;
  /** Real ordering Facility id — same real field
   *  DeliveryRule.orderingFacilityId already resolves against. */
  orderingFacilityId?: string;
  /** Real performing-lab Facility id. */
  facilityId?: string;
  specimenCaseType?: SpecimenCaseType;
  eventTriggerType?: EventTriggerType;
}

export interface PrintDestinationResolutionResult {
  destination?: PrintDestination;
  matchedRuleId?: string;
  /** Real, honest trace — which real tier (if any) actually won, so a
   *  caller/UI can show why a given job resolved where it did, same
   *  real transparency posture TemplateRoutingService.ts's own
   *  traceReportTemplateResolution already establishes. Undefined
   *  when no real tier had a matching rule at all. */
  matchedScopeType?: PrintDestinationScopeType;
}

function scopeIdForTier(scopeType: PrintDestinationScopeType, input: PrintDestinationResolutionInput): string | undefined {
  switch (scopeType) {
    case 'workstation': return input.workstationId ?? input.userId;
    case 'location': return input.pointOfCare;
    case 'clientAccount': return input.orderingFacilityId;
    case 'facility': return input.facilityId;
  }
}

/** Real, per resolveDeliveryAction.ts's own identical convention —
 *  counts how many of the rule's own optional criteria are actually
 *  SET (not how many match; disqualifying rules are already filtered
 *  out before this is called), so a rule specifying both real
 *  criteria always outranks one specifying only one, which always
 *  outranks a wildcard-everything rule at the same tier. */
function criteriaSpecificity(rule: PrintRoutingRule): number {
  let score = 0;
  if (rule.specimenCaseType !== undefined) score++;
  if (rule.eventTriggerType !== undefined) score++;
  return score;
}

export function resolvePrintDestination(
  rules: PrintRoutingRule[],
  input: PrintDestinationResolutionInput,
): PrintDestinationResolutionResult {
  for (const scopeType of PRINT_DESTINATION_SCOPE_PRECEDENCE) {
    const scopeId = scopeIdForTier(scopeType, input);
    if (!scopeId) continue; // real caller has no real value at this tier at all — not a real candidate, try the next tier

    const candidates = rules.filter(rule =>
      rule.active &&
      rule.scopeType === scopeType &&
      rule.scopeId === scopeId &&
      (rule.specimenCaseType === undefined || rule.specimenCaseType === input.specimenCaseType) &&
      (rule.eventTriggerType === undefined || rule.eventTriggerType === input.eventTriggerType),
    );
    if (candidates.length === 0) continue; // no real, active, matching rule at this tier — fall through to the next, less specific one

    const winner = [...candidates].sort((a, b) => criteriaSpecificity(b) - criteriaSpecificity(a))[0];
    return { destination: winner.printDestination, matchedRuleId: winner.id, matchedScopeType: scopeType };
  }

  return {};
}
