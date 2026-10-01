// src/services/cytology/resolveCisoeAToBethesda.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own CISOE-A specification: "Automatically
// map combinations of S, E [and O] scores into Bethesda categories."
// Real, researched, per-axis grade tables, confirmed against the real,
// published CISOE-A/Bethesda 2001/Pap correspondence table (PMC1770272):
//   S1/O1-2/E1-2 -> Normal (NILM)
//   S2-3/O3/E3   -> Borderline (ASC-US / AGC)
//   S4/O4/E4     -> Mild dyskaryosis (LSIL / AGC favour neoplastic)
//   S5/O5/E5     -> Moderate dyskaryosis (HSIL / AGC favour neoplastic)
//   S6-7/O6-7/E6-7 -> Severe dyskaryosis / CIS (HSIL / AIS)
//   S8-9/O7-8/E9 -> Carcinoma
//
// Real, per direct guidance's own "Non-standard Exclusion Handling":
// "the Dutch system historically does not use the Bethesda ASC-H
// category directly" — confirmed directly in the real source data
// itself ("ASC-H has no official equivalent at the Pap and CISOE-A
// classification systems. Usually, it is classified in the same group
// as ASC-US and LSIL"). This mapping table never outputs ASC-H for
// any real score combination — a structural guarantee, not a
// special-cased check.
//
// Real, per Bethesda's own established "most severe finding is the
// primary interpretation" principle (already this module's own
// governing rule for every other nomenclature system): the axis
// mapping to the highest real diagnosticRank becomes
// primaryInterpretationId; any other, genuinely abnormal axis becomes
// an additional interpretation — never silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

import type { CisoeAScore } from '@/types/cytology/CisoeAScore';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';

function mapSquamous(value: number): string {
  if (value <= 1) return 'cyto-gencat-nilm';
  if (value <= 3) return 'cyto-squam-ascus';
  if (value === 4) return 'cyto-squam-lsil';
  if (value <= 7) return 'cyto-squam-hsil';
  return 'cyto-squam-scc';
}

function mapOther(value: number): string {
  if (value <= 2) return 'cyto-gencat-nilm';
  if (value === 3) return 'cyto-gland-atyp-glandular-nos';
  if (value <= 5) return 'cyto-gland-atyp-glandular-neo';
  if (value <= 7) return 'cyto-gland-ais';
  return 'cyto-gland-adenoca-nos';
}

function mapEndocervical(value: number): string {
  if (value <= 2) return 'cyto-gencat-nilm';
  if (value === 3) return 'cyto-gland-atyp-endocervical';
  if (value <= 5) return 'cyto-gland-atyp-endocervical-neo';
  if (value <= 7) return 'cyto-gland-ais';
  return 'cyto-gland-adenoca-endocervical';
}

export interface CisoeABethesdaTranslation {
  primaryInterpretationId: string;
  additionalInterpretationIds: string[];
}

export function resolveCisoeAToBethesda(
  score: CisoeAScore,
  categories: Pick<CytologyCategoryEntry, 'id' | 'diagnosticRank'>[],
): CisoeABethesdaTranslation {
  const candidates = [
    mapSquamous(score.squamous.value),
    mapOther(score.otherEndometrium.value),
    mapEndocervical(score.endocervical.value),
  ];
  const rankOf = (id: string) => categories.find(c => c.id === id)?.diagnosticRank ?? 0;

  // Real, deliberate: ties keep the first-seen (squamous-first) order,
  // matching squamous findings' own real, established clinical
  // primacy in cervical screening.
  const primaryInterpretationId = candidates.reduce((best, id) => (rankOf(id) > rankOf(best) ? id : best));
  const additionalInterpretationIds = Array.from(new Set(
    candidates.filter(id => id !== primaryInterpretationId && rankOf(id) > 0)
  ));

  return { primaryInterpretationId, additionalInterpretationIds };
}
