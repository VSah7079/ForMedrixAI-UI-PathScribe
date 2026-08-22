// src/utils/evaluateCassetteRouting.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the "Cassette Colors Basic
// Routing Algorithm Flow" spec — this is step 2, "Color/Type
// Determination." Deliberately stops here: step 3 ("Hopper Selection
// Query") and step 4 ("Command Transmission") are the real, separate
// Engine layer per direct confirmation of the two-layer architecture
// — PathScribe never touches hopper state, inventory, or hardware
// telemetry. This function's own output is exactly "the necessary
// data that will allow the engine to route the... request to the
// correct hopper" and, per the same follow-up, "a mechanism to
// reroute if a hopper was inactive": a real primary color AND a real
// fallback color/behavior, both resolved and included in one payload
// — the Engine decides IF a reroute is needed (real-time hopper
// state is its own concern), but never has to ask PathScribe what
// the fallback should be, since it's already in hand.
// ─────────────────────────────────────────────────────────────────────────────

import type { CassetteRoutingRule, CassetteRuleOrderPriority } from '@/services/cassetteRouting/ICassetteRoutingRuleService';
import type { CassetteColorDefinition, CassetteColorFallbackBehavior } from '@/services/cassetteColors/ICassetteColorService';
import type { Protocol } from '@/services/protocols/IProtocolService';
import type { DecantType } from '@/types/case/Material';

export interface CassetteRoutingContext {
  protocolId?: string;
  priority?: CassetteRuleOrderPriority;
  originStationId?: string;
  orderingFacilityId?: string;
  caseType?: string;
  /** Real, singular counterpart to CassetteRoutingConditions.decantType
   *  above — set only when the specific item being routed is a real
   *  Decant (types/case/Material.ts), never for an ordinary
   *  HistologyBlock. Undefined here correctly never matches a rule
   *  whose own condition requires a specific decantType — an
   *  ordinary tissue block is not a cell block by omission, not by
   *  an empty-string/placeholder value. */
  decantType?: DecantType;
}

/** The real, minimal shape of a resolved color the Engine actually
 *  needs — its own stable key (never the internal, opaque id), plus
 *  display info for anything that also shows it in a UI (a real
 *  bench-screen prompt, PathScribe's own notification banner). */
export interface ResolvedCassetteColor {
  colorId: string;
  key: string;
  displayName: string;
  hexCode: string;
}

export interface CassetteRoutingResult {
  rule: CassetteRoutingRule;
  /** The real, primary target — what the rule resolved to before any
   *  real-world hopper availability is even considered. */
  primaryColor: ResolvedCassetteColor;
  /** Resolved from the CONTEXT's own protocolId (the specimen's real,
   *  actually-assigned protocol) via Protocol.pathways[].
   *  processingFormat — never from the matched rule itself, even when
   *  the rule's own condition also references a protocolId. See
   *  ICassetteRoutingRuleService.ts's own header for why: a rule
   *  storing its own copy of "type" would silently drift from reality
   *  the moment someone edits the real protocol elsewhere. Undefined
   *  when the context has no protocolId, the protocol can't be found,
   *  or it has no pathways to read a format from. */
  cassetteType?: string;
  printTemplateKey?: string;
  /** What the Engine should do if primaryColor's real hopper is
   *  unavailable — resolved from primaryColor's OWN real definition
   *  (CassetteColorDefinition.fallbackBehavior), never a second,
   *  rule-level copy. See ICassetteColorService.ts's own header for
   *  why fallback policy belongs to the color, not the rule. */
  fallbackBehavior: CassetteColorFallbackBehavior;
  /** Resolved, real fallback target — present only when
   *  fallbackBehavior is 'auto' and the primary color's own
   *  fallbackColorId genuinely resolves to another real, known color.
   *  A 'prompt' color, or an 'auto' color whose own fallbackColorId
   *  is unset or dangling, has no fallbackColor at all — the Engine
   *  (or a real bench-screen prompt) has nothing to silently
   *  substitute and must ask instead. */
  fallbackColor?: ResolvedCassetteColor;
}

function matchesRule(rule: CassetteRoutingRule, context: CassetteRoutingContext, now: Date): boolean {
  if (!rule.active) return false;
  if (rule.effectiveFrom && now < new Date(rule.effectiveFrom)) return false;
  if (rule.effectiveTo && now > new Date(rule.effectiveTo)) return false;

  const c = rule.conditions;
  // Every SET condition must match; an unset condition is a wildcard
  // for that dimension, not a requirement that the context also have
  // it unset — see ICassetteRoutingConditions's own doc comment.
  if (c.protocolId && c.protocolId !== context.protocolId) return false;
  if (c.priority && c.priority.length > 0 && (!context.priority || !c.priority.includes(context.priority))) return false;
  if (c.originStationId && c.originStationId !== context.originStationId) return false;
  if (c.orderingFacilityId && c.orderingFacilityId !== context.orderingFacilityId) return false;
  if (c.caseType && c.caseType !== context.caseType) return false;
  if (c.decantType && c.decantType.length > 0 && (!context.decantType || !c.decantType.includes(context.decantType))) return false;
  return true;
}

/** Real, deterministic tiebreak for two rules with an identical
 *  priorityWeight — earlier-created wins. Not array/insertion order,
 *  which callers can't rely on being stable once rules are fetched
 *  from a real service/database rather than an in-memory array. */
function compareRules(a: CassetteRoutingRule, b: CassetteRoutingRule): number {
  if (b.priorityWeight !== a.priorityWeight) return b.priorityWeight - a.priorityWeight;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function resolveCassetteType(protocolId: string | undefined, protocols: Protocol[]): string | undefined {
  if (!protocolId) return undefined;
  const protocol = protocols.find(p => p.id === protocolId);
  // Real, deliberate choice: the FIRST pathway's own processingFormat,
  // not every pathway's. A protocol with multiple tracks (e.g. Light
  // Microscopy + Immunofluorescence + Electron Microscopy, each with
  // its own real, potentially different processingFormat) has no
  // single, correct answer for "the" cassette type — the first
  // pathway is the real, established primary/default track
  // throughout this app's own protocol UI (protocolShared.tsx).
  return protocol?.pathways?.[0]?.processingFormat;
}

function toResolved(color: CassetteColorDefinition): ResolvedCassetteColor {
  return { colorId: color.id, key: color.key, displayName: color.displayName, hexCode: color.hexCode };
}

/** Real, top-level entry point — evaluates every active, in-date-range
 *  rule against a real routing context, returns the single winning
 *  rule's fully-resolved output (color + fallback chain + type), or
 *  null when nothing genuinely matches (an honest "no rule found,"
 *  never a guessed default — see this function's own callers for how
 *  "no match" should be handled, e.g. a real fallback rule with every
 *  condition left unset, or a hard app-level default). */
export function evaluateCassetteRouting(
  context: CassetteRoutingContext,
  rules: CassetteRoutingRule[],
  protocols: Protocol[],
  colors: CassetteColorDefinition[],
  now: Date = new Date(),
): CassetteRoutingResult | null {
  const matching = rules.filter(r => matchesRule(r, context, now));
  if (matching.length === 0) return null;

  const winner = [...matching].sort(compareRules)[0];
  const primary = colors.find(c => c.id === winner.colorId);
  // A rule referencing a color id that no longer resolves to any
  // real, known color (deleted/renamed dictionary entry) is a real,
  // genuine data-integrity gap — surfaced honestly as no result at
  // all, never silently defaulted to some placeholder color.
  if (!primary) return null;

  const fallback = primary.fallbackBehavior === 'auto' && primary.fallbackColorId
    ? colors.find(c => c.id === primary.fallbackColorId)
    : undefined;

  return {
    rule: winner,
    primaryColor: toResolved(primary),
    cassetteType: resolveCassetteType(context.protocolId, protocols),
    printTemplateKey: winner.printTemplateKey,
    fallbackBehavior: primary.fallbackBehavior,
    fallbackColor: fallback ? toResolved(fallback) : undefined,
  };
}
