// src/utils/normalizeOrderCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Order-type-mapping work (extends the existing Specimen Code Crosswalk —
// see services/orderIntake/IOrderIntakeService.ts's own
// SpecimenCodeCrosswalkEntry — with real coding-system awareness, per
// direct cross-check against an external spec: PathScribe doesn't parse
// raw HL7 itself, per services/hl7/README.md's own architecture note —
// the interface engine (Mirth/Rhapsody/Cloverleaf/Corepoint) owns that.
// What PathScribe still needs, on the clean JSON it receives, is a real
// normalization pass so cosmetic differences in how the SAME code was
// transcribed never cause a false crosswalk miss.
//
// Same safe-normalization posture as utils/normalizeIdForSearch.ts's own
// doc comment: this can only ever remove false negatives (a real match
// hidden by formatting noise), never introduce a false positive — unlike
// e.g. date reinterpretation, there's no ambiguity being resolved here,
// just superficial noise being stripped before comparison.
// ─────────────────────────────────────────────────────────────────────────────

/** Trims, uppercases, strips punctuation, and collapses internal
 *  whitespace — so "  surg-path ", "SURG PATH", and "SurgPath" all
 *  normalize to the same comparison key. Not for display — comparison
 *  only, same convention as normalizeIdForSearch.ts. */
export function normalizeOrderCode(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}
