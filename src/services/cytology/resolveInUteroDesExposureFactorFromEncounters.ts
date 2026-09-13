// src/services/cytology/resolveInUteroDesExposureFactorFromEncounters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("we should be capturing inbound ICDs"),
// applied to CytologyHighRiskFactors.inUteroDesExposure. Same real
// three-way structure as this module's other real encounter-diagnosis
// resolvers.
//
// Real, researched ICD-10-CM mapping: Z91.B — "Personal risk factor of
// exposure to diethylstilbestrol," explicitly inclusive of "DES
// daughter or son" and "Personal risk factor of exposure to DES in
// utero" — a real, exact, single-code match for this criterion's own
// doc comment, genuinely newer than expected (a 2026 ICD-10-CM code,
// effective 10/1/2025 — verified via web search, not assumed from an
// older, memorized code set). Real, deliberate exclusion: Z84.A
// ("Family history of exposure to diethylstilbestrol") is a real,
// different, third-generation code — a DES-exposed woman's own
// grandchild's risk factor, not her own — and must never be
// conflated with Z91.B here.
// ─────────────────────────────────────────────────────────────────────────────

import type { EncounterDiagnosis } from '@/services/encounters/IEncounterService';

const DES_EXPOSURE_ICD10_PREFIX = 'Z91.B';

function isQualifyingCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith(DES_EXPOSURE_ICD10_PREFIX);
}

export function resolveInUteroDesExposureFactorFromEncounters(
  encounters: { diagnoses?: EncounterDiagnosis[] }[],
): boolean | undefined {
  const allDiagnoses = encounters.flatMap(e => e.diagnoses ?? []);
  if (allDiagnoses.length === 0) return undefined;
  return allDiagnoses.some(d => isQualifyingCode(d.code));
}
