// src/services/cytology/resolveAgeFromDateOfBirth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, small, reusable extraction of this app's own already-established
// age-from-DOB calculation (caseFilterUtils.ts's own real, inline
// logic for age-range case filtering) — same real math, made reusable
// for the real, new German age-stratified screening rule
// (ICytologyScreeningStrategyService.ts) rather than re-implementing
// it a second, potentially-divergent way.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveAgeFromDateOfBirth(dateOfBirth: string | undefined, asOf: Date = new Date()): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return undefined;
  return asOf.getFullYear() - birth.getFullYear() -
    (asOf < new Date(asOf.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
}
