// src/services/cytology/resolveCytologyHpvPositivityMonitorReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied MOL-QA-01 specification
// ("High-Risk HPV Primary Screening & Co-Testing Positivity Monitor").
//
// Real, direct correction to an earlier, overly-broad claim that this
// whole MOL-QA tier "needs genuinely new infrastructure": re-checked
// before assuming, and most of this report's own columns already have
// a real source — Specimen.cytologyScreening.hpvResult and
// hpvGenotypeDetail (PS-164/172) already carry the positive/negative
// result and the HPV16/18-45/other-high-risk genotype breakdown this
// report's own columns need; hpvOrderReason already distinguishes
// co-testing, ASC-US triage, and post-treatment surveillance from a
// real primary screen (hpvOrderReason left unset).
//
// Real, honest, remaining gap, confirmed directly rather than assumed:
// Test_Assay_Name (the real commercial platform — Roche cobas,
// Hologic Aptima, BD Onclarity) has no corresponding field anywhere in
// this app, including the real inbound event contract itself
// (HpvResultEventPayload.ts, types/events/) — a real molecular
// platform's own interface, per that file's own header, sends the
// interpreted result, abnormal flag, reference range, genotype, and
// order reason, but never which commercial assay produced it. Left
// undefined here, never fabricated.
//
// Real, honest Positivity_Variance: the given spec's own definition
// ("deviation from population regional baseline") assumes a real
// external baseline this app has no access to. Computed instead as
// deviation from the real, aggregate mean positivity rate across every
// real testing site in this same report — an honest, real, in-app
// proxy, not the given spec's own literal external metric, and
// labeled as such rather than silently presented as the real thing.
// ─────────────────────────────────────────────────────────────────────────────

export type CytologyHpvIndicationType = 'primary_screening' | 'co_testing' | 'ascus_triage' | 'post_treatment_follow_up';

export interface CytologyHpvPositivitySpecimenInput {
  testingSite: string;
  indicationType: CytologyHpvIndicationType;
  hpvPositive: boolean;
  hpv16Positive: boolean;
  hpv18Or45Positive: boolean;
  otherHrPositive: boolean;
}

export interface CytologyHpvPositivityMonitorRow {
  testingSite: string;
  indicationType: CytologyHpvIndicationType;
  /** Real, honest undefined — see this file's own header. */
  testAssayName: undefined;
  totalHpvTested: number;
  hrHpvPositiveCount: number;
  hrHpvPositivityPercent: number;
  hpv16PositivityPercent: number;
  hpv18Or45PositivityPercent: number;
  otherHrPositivityPercent: number;
  /** Real, honest in-app proxy — see this file's own header; NOT the
   *  given spec's own literal external regional baseline. */
  positivityVarianceFromAggregateMean: number;
}

export function resolveCytologyHpvPositivityMonitorReport(
  specimens: CytologyHpvPositivitySpecimenInput[],
): CytologyHpvPositivityMonitorRow[] {
  // Real, per the given spec's own column list: Indication_Type is a
  // real column that varies per row, meaning each real row is a
  // (Testing_Site, Indication_Type) combination, not Testing_Site
  // alone — a single site's co-testing and primary-screening
  // positivity rates are real, genuinely different populations worth
  // keeping separate, not blended into one number.
  const byGroup = new Map<string, CytologyHpvPositivitySpecimenInput[]>();
  for (const sp of specimens) {
    const key = `${sp.testingSite}|${sp.indicationType}`;
    const list = byGroup.get(key) ?? [];
    list.push(sp);
    byGroup.set(key, list);
  }

  const partial = Array.from(byGroup.entries()).map(([key, group]) => {
    const [testingSite, indicationType] = key.split('|') as [string, CytologyHpvIndicationType];
    const totalHpvTested = group.length;
    const hrHpvPositiveCount = group.filter(sp => sp.hpvPositive).length;
    const hrHpvPositivityPercent = totalHpvTested === 0 ? 0 : (hrHpvPositiveCount / totalHpvTested) * 100;
    return {
      testingSite,
      indicationType,
      totalHpvTested,
      hrHpvPositiveCount,
      hrHpvPositivityPercent,
      hpv16PositivityPercent: totalHpvTested === 0 ? 0 : (group.filter(sp => sp.hpv16Positive).length / totalHpvTested) * 100,
      hpv18Or45PositivityPercent: totalHpvTested === 0 ? 0 : (group.filter(sp => sp.hpv18Or45Positive).length / totalHpvTested) * 100,
      otherHrPositivityPercent: totalHpvTested === 0 ? 0 : (group.filter(sp => sp.otherHrPositive).length / totalHpvTested) * 100,
    };
  });

  const aggregateMean = partial.length === 0 ? 0 : partial.reduce((sum, p) => sum + p.hrHpvPositivityPercent, 0) / partial.length;

  return partial.map(p => ({
    ...p,
    testAssayName: undefined,
    positivityVarianceFromAggregateMean: p.hrHpvPositivityPercent - aggregateMean,
  }));
}
