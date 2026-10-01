// src/services/cytology/resolveAbnormalBleedingPatternFactorFromEncounters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("we should be capturing inbound ICDs"),
// applied to CytologyHighRiskFactors.abnormalBleedingPattern. Same
// real three-way structure as the immunocompromised and prior-
// cervical-dysplasia resolvers.
//
// Real, researched ICD-10-CM mapping for this criterion's own doc
// comment ("post-coital bleeding, unexplained postmenopausal bleeding
// (PMB), or abnormal uterine bleeding (AUB)"):
//   - N93.0 — Postcoital and contact bleeding
//   - N93.8 — Other specified abnormal uterine and vaginal bleeding
//   - N93.9 — Abnormal uterine and vaginal bleeding, unspecified
//   - N95.0 — Postmenopausal bleeding (the specific N95 subcode for
//             bleeding — matched exactly, not the whole N95 family,
//             which also covers unrelated menopausal conditions like
//             vasomotor symptoms and atrophic vaginitis)
// Real, deliberate prefix choice: 'N93' (catching N93.0/.8/.9 and any
// future subcode under the same real parent) plus the single, exact
// 'N95.0' rather than the broader 'N95' — a real, deliberate
// narrower match here, unlike the broader Z79.6/Z94/M32 prefixes used
// elsewhere, precisely because N95's own sibling subcodes describe
// genuinely unrelated conditions this criterion has no business
// matching.
// ─────────────────────────────────────────────────────────────────────────────

import type { EncounterDiagnosis } from '@/services/encounters/IEncounterService';

const ABNORMAL_BLEEDING_ICD10_PREFIXES = ['N93', 'N95.0'];

function isQualifyingCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return ABNORMAL_BLEEDING_ICD10_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function resolveAbnormalBleedingPatternFactorFromEncounters(
  encounters: { diagnoses?: EncounterDiagnosis[] }[],
): boolean | undefined {
  const allDiagnoses = encounters.flatMap(e => e.diagnoses ?? []);
  if (allDiagnoses.length === 0) return undefined;
  return allDiagnoses.some(d => isQualifyingCode(d.code));
}
