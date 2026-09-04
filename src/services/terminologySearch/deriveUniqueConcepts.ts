// src/services/terminologySearch/deriveUniqueConcepts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "there are legitimate reasons the same
// SNOMED CT code could appear more than once, but it generally
// shouldn't be interpreted as 'two diagnoses.'" Real, named reasons
// this app never deduplicates on write (Specimen.coding.snomed's own
// doc comment, types/case/Specimen.ts): multiple observations
// producing the same coded concept, the same concept genuinely
// attached to different components of one specimen, a repeated/
// updated observation over the case's lifecycle, an interface/LIS
// preserving duplicate associations from different source records,
// or the same concept occurring in different roles/contexts despite
// an identical identifier.
//
// This file is the real, separate DERIVATION side of that principle:
// "I'd consider storing the individual associations but also deriving
// a distinct SNOMED concept set for analytics/billing." Every real
// storage write (Specimen.coding.snomed, CaseCoding.snomed) retains
// every individual association, untouched, for traceability — this
// function never mutates or reduces that raw data, only computes a
// real, deduplicated VIEW over it for a caller that genuinely needs a
// concept count (e.g. real billing complexity, real analytics), never
// "number of real, individual coding events."
// ─────────────────────────────────────────────────────────────────────────────

export interface CodedAssociation {
  code: string;
  system: string;
}

/**
 * Real, per direct guidance's own worked example: three retained,
 * individual associations for the same real SNOMED concept
 * (254837009, 254837009, 254837009) derive to exactly one unique
 * concept for analytics/billing purposes — never three. Distinct
 * within the same system only: the same bare code string in two
 * different real systems (e.g. a SNOMED code and an ICD-O code that
 * happen to share a numeric value) are genuinely different real
 * concepts, never conflated.
 */
export function deriveUniqueConcepts(associations: CodedAssociation[]): CodedAssociation[] {
  const seen = new Set<string>();
  const unique: CodedAssociation[] = [];
  for (const a of associations) {
    const key = `${a.system}::${a.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }
  return unique;
}

/** Real, direct convenience for the common real case: just the real,
 *  distinct count of unique concepts, not the concepts themselves —
 *  e.g. a real billing-complexity input that only needs "how many
 *  genuinely distinct findings," never the individual coding events
 *  behind that number. */
export function countUniqueConcepts(associations: CodedAssociation[]): number {
  return deriveUniqueConcepts(associations).length;
}
