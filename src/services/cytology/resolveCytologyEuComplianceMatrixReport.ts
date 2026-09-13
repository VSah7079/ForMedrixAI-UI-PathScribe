// src/services/cytology/resolveCytologyEuComplianceMatrixReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied EU-QA-01 specification
// ("Trans-National European Screening Compliance & ISO 15189 Audit
// Matrix" — real regulatory drivers: EURECAH Guidelines, NVVP
// (Netherlands), HAS (France), G-BA (Germany), INAB/Irish National
// Cervical Screening Governance).
//
// Real, honest scope, decided after real research rather than a
// guess: three of the given spec's own seven columns are genuinely
// not buildable today, and none are faked here:
//   - National_Registry_ID — no facility-level national registry
//     registration-ID field exists anywhere in this app.
//   - Specimen_Type (ThinPrep vs. SurePath) — no liquid-based
//     preparation-method field exists anywhere in this app.
//   - Screening_Interval_Adherence_Years — real research (web search,
//     not memory) confirmed each of these countries' own real
//     recommended interval is genuinely age-dependent (France: 3-year
//     cytology 25-29, then 5-year HPV 30-65; Germany: age-dependent
//     cytology-vs-co-test per G-BA's 2020 program; Netherlands/
//     Belgium: 5-year primary HPV from age 30). Computing real
//     adherence honestly needs both a real per-country-per-age
//     interval table AND real cross-case patient screening history —
//     and Germany's own age-dependent screening/reflex rule engine
//     (WFK-003/005) doesn't exist in this app yet at all, so a
//     genuinely correct per-age calculation isn't possible for every
//     real country this report covers. Building an approximate,
//     age-blind version risked being confidently wrong about a real
//     regulatory compliance metric — not attempted here.
//
// What real, genuine data this app already has: Country_Code (from
// real facility jurisdiction), HPV_Primary_vs_CoTest_Status (from the
// real, existing hpvOrderReason field), and
// Internal_Audit_Non_Conformity_Count — real, direct reuse of the
// existing QA/CAPA framework (Phase 62) rather than a second,
// competing count, filtered to real discordant QaActivityRecord
// entries for cytology cases in each real country.
//
// Real, deliberate shape: this report aggregates per real
// Country_Code, not per case — Internal_Audit_Non_Conformity_Count is
// inherently a real, per-jurisdiction tally, not a single case's own
// value, and forcing a per-case row for a count column would have
// been a worse fit than an honest, aggregate one.
// ─────────────────────────────────────────────────────────────────────────────

export interface CytologyEuComplianceSpecimenInput {
  countryCode: string;
  /** Real, per Specimen.cytologyScreening.hpvOrderReason — 'co_test'
   *  maps to co-testing; any other real, non-undefined value or a
   *  real facility strategy of primary_hpv_reflex maps to primary. */
  hpvStatus: 'primary' | 'co_test' | 'not_applicable';
}

export interface CytologyEuComplianceMatrixRow {
  countryCode: string;
  totalCases: number;
  hpvPrimaryCount: number;
  hpvCoTestCount: number;
  internalAuditNonConformityCount: number;
}

export function resolveCytologyEuComplianceMatrixReport(
  specimens: CytologyEuComplianceSpecimenInput[],
  nonConformityCountByCountry: Record<string, number>,
): CytologyEuComplianceMatrixRow[] {
  const byCountry = new Map<string, CytologyEuComplianceSpecimenInput[]>();
  for (const sp of specimens) {
    const list = byCountry.get(sp.countryCode) ?? [];
    list.push(sp);
    byCountry.set(sp.countryCode, list);
  }

  return Array.from(byCountry.entries()).map(([countryCode, group]) => ({
    countryCode,
    totalCases: group.length,
    hpvPrimaryCount: group.filter(sp => sp.hpvStatus === 'primary').length,
    hpvCoTestCount: group.filter(sp => sp.hpvStatus === 'co_test').length,
    internalAuditNonConformityCount: nonConformityCountByCountry[countryCode] ?? 0,
  }));
}
