// src/services/cytology/resolveCytologyHistologySeverityFromSnomed.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct correction to Phase 63's own investigation: "Surgical
// Pathology reports will contain SnomedCT and SNOMED codes. That is
// where you can find the comparison." Confirmed — Specimen.coding.snomed
// (types/case/Specimen.ts) is real, already-populated infrastructure:
// resolveEmbeddedCoding.ts already applies real SNOMED codes to a
// specimen the moment a pathologist approves a synoptic field
// selection whose template has one configured.
//
// Real, deliberate design constraint, matching this codebase's own
// already-established policy (Case.ts's own syntheticAbnormalCoding
// doc comment: "architecture-testing only, NEVER a real, licensed
// SNOMED CT... code — PS-130 (the real implementation) stays
// genuinely blocked on a real terminology source"; every real
// EditorField.snomed/FieldOption.snomed value is an empty string in
// every template today, "pending a confirmed CAP/RCPath license"):
// this resolver never hardcodes a real SNOMED code value anywhere.
// The severity mapping is a real, external, admin/customer-supplied
// table — populated once a real license exists — never data this
// codebase ships pre-filled with actual code numbers, the same real
// boundary resolveEmbeddedCoding.ts itself already draws.
//
// Real, deliberate reuse: deduplicates the specimen's own, deliberately
// non-deduplicated raw coding.snomed array via the already-existing
// deriveUniqueConcepts (services/terminologySearch/) before mapping —
// the same real reasoning that function's own header already
// documents (repeated real associations are not repeated real
// findings).
// ─────────────────────────────────────────────────────────────────────────────

import { deriveUniqueConcepts } from '@/services/terminologySearch/deriveUniqueConcepts';

export interface SnomedSeverityMappingEntry {
  snomedCode: string;
  /** Real, deliberate scale match to cytology's own diagnosticRank
   *  (0-5) for direct comparability — e.g. benign/negative = 0,
   *  CIN1 = 1, CIN2 = 2, CIN3/AIS = 4, invasive SCC/adenocarcinoma = 5. */
  severityRank: number;
}

/**
 * Real, honest resolution: returns the HIGHEST severity rank among
 * every real SNOMED code on the specimen that the given mapping table
 * actually resolves — a real specimen can carry more than one real,
 * individually-applied code, and the most severe one is the real,
 * clinically-relevant finding for a correlation check. Returns
 * `undefined` when the specimen has no real SNOMED codes at all, or
 * when none of its codes appear in the given mapping (the real,
 * honest "pending a confirmed license" state, matching
 * resolveEmbeddedCoding.ts's own empty-string default) — never a
 * fabricated rank.
 */
export function resolveCytologyHistologySeverityFromSnomed(
  specimenSnomedCoding: { code: string }[] | undefined,
  mapping: SnomedSeverityMappingEntry[],
): number | undefined {
  if (!specimenSnomedCoding || specimenSnomedCoding.length === 0) return undefined;

  const uniqueConcepts = deriveUniqueConcepts(specimenSnomedCoding.map(c => ({ code: c.code, system: 'SNOMED' })));
  const rankByCode = new Map(mapping.map(m => [m.snomedCode, m.severityRank]));

  const resolvedRanks = uniqueConcepts
    .map(c => rankByCode.get(c.code))
    .filter((r): r is number => r !== undefined);

  if (resolvedRanks.length === 0) return undefined;
  return Math.max(...resolvedRanks);
}
