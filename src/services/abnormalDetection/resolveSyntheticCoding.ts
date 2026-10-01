// src/services/abnormalDetection/resolveSyntheticCoding.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-130 (real, licensed SNOMED CT / ICD-O-3 mapping) stays BLOCKED —
// this does NOT unblock it. Real, per direct guidance: a way to
// exercise the "confirmed finding → attached coded term" architecture
// end to end (does the mapping mechanism work, does the UI render it,
// does it flow through) before a real, verified terminology source
// exists — genuinely different from, and safe in a way, fabricating
// real-looking clinical codes never would be.
//
// Real safety boundary, deliberately structural, not just textual: a
// real SNOMED CT code is a bare numeric string (e.g. "254837009"); a
// real ICD-O-3 code is a specific alphanumeric/slash format (e.g.
// "8500/3"). Every code value this file produces is prefixed
// "TEST-SNOMED-"/"TEST-ICDO3-" directly IN THE CODE STRING ITSELF —
// never just in a separate display label that could be dropped or
// stripped downstream. Even seen completely alone, with no other
// context, a value from this file can never be mistaken for a real
// code in either system's real format. Every display string also
// leads with "[SYNTHETIC — TEST ONLY]" for the same reason, belt and
// suspenders.
// ─────────────────────────────────────────────────────────────────────────────

import type { AbnormalSeverity, SyntheticCodingTerm } from './IAbnormalTriggerRuleService';

const SYNTHETIC_MAP: Record<AbnormalSeverity, SyntheticCodingTerm[]> = {
  Abnormal: [
    { system: 'TEST-SNOMED', code: 'TEST-SNOMED-000001', display: '[SYNTHETIC — TEST ONLY] Abnormal finding, architecture test' },
  ],
  Critical: [
    { system: 'TEST-SNOMED', code: 'TEST-SNOMED-000002', display: '[SYNTHETIC — TEST ONLY] Critical finding, architecture test' },
  ],
  Malignant: [
    { system: 'TEST-SNOMED', code: 'TEST-SNOMED-000003', display: '[SYNTHETIC — TEST ONLY] Malignant neoplasm, architecture test' },
    { system: 'TEST-ICDO3', code: 'TEST-ICDO3-0000-3', display: '[SYNTHETIC — TEST ONLY] Morphology, malignant, architecture test' },
  ],
};

/**
 * Returns a small, fixed, structurally-unmistakable-as-fake coding
 * set for the given severity — for architecture/QC testing only.
 * Never a real SNOMED CT or ICD-O-3 term. See this file's own header
 * for the full safety reasoning.
 */
export function resolveSyntheticCoding(severity: AbnormalSeverity): SyntheticCodingTerm[] {
  return SYNTHETIC_MAP[severity];
}
