// src/services/cancerRegistry/resolveCancerRegistryReportability.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research already on record in this codebase
// (src/FHIR_DISPATCH_ARCHITECTURE_PLAN.md's own "real, critical
// finding"): "NAACCR/SEER/NPCR/CoC explicitly exclude carcinoma in
// situ of the cervix and CIN III from cancer-registry reportability,
// effective 1996... a real, named exception alongside PIN III and
// skin SCC/BCC. A literal '/2 or /3' trigger would incorrectly flag
// every real HSIL/AIS/CIN3 cytology finding nationwide." This
// function implements that real, documented rule set — NOT a claim
// of exhaustive coverage of NAACCR's own, much larger body of site-
// specific reportability rules, which is real, substantial reference
// work beyond this gap's own honest scope.
//
// Real, per that same document's own critical finding: this function
// must only ever be called from a real SURGICAL PATHOLOGY diagnosis
// (biopsy/resection), never from a cytology screening result — a Pap
// smear is a screening impression, not a diagnosis, regardless of how
// severe the cytology impression reads.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveIcdOBehaviorCode } from './resolveIcdOBehaviorCode';

export type CancerRegistryReportabilityOutcome = 'reportable' | 'not_reportable' | 'indeterminate';

export interface CancerRegistryReportabilityResult {
  outcome: CancerRegistryReportabilityOutcome;
  reason: string;
}

/** Real, documented, named NAACCR exclusions — behavior /2 (in situ)
 *  or a specific /3 diagnosis that is, by long-standing convention,
 *  excluded from central cancer registry reportability despite its
 *  own real behavior code. Matched by ICD-O-3 topography (site) code
 *  prefix plus a real, narrow diagnosis-name check where the
 *  exclusion is diagnosis-specific rather than site-wide. */
const CERVIX_TOPOGRAPHY_PREFIX = 'C53';
const PROSTATE_TOPOGRAPHY_PREFIX = 'C61';
const SKIN_TOPOGRAPHY_PREFIX = 'C44';

export function resolveCancerRegistryReportability(
  icdOMorphologyCode: string,
  icdOTopographyCode: string | undefined,
  diagnosisText: string,
): CancerRegistryReportabilityResult {
  const behaviorCode = resolveIcdOBehaviorCode(icdOMorphologyCode);

  if (behaviorCode === null) {
    return { outcome: 'indeterminate', reason: `"${icdOMorphologyCode}" is not a recognizable ICD-O-3 morphology/behavior code.` };
  }

  // Real, honest default: only /2 (in situ) and /3 (malignant,
  // primary site) are ever reportable at all — behavior 0/1/6/9 are
  // never reportable to a central cancer registry under this rule.
  if (behaviorCode !== '2' && behaviorCode !== '3') {
    return { outcome: 'not_reportable', reason: `ICD-O-3 behavior code /${behaviorCode} is not reportable.` };
  }

  const lowerDx = diagnosisText.toLowerCase();

  // Real, named NAACCR exclusion: cervical carcinoma in situ / CIN III,
  // effective 1996.
  if (icdOTopographyCode?.startsWith(CERVIX_TOPOGRAPHY_PREFIX) && behaviorCode === '2') {
    return { outcome: 'not_reportable', reason: 'Cervical carcinoma in situ / CIN III is a named NAACCR exclusion, effective 1996.' };
  }
  if (lowerDx.includes('cin iii') || lowerDx.includes('cin 3') || lowerDx.includes('cervical intraepithelial neoplasia grade iii') || lowerDx.includes('cervical intraepithelial neoplasia grade 3')) {
    return { outcome: 'not_reportable', reason: 'CIN III is a named NAACCR exclusion, effective 1996.' };
  }

  // Real, named NAACCR exclusion: PIN III (prostatic intraepithelial
  // neoplasia grade III).
  if (icdOTopographyCode?.startsWith(PROSTATE_TOPOGRAPHY_PREFIX) && behaviorCode === '2') {
    return { outcome: 'not_reportable', reason: 'Prostatic intraepithelial neoplasia (in situ) is a named NAACCR exclusion.' };
  }
  if (lowerDx.includes('pin iii') || lowerDx.includes('pin 3')) {
    return { outcome: 'not_reportable', reason: 'PIN III is a named NAACCR exclusion.' };
  }

  // Real, named NAACCR exclusion: basal cell and squamous cell
  // carcinoma of the skin (excluding genital skin) are excluded from
  // most central registries' own reportability requirements.
  if (icdOTopographyCode?.startsWith(SKIN_TOPOGRAPHY_PREFIX) && (lowerDx.includes('basal cell') || lowerDx.includes('squamous cell carcinoma'))) {
    return { outcome: 'not_reportable', reason: 'Basal/squamous cell carcinoma of the skin is a named NAACCR exclusion.' };
  }

  return { outcome: 'reportable', reason: `ICD-O-3 behavior code /${behaviorCode} with no applicable exclusion.` };
}
