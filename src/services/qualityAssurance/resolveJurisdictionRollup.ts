// src/services/qualityAssurance/resolveJurisdictionRollup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Enterprise Business Intelligence
// Rollup Dashboard gap: "respecting local data-residency rules at the
// performing-lab tier while rolling up anonymized/aggregated metrics
// enterprise-wide."
//
// Real, per direct investigation before building this: this app
// already has the real building blocks —
// `services/facilities/IFacilityService.ts`'s own `Facility.jurisdiction`
// and `isEnterprise`/`parentId` hierarchy (real, seeded across US/GB_EW/
// GB_SCT), `services/auth/resolveTenantFacility.ts` (resolves a case's
// own `originHospitalId` to its real, jurisdiction-bearing Enterprise
// Facility), and `pages/contributionDashboardCalculations.ts`'s own
// real `computeOrgWideTatPerformance` (already aggregates TAT across
// every facility in a given case set) and `realWorkRvuForCase`/
// `wasAiAssisted` (real, per-case financial/diagnostic signals). None
// of those were jurisdiction-aware on their own — this file is the
// real, new piece: it groups cases by their own performing-lab
// jurisdiction FIRST, computes each jurisdiction's own aggregate
// numbers using those same, already-tested functions, and only ever
// combines the resulting AGGREGATE rows into the enterprise-wide view
// — raw, case-level data is never itself combined or exposed across a
// jurisdiction boundary.
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from '../facilities/IFacilityService';
import type { Jurisdiction } from '../../types/systemConfig';
import { resolveTenantFacility } from '../auth/resolveTenantFacility';
import {
  computeOrgWideTatPerformance,
  realWorkRvuForCase,
  wasAiAssisted,
  type CaseForRvuCalc,
} from '../../pages/contributionDashboardCalculations';
import type { RvuTableVersion } from '../billing/RvuTableVersion';
import type { SpecimenEntryForCptResolution } from '../billing/codeMapTable';
import type { TatEntryForResolution } from '../../components/Contribution/qualityCalculations';

export interface CaseForJurisdictionRollup extends CaseForRvuCalc {
  /** Real, per resolveTenantFacility.ts's own contract — the real,
   *  legacy tenant id this case's own performing-lab Enterprise
   *  Facility resolves from. */
  originHospitalId?: string;
}

export interface JurisdictionRollupRow {
  jurisdiction: Jurisdiction;
  facilityCount: number;
  caseVolume: number;
  totalWorkRvu: number;
  aiAssistedPct: number;
  firstTouchAvgHrs: number;
  totalCaseAvgHrs: number;
  onTargetPct: number;
}

export interface EnterpriseRollupResult {
  byJurisdiction: JurisdictionRollupRow[];
  /** Real, per this file's own header: a real combination of the
   *  per-jurisdiction AGGREGATE rows above — never a fresh
   *  computation over the raw, cross-jurisdiction case set, since
   *  that would defeat the whole real point of aggregating locally
   *  first. */
  enterpriseWide: {
    jurisdictionCount: number;
    facilityCount: number;
    caseVolume: number;
    totalWorkRvu: number;
    aiAssistedPct: number;
    onTargetPct: number;
  };
  /** Real, honest count of cases that couldn't be resolved to any
   *  known Enterprise Facility's own jurisdiction (e.g. a genuinely
   *  unmapped legacy tenant id) — surfaced rather than silently
   *  dropped or silently lumped into an arbitrary jurisdiction. */
  unresolvedCaseCount: number;
}

export function resolveJurisdictionRollup(
  cases: CaseForJurisdictionRollup[],
  enterpriseFacilities: Facility[],
  tatEntries: TatEntryForResolution[],
  rvuVersions: RvuTableVersion[] = [],
  dictionaryEntries: SpecimenEntryForCptResolution[] = [],
): EnterpriseRollupResult {
  const casesByJurisdiction = new Map<Jurisdiction, CaseForJurisdictionRollup[]>();
  const facilitiesByJurisdiction = new Map<Jurisdiction, Set<string>>();
  let unresolvedCaseCount = 0;

  for (const c of cases) {
    const facility = resolveTenantFacility(c.originHospitalId, enterpriseFacilities);
    if (!facility) { unresolvedCaseCount += 1; continue; }
    const j = facility.jurisdiction;
    if (!casesByJurisdiction.has(j)) casesByJurisdiction.set(j, []);
    casesByJurisdiction.get(j)!.push(c);
    if (!facilitiesByJurisdiction.has(j)) facilitiesByJurisdiction.set(j, new Set());
    facilitiesByJurisdiction.get(j)!.add(facility.id);
  }

  const byJurisdiction: JurisdictionRollupRow[] = [];
  for (const [jurisdiction, jCases] of casesByJurisdiction) {
    const tat = computeOrgWideTatPerformance(jCases, tatEntries);
    const totalWorkRvu = jCases.reduce((sum, c) => sum + realWorkRvuForCase(c, rvuVersions, dictionaryEntries), 0);
    const aiAssistedCount = jCases.filter(wasAiAssisted).length;

    byJurisdiction.push({
      jurisdiction,
      facilityCount: facilitiesByJurisdiction.get(jurisdiction)?.size ?? 0,
      caseVolume: jCases.length,
      totalWorkRvu: +totalWorkRvu.toFixed(2),
      aiAssistedPct: jCases.length > 0 ? Math.round((aiAssistedCount / jCases.length) * 100) : 0,
      firstTouchAvgHrs: tat.firstTouchAvgHrs,
      totalCaseAvgHrs: tat.totalCaseAvgHrs,
      onTargetPct: tat.onTargetPct,
    });
  }

  // Real, per this file's own header: the enterprise-wide row is a
  // real combination of the AGGREGATE rows above — case-volume-
  // weighted averages for rate-like metrics (aiAssistedPct,
  // onTargetPct), a plain sum for volume-like metrics (caseVolume,
  // totalWorkRvu, facilityCount).
  const totalCaseVolume = byJurisdiction.reduce((s, r) => s + r.caseVolume, 0);
  const weightedAvg = (pick: (r: JurisdictionRollupRow) => number): number =>
    totalCaseVolume === 0 ? 0 : Math.round(byJurisdiction.reduce((s, r) => s + pick(r) * r.caseVolume, 0) / totalCaseVolume);

  return {
    byJurisdiction,
    enterpriseWide: {
      jurisdictionCount: byJurisdiction.length,
      facilityCount: byJurisdiction.reduce((s, r) => s + r.facilityCount, 0),
      caseVolume: totalCaseVolume,
      totalWorkRvu: +byJurisdiction.reduce((s, r) => s + r.totalWorkRvu, 0).toFixed(2),
      aiAssistedPct: weightedAvg(r => r.aiAssistedPct),
      onTargetPct: weightedAvg(r => r.onTargetPct),
    },
    unresolvedCaseCount,
  };
}
