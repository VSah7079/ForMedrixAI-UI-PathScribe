// src/services/cytology/resolveCytologyHistologyCorrelationOutcome.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied CYT-QA-04 specification:
// "Correlation_Category: Concordant, Minor Discrepancy (1 step
// difference), Major Discrepancy (≥2 step difference)." Real,
// deliberate use of the given spec's own exact step-count rule here,
// rather than classifyCytologyAgreement.ts's own rank ≤2-vs-≥3
// threshold rule (built for a genuinely different real comparison —
// two cytology reviews on the same 0-5 scale where adequacy also
// matters) — this is a real, distinct comparison this report's own
// specification defines differently, not a discrepancy to reconcile.
//
// Both ranks are expected on the same real 0-5 scale
// resolveCytologyHistologySeverityFromSnomed.ts's own mapping targets,
// matching cytology's own diagnosticRank directly.
// ─────────────────────────────────────────────────────────────────────────────

export type CytologyHistologyCorrelationOutcome = 'concordant' | 'minor_discrepancy' | 'major_discrepancy' | 'unresolvable';

export function resolveCytologyHistologyCorrelationOutcome(
  cytologyRank: number | undefined,
  histologyRank: number | undefined,
): CytologyHistologyCorrelationOutcome {
  if (cytologyRank === undefined || histologyRank === undefined) return 'unresolvable';
  const stepDifference = Math.abs(cytologyRank - histologyRank);
  if (stepDifference === 0) return 'concordant';
  if (stepDifference === 1) return 'minor_discrepancy';
  return 'major_discrepancy';
}
