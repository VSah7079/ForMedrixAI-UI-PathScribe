// src/services/cytology/resolvePriorCervicalProcedureFactorFromEncounters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct follow-up: "We should be capturing inbound ICDs" — the
// same real approach as resolveImmunocompromisedFactorFromEncounters.ts,
// applied to CytologyHighRiskFactors.priorCervicalProcedureOrBiopsy.
//
// Real, researched ICD-10-CM mapping (verified via web search, same
// discipline as the immunocompromised mapping) for the diagnosis-
// history half of this criterion's own doc comment ("history of CIN
// 1/2/3, AIS, or a prior cervical procedure"):
//   - Z87.410 — Personal history of cervical dysplasia (mild/moderate
//               — CIN I/II)
//   - Z86.001 — Personal history of in-situ neoplasm of cervix uteri
//               (conditions classifiable to D06 — CIN III, and AIS,
//               which ICD-10-CM also classifies under D06 as a
//               glandular in-situ lesion of the cervix)
//
// Real, honest scope limit: this captures the real DIAGNOSIS-history
// half only. "LEEP, Cold Knife Conization, Cryotherapy" are real
// PROCEDURES, not diagnoses — they would arrive (if at all) via a real
// HL7 PR1 (procedure) segment or a CPT code, neither of which this
// app's inbound ADT processing (processAdtMessage.ts) parses or
// stores anywhere today; DG1/EncounterDiagnosis carries diagnosis
// codes only. Real, honest reasoning for why this is still a
// genuinely meaningful signal despite that gap: a patient with a real,
// coded history of CIN III/AIS or dysplasia has, in standard practice,
// almost always already undergone some real excisional or ablative
// procedure to address it — the diagnosis-history code is a real,
// strong proxy for the procedure history even without capturing the
// specific procedure event itself. Real, separate follow-on: adding
// real PR1/procedure-code capture would close this gap fully, not
// something to fake here with an invented code that doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────

import type { EncounterDiagnosis } from '@/services/encounters/IEncounterService';

const PRIOR_CERVICAL_DYSPLASIA_ICD10_PREFIXES = ['Z87.410', 'Z86.001'];

function isQualifyingCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return PRIOR_CERVICAL_DYSPLASIA_ICD10_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function resolvePriorCervicalProcedureFactorFromEncounters(
  encounters: { diagnoses?: EncounterDiagnosis[] }[],
): boolean | undefined {
  const allDiagnoses = encounters.flatMap(e => e.diagnoses ?? []);
  if (allDiagnoses.length === 0) return undefined;
  return allDiagnoses.some(d => isQualifyingCode(d.code));
}
