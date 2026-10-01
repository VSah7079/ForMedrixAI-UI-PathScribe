// src/services/cytology/resolveHpvHighRiskFactors.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared logic closing a real, previously-documented gap: PS-164's
// own High-Risk algorithm always had `recentHrHpvPositive` and
// `hpvHighRiskGenotype` as real criteria, but with no real data source
// to populate them — explicitly noted at the time as a real,
// deferred-work limitation. Phase 1 of direct guidance's own
// international roadmap (US/CA — real co-testing/dual-result support)
// gives this app real, captured HPV data for the first time
// (Specimen.cytologyScreening.hpvResult/hpvGenotypeDetail). This
// resolver is the real, direct bridge between the two — the one real
// input CytologyHighRiskFactors can now be data-driven for, same as
// resolvePriorAbnormalPapFactor already is for its own one real,
// derivable criterion.
//
// Deliberately does NOT decide isHighRisk itself, and does NOT set a
// qcFlag — this only produces the two real, relevant
// CytologyHighRiskFactors fields; the real caller merges them with
// whatever other factors it has (still manual for now) and decides
// what to do with the combined result.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyScreeningRecord } from '@/types/case/Specimen';
import type { CytologyHighRiskFactors } from '@/types/cytology/CytologyHighRiskFactors';

export function resolveHpvHighRiskFactors(
  hpvResult: CytologyScreeningRecord['hpvResult'],
  hpvGenotypeDetail: CytologyScreeningRecord['hpvGenotypeDetail'],
): Pick<CytologyHighRiskFactors, 'recentHrHpvPositive' | 'hpvHighRiskGenotype'> {
  const recentHrHpvPositive = hpvResult === 'Positive';
  // Real, per PS-164's own established grouping: "HPV 16 or HPV
  // 18/45" — genotype only counts as the real, higher-risk trigger
  // when the overall result is genuinely positive in the first place;
  // a genotype detail left over from an earlier, different test is
  // never trusted on its own.
  const hpvHighRiskGenotype = recentHrHpvPositive === true &&
    (hpvGenotypeDetail?.hpv16 === true || hpvGenotypeDetail?.hpv18Or45 === true);

  return { recentHrHpvPositive, hpvHighRiskGenotype };
}
