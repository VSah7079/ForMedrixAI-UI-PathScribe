// src/services/cytology/combineHighRiskBooleanSignals.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic for a real, recurring shape in this module:
// CytologyHighRiskFactors.abnormalExamFindings is the first real
// criterion resolved from TWO independent, non-overlapping partial
// sources (a structural finding from inbound ICD-10 encounter data,
// and a collection-time observation that can only ever be manually
// recorded) — a shape likely to recur if a future criterion is ever
// split the same way.
//
// Real, honest combining rule, deliberately conservative:
//   - true  if EITHER source is true — either one finding the real
//     risk is enough; they are not required to agree.
//   - false only if BOTH sources are a real, definitive false — a
//     genuine "checked both halves, found nothing" answer.
//   - undefined otherwise — including when one source is a real,
//     definitive false and the other is genuinely unknown. A single
//     checked-and-clear half does not license claiming the whole
//     criterion is clear when the other half was never actually
//     examined; collapsing that into a confident false would overstate
//     what is genuinely known for a patient-safety algorithm.
// ─────────────────────────────────────────────────────────────────────────────

export function combineHighRiskBooleanSignals(a: boolean | undefined, b: boolean | undefined): boolean | undefined {
  if (a === true || b === true) return true;
  if (a === false && b === false) return false;
  return undefined;
}
