// src/services/autopsy/classifyAutopsyOrganCodeFromSiteText.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed two-tier mapping strategy
// — Tier 2, the "Fallback Classifier": "For legacy cases or unmapped
// free-text specimens, run a lightweight lookup map on the specimen
// site text at ingest to set the organ_code. If unmapped, default the
// specimen section to General/External."
//
// Real, deliberate scope, per direct guidance's own confirmed
// reasoning for why organCodes exists as a real, structured field at
// all ("to make the section auto-derivation work cleanly without
// fragile string parsing"): this file IS that fragile string parsing,
// used only as a real, explicit, best-effort FALLBACK for real
// specimens with no real, structured organCodes already set — never
// the primary path, never presented as authoritative. A real match
// here is a real, honest guess from free text, not a real, validated
// classification.
//
// Real, deliberate array return (not a single code): honors the same
// real "combined resections" case organCodes[] itself exists for
// (e.g. a real "liver and gallbladder" specimen) — a real caller gets
// every real, keyword-matched organ, not just the first.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyOrganCode } from '../../types/autopsy/AutopsyOrganCode';

/** Real, deliberately simple keyword lists — word-boundary matched,
 *  never substring-matched, so a real "heartburn" or "livery" never
 *  falsely matches "heart"/"liver". Kept to the real organ's own
 *  common name(s); never attempting real synonym/abbreviation
 *  exhaustiveness this pass — a real miss here safely falls through
 *  to the real, honest General/External default, never a wrong
 *  guess. */
const ORGAN_KEYWORDS: Partial<Record<AutopsyOrganCode, string[]>> = {
  brain: ['brain', 'cerebrum', 'cerebellum'],
  spinal_cord: ['spinal cord'],
  eyes: ['eye', 'eyes', 'globe'],
  thyroid: ['thyroid'],
  parathyroid: ['parathyroid'],
  larynx_trachea: ['larynx', 'trachea'],
  heart: ['heart', 'cardiac'],
  pericardium: ['pericardium'],
  aorta: ['aorta'],
  right_lung: ['right lung'],
  left_lung: ['left lung'],
  pleura: ['pleura'],
  esophagus: ['esophagus'],
  stomach: ['stomach', 'gastric'],
  small_intestine: ['small intestine', 'small bowel'],
  large_intestine: ['large intestine', 'large bowel', 'colon'],
  appendix: ['appendix'],
  liver: ['liver', 'hepatic'],
  gallbladder_biliary: ['gallbladder', 'biliary'],
  pancreas: ['pancreas'],
  right_kidney: ['right kidney'],
  left_kidney: ['left kidney'],
  adrenal_glands: ['adrenal'],
  bladder: ['bladder'],
  ureters: ['ureter'],
  prostate: ['prostate'],
  uterus_adnexa: ['uterus', 'adnexa'],
  testes: ['testis', 'testes', 'testicle'],
  spleen: ['spleen', 'splenic'],
  lymph_nodes: ['lymph node'],
  bone_marrow: ['bone marrow'],
  skin_subcutis: ['skin', 'subcutis', 'subcutaneous'],
};

function containsWholeWord(haystack: string, needle: string): boolean {
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return pattern.test(haystack);
}

/** Real, per direct guidance's own confirmed fallback design. Returns
 *  every real organ whose own keyword genuinely matches — real,
 *  deliberately empty array (never a guessed single code) when
 *  nothing matches, so a real caller can honestly default that
 *  specimen's section to General/External, per direct guidance's own
 *  confirmed instruction. Checked in the real, fixed vocabulary order
 *  above (kidney before liver etc. doesn't matter — genuinely
 *  independent keyword checks, not a priority chain). */
export function classifyAutopsyOrganCodeFromSiteText(siteText: string): AutopsyOrganCode[] {
  const matches: AutopsyOrganCode[] = [];
  for (const [organCode, keywords] of Object.entries(ORGAN_KEYWORDS) as [AutopsyOrganCode, string[]][]) {
    if (keywords.some(keyword => containsWholeWord(siteText, keyword))) {
      matches.push(organCode);
    }
  }
  return matches;
}
