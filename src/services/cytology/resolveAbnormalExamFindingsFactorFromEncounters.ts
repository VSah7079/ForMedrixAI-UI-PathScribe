// src/services/cytology/resolveAbnormalExamFindingsFactorFromEncounters.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("we should be capturing inbound ICDs"),
// applied to CytologyHighRiskFactors.abnormalExamFindings.
//
// Real, honest scope limit, more significant than the prior-cervical-
// procedure one: this criterion's own doc comment names TWO real,
// genuinely different things — "(a) a grossly visible cervical lesion,
// unexplained cervical mass" and "(b) persistent contact bleeding
// during specimen collection." Only (a) can come from encounter
// diagnosis history at all; (b) is, by definition, a real-time
// observation made DURING the current specimen's own collection — it
// has no encounter to have been coded on before this visit even
// happened, and capturing it would need a real, separate,
// accessioning-time field (the original Phase 41 pattern), not
// inbound ICD data. This resolver covers (a) only; a real
// false/undefined result here does not mean (b) has been ruled out.
//
// Real, researched ICD-10-CM mapping for (a):
//   - N84.1 — Polyp of cervix uteri (a real, common, visible lesion)
//   - N88.8 — Other specified noninflammatory disorders of cervix
//             uteri (a real, deliberately broader catch-all for other
//             structural findings without their own dedicated code)
// Real, deliberate exclusion: the R87.61x family (ASC-US/LSIL/HSIL/
// AGC cytology result codes) was considered and rejected — those
// codes describe a PRIOR CYTOLOGY RESULT, which this app's own
// resolvePriorAbnormalPapFactor.ts already resolves from its own
// internal review-record history. Using R87.61x here would be
// circular with that existing criterion, not a genuinely separate,
// independent signal the way a real physical exam finding is.
// Real, honest confidence note: unlike immunocompromised status or
// DES exposure, "unexplained cervical mass" has no single, clean,
// dedicated ICD-10-CM code the way those two do — N84.1/N88.8 are a
// real, reasonable but genuinely less exhaustive mapping than this
// module's other encounter-diagnosis resolvers.
// ─────────────────────────────────────────────────────────────────────────────

import type { EncounterDiagnosis } from '@/services/encounters/IEncounterService';

const ABNORMAL_EXAM_FINDING_ICD10_PREFIXES = ['N84.1', 'N88.8'];

function isQualifyingCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return ABNORMAL_EXAM_FINDING_ICD10_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

export function resolveAbnormalExamFindingsFactorFromEncounters(
  encounters: { diagnoses?: EncounterDiagnosis[] }[],
): boolean | undefined {
  const allDiagnoses = encounters.flatMap(e => e.diagnoses ?? []);
  if (allDiagnoses.length === 0) return undefined;
  return allDiagnoses.some(d => isQualifyingCode(d.code));
}
