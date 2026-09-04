// src/services/abnormalDetection/evaluateAbnormalTriggerRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-129. Pure, testable evaluation: given a specimen's resolved
// synoptic answers and the active rule set, returns real
// AiFieldSuggestion-shaped results for every match — never a bare
// boolean, and never an auto-applied status. Real, per direct
// guidance: "the case is considered abnormal or not, however the
// human makes the final call. We just offer the suggestion and why
// with a confidence factor." A discrete rule match is deterministic
// (a configured field/value either matches or it doesn't), so
// confidence is always 100 for a genuine match — this isn't a
// probabilistic guess the way PS-131's AI narrative suggestions are.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedAnswer } from '@/orchestrator/contextBuilder';
import type { AiFieldSuggestion } from '@/types/case/Case';
import type { AbnormalTriggerRule, AbnormalSeverity, SyntheticCodingTerm } from './IAbnormalTriggerRuleService';
import { resolveSyntheticCoding } from './resolveSyntheticCoding';

export interface AbnormalTriggerMatch {
  specimenId: string;
  ruleId: string;
  severity: AbnormalSeverity;
  suggestion: AiFieldSuggestion;
  /** Real, per direct guidance: "we can use synthetic codes because we
   *  will not have a license until our first customer or a
   *  partnership." The matched rule's own, per-rule synthetic coding
   *  when an admin has configured one (AbnormalTriggerRule.syntheticCoding),
   *  else the real, severity-keyed default from resolveSyntheticCoding.ts
   *  — never genuinely absent, since PS-130's real, current approach
   *  always attaches something, even if not yet a real, licensed code. */
  syntheticCoding: SyntheticCodingTerm[];
}

/** Real severity ranking so a specimen matching multiple rules can be
 *  reduced to its single highest-severity match for display purposes,
 *  without discarding the other real matches (callers needing all of
 *  them still get the full array). */
const SEVERITY_RANK: Record<AbnormalSeverity, number> = { Abnormal: 1, Critical: 2, Malignant: 3 };

/**
 * Checks one specimen's resolved synoptic answers against the active
 * (status === 'Active') trigger rules, already filtered to the real
 * facility scope by the caller (this function itself makes no
 * facility/lab decisions — see IAbnormalTriggerRuleService's own
 * Global/scoped doc comment for that resolution). Field-label and
 * value matching is case-insensitive; a rule matches if the
 * specimen's resolved answer for that field has ANY value listed in
 * the rule's own triggerValues (a multi-select field can match on any
 * one selected value).
 */
export function evaluateAbnormalTriggerRules(
  specimenId: string,
  resolvedAnswers: ResolvedAnswer[],
  activeRules: AbnormalTriggerRule[]
): AbnormalTriggerMatch[] {
  const matches: AbnormalTriggerMatch[] = [];

  for (const rule of activeRules) {
    if (rule.status !== 'Active') continue;
    const answer = resolvedAnswers.find(a => a.fieldLabel.trim().toLowerCase() === rule.fieldLabel.trim().toLowerCase());
    if (!answer) continue;

    // Real, per direct investigation: ResolvedAnswer.value for a
    // multi-select field holds opaque option IDs (e.g. 'opt_present'),
    // never human-readable text — only displayValue ("IDs resolved to
    // labels," per ResolvedAnswer's own doc comment) is real,
    // matchable text. A multi-select's displayValue is a joined string
    // of every selected label (e.g. "Other, Present"), so this splits
    // on comma and requires an EXACT match per component — never a
    // bare substring check, which would wrongly match "Present" inside
    // "Not Present."
    const triggerValuesLower = rule.triggerValues.map(v => v.trim().toLowerCase());
    const displayComponents = answer.displayValue.split(',').map(s => s.trim().toLowerCase());
    const isMatch = displayComponents.some(c => triggerValuesLower.includes(c));
    if (!isMatch) continue;

    matches.push({
      specimenId,
      ruleId: rule.id,
      severity: rule.severity,
      suggestion: {
        value: rule.severity,
        confidence: 100,
        source: `${rule.fieldLabel}: ${answer.displayValue}`,
        verification: 'unverified',
      },
      syntheticCoding: rule.syntheticCoding ?? resolveSyntheticCoding(rule.severity),
    });
  }

  return matches;
}

/** Reduces a specimen's full match list to its single highest-severity
 *  match — for UI contexts (e.g. a worklist badge) that need one real
 *  severity to display, not the full list. Returns undefined for no
 *  matches, never a fabricated "Normal" placeholder. */
export function highestSeverityMatch(matches: AbnormalTriggerMatch[]): AbnormalTriggerMatch | undefined {
  if (matches.length === 0) return undefined;
  return matches.reduce((best, m) => SEVERITY_RANK[m.severity] > SEVERITY_RANK[best.severity] ? m : best);
}

/** Real, per direct guidance's own unified sign-out review: converts a
 *  discrete trigger match into the same CriticalFindingFlag shape
 *  detectCriticalFindings.ts's AI-narrative findings already use
 *  (services/clinical/), so both detection paths render in one,
 *  unified review at sign-out rather than two separate UI surfaces.
 *  sourceField: 'synoptic' — an honest, distinct label from the three
 *  narrative fields, since this genuinely came from a structured
 *  synoptic answer, not narrative text. */
export function toCriticalFindingFlag(match: AbnormalTriggerMatch): { term: string; sourceField: 'synoptic'; sourceQuote: string; severity: AbnormalSeverity; confidence: number; syntheticCoding: SyntheticCodingTerm[] } {
  return {
    term: match.suggestion.source,
    sourceField: 'synoptic',
    sourceQuote: match.suggestion.source,
    severity: match.severity,
    confidence: match.suggestion.confidence,
    syntheticCoding: match.syntheticCoding,
  };
}
