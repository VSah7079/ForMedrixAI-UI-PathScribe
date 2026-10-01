// src/services/autopsy/calculateAutopsyBodyMassIndex.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Autopsy Grossing Synoptic spec's own Q1.1: "Body Mass
// Index (BMI): [Auto-Calculated kg/m²]." The real Synoptic Library
// apparatus (EditorTemplate/EditorField) has no native "computed
// field" concept today — real, deliberate scope: this stays a real,
// pure, standalone calculation a future rendering layer wires in,
// rather than inventing a speculative compute-graph feature into the
// apparatus beyond what PS-272 actually authorized (multi-value
// visibility, lexiconTermKey).
// ─────────────────────────────────────────────────────────────────────────────

/** Real, standard BMI formula: kg / (height in metres)^2. Returns
 *  undefined for a real, non-positive height or weight — never a
 *  fabricated 0 or Infinity. */
export function calculateAutopsyBodyMassIndex(weightKg: number, heightCm: number): number | undefined {
  if (!(weightKg > 0) || !(heightCm > 0)) return undefined;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}
