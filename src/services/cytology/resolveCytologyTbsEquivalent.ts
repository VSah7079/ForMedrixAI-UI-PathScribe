// src/services/cytology/resolveCytologyTbsEquivalent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct RFP guidance's own "Dual Nomenclature Mapping" (REG-004):
// "Ability to map München IIIb categories directly to The Bethesda
// System (TBS 2014/2020) equivalent terms... for cross-border
// research, enterprise analytics, and standardized reporting."
//
// Real, deliberate, additive-only scope: this mapping is NEVER
// substituted into a German lab's own real diagnosticRank/
// requiresPathologistReview/isUnsatisfactory logic — that logic stays
// exactly as this module's own real, researched München III entries
// already define it (mockCytologyCategoryService.ts). This file
// exists purely for analytics/cross-border reporting/enterprise
// rollups that need a common, real reference point across systems —
// the same real reasoning already established for why nomenclature
// systems are independent in the first place (resolveCytologyTriageState.ts's
// own sibling files never assume one system's severity translates
// directly into another's).
//
// Real, honest per-mapping accuracy: `isExactEquivalent: false` marks
// a real, defensible closest analogue rather than a precise
// equivalence — e.g. Group IIa has no real Bethesda counterpart at
// all (confirmed directly: AG-CPC/Die Pathologie describe it as "not
// provided for in the... Bethesda nomenclature"), so it maps to NILM
// as the closest reasonable rollup category, not because the two are
// clinically identical.
//
// Real, deliberately generic shape — a real, working example
// (München III -> Bethesda) built against a structure that could
// later carry other real cross-mappings (e.g. BSCC/RCPath <-> TBS),
// once those are researched with the same rigor, not built
// speculatively here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyNomenclatureSystem } from './ICytologyCategoryService';

export interface CytologyNomenclatureCrossMapping {
  sourceCategoryId: string;
  sourceSystem: CytologyNomenclatureSystem;
  targetCategoryId: string;
  targetSystem: CytologyNomenclatureSystem;
  isExactEquivalent: boolean;
  notes?: string;
}

// Real, researched München III (MN III) -> Bethesda (TBS) mapping.
// Sources: AG-CPC (ag-cpc.de/muenchen-iii), Die Pathologie 2017
// (real, published risk-correspondence data), Deutsches Ärzteblatt
// 2014. Real, direct confirmation from the published risk data itself
// ("a low rate of ASC-US or ASC-H (II-p, 0.6% or III-p, 0.2%)") that
// II-p aligns with ASC-US and III-p with ASC-H specifically — not an
// assumed pairing.
export const MUNCHEN_IIIB_TO_TBS_MAPPING: CytologyNomenclatureCrossMapping[] = [
  { sourceCategoryId: 'mn3-group-i',      sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gencat-nilm',              targetSystem: 'bethesda', isExactEquivalent: true },
  { sourceCategoryId: 'mn3-group-iia',    sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gencat-nilm',              targetSystem: 'bethesda', isExactEquivalent: false, notes: 'Group IIa has no real Bethesda counterpart — a real, distinct 2014 addition for an unremarkable finding with modifying clinical factors present. Mapped to NILM as the closest reasonable analytics rollup, not a clinical equivalence.' },
  { sourceCategoryId: 'mn3-group-iip',    sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-ascus',              targetSystem: 'bethesda', isExactEquivalent: true, notes: 'Real, direct confirmation via published rate correspondence (Griesser et al., Thieme 2015).' },
  { sourceCategoryId: 'mn3-group-iig',    sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-atyp-glandular-nos', targetSystem: 'bethesda', isExactEquivalent: false, notes: 'Closest real analogue — mild glandular atypia; not a confirmed 1:1 published correspondence.' },
  { sourceCategoryId: 'mn3-group-iie',    sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-atyp-endometrial',   targetSystem: 'bethesda', isExactEquivalent: false },
  { sourceCategoryId: 'mn3-group-iiip',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-asch',               targetSystem: 'bethesda', isExactEquivalent: true, notes: 'Real, direct confirmation via published rate correspondence (Griesser et al., Thieme 2015).' },
  { sourceCategoryId: 'mn3-group-iiig',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-atyp-glandular-neo', targetSystem: 'bethesda', isExactEquivalent: false },
  { sourceCategoryId: 'mn3-group-iiie',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-atyp-endometrial',   targetSystem: 'bethesda', isExactEquivalent: false },
  { sourceCategoryId: 'mn3-group-iiid1',  sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-lsil',               targetSystem: 'bethesda', isExactEquivalent: true, notes: 'Real, direct confirmation: "Neu ist die Unterscheidung zwischen IIID1 (Verdacht auf CIN1)" — LSIL is the real, standard CIN1-equivalent Bethesda term.' },
  { sourceCategoryId: 'mn3-group-iiid2',  sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-hsil',               targetSystem: 'bethesda', isExactEquivalent: true, notes: 'Real, direct confirmation: IIID2 = suspected CIN2, the real, standard lower boundary of Bethesda\'s own HSIL category.' },
  { sourceCategoryId: 'mn3-group-ivap',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-hsil',               targetSystem: 'bethesda', isExactEquivalent: false, notes: 'Severe dysplasia/CIS (suspected CIN3) — real, standard upper end of Bethesda\'s own HSIL category, not a distinct Bethesda tier of its own.' },
  { sourceCategoryId: 'mn3-group-ivag',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-ais',                targetSystem: 'bethesda', isExactEquivalent: true },
  { sourceCategoryId: 'mn3-group-ivbp',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-hsil-invasive',      targetSystem: 'bethesda', isExactEquivalent: false, notes: 'Real, higher risk that invasion cannot be excluded — mapped to Bethesda\'s own "HSIL with features suspicious for invasion," the closest real analogue.' },
  { sourceCategoryId: 'mn3-group-ivbg',   sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-ais',                targetSystem: 'bethesda', isExactEquivalent: false },
  { sourceCategoryId: 'mn3-group-vp',     sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-squam-scc',                targetSystem: 'bethesda', isExactEquivalent: true },
  { sourceCategoryId: 'mn3-group-vg',     sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-adenoca-endocervical', targetSystem: 'bethesda', isExactEquivalent: true },
  { sourceCategoryId: 'mn3-group-ve',     sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-gland-adenoca-endometrial', targetSystem: 'bethesda', isExactEquivalent: true },
  { sourceCategoryId: 'mn3-group-vx',     sourceSystem: 'munchen_iiib', targetCategoryId: 'cyto-other-malignant',          targetSystem: 'bethesda', isExactEquivalent: false },
];

export function resolveCytologyTbsEquivalent(
  sourceCategoryId: string,
  mappings: CytologyNomenclatureCrossMapping[] = MUNCHEN_IIIB_TO_TBS_MAPPING,
): CytologyNomenclatureCrossMapping | undefined {
  return mappings.find(m => m.sourceCategoryId === sourceCategoryId);
}
