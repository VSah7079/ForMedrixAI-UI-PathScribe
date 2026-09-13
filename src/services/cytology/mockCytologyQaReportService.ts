// src/services/cytology/mockCytologyQaReportService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per ICytologyQaReportService.ts's own header: the mock
// implementation of the real, backend-shaped QA report interface.
// Internally, this still does exactly what CytologyQaTab.tsx used to
// do itself before this fix — fetch every raw record via the existing
// mock CRUD services, filter by scope, and call the real Phase 49
// resolver functions. That's genuinely fine for a mock: the point of
// this file's existence isn't to make the mock itself fast, it's to
// put a real, stable interface boundary between "where the data
// happens to live today" and "what a caller is allowed to assume."
// A real, future implementation of ICytologyQaReportService can
// replace every one of these method bodies with a real server-side
// query, and CytologyQaTab.tsx — the only real caller — needs zero
// changes to keep working.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { QaScope } from '@/services/qualityAssurance/qaScope';
import { caseMatchesScope } from '@/services/qualityAssurance/qaScope';
import type { RegistryId } from '@/services/facilities/IRegistrySettingsService';
import type { ICytologyQaReportService } from './ICytologyQaReportService';
import { mockCytologyReviewRecordService } from './mockCytologyReviewRecordService';
import { mockCytologyCategoryService } from './mockCytologyCategoryService';
import { mockCytologyRegistryOutboundQueueService } from './mockCytologyRegistryOutboundQueueService';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { mockCytologyWorkloadLedgerService } from './mockCytologyWorkloadLedgerService';
import { mockCytologyWorkloadCapSettingsService } from './mockCytologyWorkloadCapSettingsService';
import { caseRouter } from '@/services/cases/CaseRouter';
import { getSessionUser, canViewCrossTenantQaData } from '@/services/auth/caseAccessControl';
import { qaActivityRecordService } from '@/services';
import { mockFacilityService } from '@/services/facilities/mockFacilityService';
import { GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID, CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import { resolveCytologyHistologyCorrelationReport } from './resolveCytologyHistologyCorrelationReport';
import { isUnsatisfactoryAdequacy } from './classifyCytologyAgreement';
import { resolveCytologyUnscreenedBacklogReport } from './resolveCytologyUnscreenedBacklogReport';
import { resolveCytologyPrimaryHpvFailsafeAuditReport } from './resolveCytologyPrimaryHpvFailsafeAuditReport';
import { resolveCytologyEuComplianceMatrixReport } from './resolveCytologyEuComplianceMatrixReport';
import { resolveCytologyHpvPositivityMonitorReport, type CytologyHpvIndicationType } from './resolveCytologyHpvPositivityMonitorReport';
import { mockMolecularQcRunRecordService } from './mockMolecularQcRunRecordService';
import { mockCytologyProficiencyTestResultService } from './mockCytologyProficiencyTestResultService';
import { resolveCytologyMolecularQcFailureRateReport } from './resolveCytologyMolecularQcFailureRateReport';
import { resolveCytologyMolecularLotToLotTrendReport } from './resolveCytologyMolecularLotToLotTrendReport';
import { resolveCytologyApacProficiencyTestReport } from './resolveCytologyApacProficiencyTestReport';
import type { CytologyReviewRecord } from '@/types/cytology/CytologyReviewRecord';
import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import {
  resolveCytology10PercentRandomRescreeningReport,
  resolveCytologyDirectedHighRiskRescreeningReport,
  resolveCytologyCtVsPathologistCorrelationReport,
  resolveCytologyPostSignOutPeerReviewCorrelationReport,
} from './resolveCytologyQaReports';
import type { CytologySpecimenFinalDiagnosisRef } from './resolveCytologyPeerReviewComparisonPairs';
import { resolveCytologyCtStatisticalComparisonReport } from './resolveCytologyCtStatisticalComparisonReport';
import { resolveCytologyAscusHpvReflexReport, type CytologySpecimenHpvContext } from './resolveCytologyAscusHpvReflexReport';
import { resolveCytologyWorkloadTrackingReport } from './resolveCytologyWorkloadTrackingReport';
import { resolveCytologyRegistryTransmissionAuditReport } from './resolveCytologyRegistryTransmissionAuditReport';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

/** Real, shared fetch-and-scope step every review-based report needs.
 *  Real, honest note matching this file's own header: in a real
 *  backend, `scope` would become a real WHERE clause evaluated by the
 *  database itself, not a client-side array filter run after fetching
 *  everything — this mock's own real limitation, not the interface's. */
async function fetchScopedReviewsAndCategories(scope: QaScope) {
  const session = getSessionUser();
  const crossTenant = canViewCrossTenantQaData(session);
  const [reviewsRes, categoriesRes, casesRes] = await Promise.all([
    mockCytologyReviewRecordService.getAll(),
    mockCytologyCategoryService.getAll(),
    caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: crossTenant }),
  ]);
  const caseById: Record<string, any> = {};
  if (casesRes.ok) for (const c of casesRes.data as any[]) caseById[c.id] = c;
  const reviews: CytologyReviewRecord[] = reviewsRes.ok ? reviewsRes.data : [];
  const categories: CytologyCategoryEntry[] = categoriesRes.ok ? categoriesRes.data : [];
  const scopedReviews = reviews.filter(r => caseMatchesScope(caseById[r.caseId] ?? {}, scope));
  return { scopedReviews, categories, caseById };
}

export const mockCytologyQaReportService: ICytologyQaReportService = {
  async get10PercentRandomRescreeningReport(scope) {
    const { scopedReviews, categories } = await fetchScopedReviewsAndCategories(scope);
    return ok(resolveCytology10PercentRandomRescreeningReport(scopedReviews, categories));
  },

  async getDirectedHighRiskRescreeningReport(scope) {
    const { scopedReviews, categories } = await fetchScopedReviewsAndCategories(scope);
    return ok(resolveCytologyDirectedHighRiskRescreeningReport(scopedReviews, categories));
  },

  async getCtVsPathologistCorrelationReport(scope) {
    const { scopedReviews, categories } = await fetchScopedReviewsAndCategories(scope);
    return ok(resolveCytologyCtVsPathologistCorrelationReport(scopedReviews, categories));
  },

  async getPostSignOutPeerReviewCorrelationReport(scope) {
    const { scopedReviews, categories, caseById } = await fetchScopedReviewsAndCategories(scope);
    const specimenFinalDiagnoses: CytologySpecimenFinalDiagnosisRef[] = [];
    for (const c of Object.values(caseById) as any[]) {
      if (!caseMatchesScope(c, scope)) continue;
      for (const sp of c?.specimens ?? []) {
        const reviewRecordId = sp?.cytologyScreening?.finalDiagnosis?.reviewRecordId;
        if (reviewRecordId) specimenFinalDiagnoses.push({ specimenId: sp.id, caseId: c.id, finalDiagnosisReviewRecordId: reviewRecordId });
      }
    }
    return ok(resolveCytologyPostSignOutPeerReviewCorrelationReport(scopedReviews, specimenFinalDiagnoses, categories));
  },

  async getGynCytologySecondaryScreeningAuditReport(scope) {
    const [recordsRes, casesRes] = await Promise.all([
      qaActivityRecordService.getAll(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: canViewCrossTenantQaData(getSessionUser()) }),
    ]);
    const caseById: Record<string, any> = {};
    if (casesRes.ok) for (const c of casesRes.data as any[]) caseById[c.id] = c;
    const records = recordsRes.ok ? recordsRes.data : [];
    const scoped = records.filter(
      r => r.activityTypeId === GYN_CYTOLOGY_SECONDARY_SCREENING_ACTIVITY_TYPE_ID && caseMatchesScope(caseById[r.caseId] ?? {}, scope),
    );
    return ok(scoped);
  },

  async getHistologyCorrelationReport(scope) {
    const [recordsRes, casesRes] = await Promise.all([
      qaActivityRecordService.getAll(),
      caseRouter.getAll(undefined, { includeOrchestration: true, bypassAccessControl: canViewCrossTenantQaData(getSessionUser()) }),
    ]);
    const caseById: Record<string, any> = {};
    if (casesRes.ok) for (const c of casesRes.data as any[]) caseById[c.id] = c;
    const records = recordsRes.ok ? recordsRes.data : [];
    const scoped = records.filter(
      r => r.activityTypeId === CYTO_HISTO_CORRELATION_ACTIVITY_TYPE_ID && caseMatchesScope(caseById[r.caseId] ?? {}, scope),
    );

    // Real, per this report's own resolver: case info keyed by the
    // real cytology caseId (the record's own caseId) and, separately,
    // by every real histologyCaseId referenced in fieldValues — a
    // given case can appear in both roles across different records,
    // so both lookups draw from the same real caseById map.
    const buildCaseInfo = (c: any): { patientMrn?: string; accessionNumber?: string; specimenDate?: string } => {
      const specimens = (c?.specimens as any[]) ?? [];
      const specimenDate = specimens.map(sp => sp.receivedAt).filter(Boolean).sort()[0];
      return { patientMrn: c?.patient?.mrn, accessionNumber: c?.accession?.accessionNumber, specimenDate };
    };
    const cytologyCaseInfoById: Record<string, ReturnType<typeof buildCaseInfo>> = {};
    const histologyCaseInfoById: Record<string, ReturnType<typeof buildCaseInfo>> = {};
    for (const r of scoped) {
      if (caseById[r.caseId]) cytologyCaseInfoById[r.caseId] = buildCaseInfo(caseById[r.caseId]);
      const histCaseId = r.fieldValues.histologyCaseId as string | undefined;
      if (histCaseId && caseById[histCaseId]) histologyCaseInfoById[histCaseId] = buildCaseInfo(caseById[histCaseId]);
    }

    return ok(resolveCytologyHistologyCorrelationReport(scoped, cytologyCaseInfoById, histologyCaseInfoById));
  },

  async getCtStatisticalComparisonReport(scope) {
    const { scopedReviews, categories } = await fetchScopedReviewsAndCategories(scope);
    const primaryScreenReviews = scopedReviews.filter(r => r.role === 'primary_screen');
    return ok(resolveCytologyCtStatisticalComparisonReport(primaryScreenReviews, categories));
  },

  async getAscusHpvReflexReport(scope) {
    const { scopedReviews, categories, caseById } = await fetchScopedReviewsAndCategories(scope);
    const primaryScreenReviews = scopedReviews.filter(r => r.role === 'primary_screen');
    const specimenHpvBySpecimenId: Record<string, CytologySpecimenHpvContext> = {};
    for (const c of Object.values(caseById) as any[]) {
      for (const sp of c?.specimens ?? []) {
        if (sp?.cytologyScreening) {
          specimenHpvBySpecimenId[sp.id] = { hpvOrderReason: sp.cytologyScreening.hpvOrderReason, hpvResult: sp.cytologyScreening.hpvResult };
        }
      }
    }
    return ok(resolveCytologyAscusHpvReflexReport(primaryScreenReviews, categories, specimenHpvBySpecimenId));
  },

  async getWorkloadTrackingReport(_scope) {
    // Real, honest scope note: workload ledger entries carry no real
    // facility/client field of their own to filter by yet — real,
    // separate follow-on if per-scope workload filtering is wanted;
    // this real report is Enterprise-wide until then, matching the
    // exact real limitation already flagged in Phase 50's own README
    // note about the Enterprise-only cap.
    const [ledgerRes, capRes] = await Promise.all([
      mockCytologyWorkloadLedgerService.getAll(),
      mockCytologyWorkloadCapSettingsService.get(),
    ]);
    const ledgerEntries = ledgerRes.ok ? ledgerRes.data : [];
    const enterpriseCap = capRes.ok ? capRes.data.dailySlideCap : 100;
    return ok(resolveCytologyWorkloadTrackingReport(ledgerEntries, {}, enterpriseCap));
  },

  async getRegistryTransmissionAuditReport(_scope, registryId: RegistryId) {
    const queueRes = await mockCytologyRegistryOutboundQueueService.getAll();
    const queueEntries = queueRes.ok ? queueRes.data : [];
    const caseIds = Array.from(new Set(queueEntries.map(e => e.caseId)));
    const signOutResults = await Promise.all(caseIds.map(id => mockCytologySignOutRecordService.getByCaseId(id)));
    const signOutByCaseId: Record<string, CytologySignOutRecord[]> = {};
    signOutResults.forEach((res, i) => { if (res.ok) signOutByCaseId[caseIds[i]] = res.data; });
    return ok(resolveCytologyRegistryTransmissionAuditReport(queueEntries, signOutByCaseId, registryId));
  },

  async getUnscreenedBacklogReport(scope) {
    const { scopedReviews, caseById } = await fetchScopedReviewsAndCategories(scope);
    const reviewedSpecimenIds = new Set(scopedReviews.map(r => r.specimenId));
    const cases = Object.values(caseById) as any[];
    const caseIds = cases.filter(c => caseMatchesScope(c, scope)).map(c => c.id);
    const signOutResults = await Promise.all(caseIds.map(id => mockCytologySignOutRecordService.getByCaseId(id)));
    const signedOutSpecimenIds = new Set<string>();
    signOutResults.forEach(res => { if (res.ok) for (const s of res.data) signedOutSpecimenIds.add(s.specimenId); });

    const backlogSpecimens = [];
    for (const c of cases) {
      if (!caseMatchesScope(c, scope)) continue;
      for (const sp of c?.specimens ?? []) {
        if (!sp?.cytologyScreening) continue; // real, only cytology-relevant specimens belong in this report
        if (signedOutSpecimenIds.has(sp.id)) continue; // real, already-signed-out specimens are not backlog
        backlogSpecimens.push({
          caseId: c.id, specimenId: sp.id, accessionId: c?.accession?.accessionNumber,
          collectedAt: sp.collectedAt, receivedAt: sp.receivedAt,
          hasAnyReview: reviewedSpecimenIds.has(sp.id),
        });
      }
    }
    return ok(resolveCytologyUnscreenedBacklogReport(backlogSpecimens, new Date()));
  },

  async getPrimaryHpvFailsafeAuditReport(scope) {
    const [{ scopedReviews, caseById, categories }, facilitiesRes] = await Promise.all([
      fetchScopedReviewsAndCategories(scope),
      mockFacilityService.getAll(),
    ]);
    const jurisdictionByFacilityId: Record<string, string> = {};
    if (facilitiesRes.ok) for (const f of facilitiesRes.data) jurisdictionByFacilityId[f.id] = f.jurisdiction;

    const UK_JURISDICTIONS = new Set(['GB_EW', 'GB_SCT', 'GB_NIR']);
    const primaryScreenBySpecimenId = new Map(scopedReviews.filter(r => r.role === 'primary_screen').map(r => [r.specimenId, r]));

    const inputs = [];
    for (const c of Object.values(caseById) as any[]) {
      if (!caseMatchesScope(c, scope)) continue;
      const jurisdiction = jurisdictionByFacilityId[c?.order?.facilityId];
      if (!jurisdiction || !UK_JURISDICTIONS.has(jurisdiction)) continue;
      for (const sp of c?.specimens ?? []) {
        if (!sp?.cytologyScreening) continue;
        const triageReview = primaryScreenBySpecimenId.get(sp.id);
        inputs.push({
          jurisdiction,
          hpvPositive: sp.cytologyScreening.hpvResult === 'Positive',
          cytologyTriagePerformed: !!triageReview,
          cytologyTriageInadequate: triageReview ? isUnsatisfactoryAdequacy(triageReview.adequacySelections?.map((s: any) => s.categoryId), categories) : false,
        });
      }
    }
    return ok(resolveCytologyPrimaryHpvFailsafeAuditReport(inputs));
  },

  async getEuComplianceMatrixReport(scope) {
    const [{ caseById }, facilitiesRes, recordsRes] = await Promise.all([
      fetchScopedReviewsAndCategories(scope),
      mockFacilityService.getAll(),
      qaActivityRecordService.getAll(),
    ]);
    const jurisdictionByFacilityId: Record<string, string> = {};
    if (facilitiesRes.ok) for (const f of facilitiesRes.data) jurisdictionByFacilityId[f.id] = f.jurisdiction;

    const EU_JURISDICTIONS = new Set(['FR', 'DE', 'NL', 'BE', 'IE']);
    const inputs = [];
    const countryByCaseId: Record<string, string> = {};
    for (const c of Object.values(caseById) as any[]) {
      if (!caseMatchesScope(c, scope)) continue;
      const jurisdiction = jurisdictionByFacilityId[c?.order?.facilityId];
      if (!jurisdiction || !EU_JURISDICTIONS.has(jurisdiction)) continue;
      countryByCaseId[c.id] = jurisdiction;
      for (const sp of c?.specimens ?? []) {
        if (!sp?.cytologyScreening) continue;
        const hpvOrderReason = sp.cytologyScreening.hpvOrderReason;
        inputs.push({
          countryCode: jurisdiction,
          hpvStatus: hpvOrderReason === 'co_test' ? 'co_test' as const : hpvOrderReason ? 'primary' as const : 'not_applicable' as const,
        });
      }
    }

    const records = recordsRes.ok ? recordsRes.data : [];
    const nonConformityCountByCountry: Record<string, number> = {};
    for (const r of records) {
      if (r.outcome !== 'discordant') continue;
      const country = countryByCaseId[r.caseId];
      if (!country) continue;
      nonConformityCountByCountry[country] = (nonConformityCountByCountry[country] ?? 0) + 1;
    }

    return ok(resolveCytologyEuComplianceMatrixReport(inputs, nonConformityCountByCountry));
  },

  async getHpvPositivityMonitorReport(scope) {
    const { caseById } = await fetchScopedReviewsAndCategories(scope);
    const inputs = [];
    for (const c of Object.values(caseById) as any[]) {
      if (!caseMatchesScope(c, scope)) continue;
      const testingSite = c?.order?.facilityId ?? 'Unknown Site';
      for (const sp of c?.specimens ?? []) {
        const screening = sp?.cytologyScreening;
        // Real, only genuinely completed HPV tests belong in a
        // positivity monitor — Pending/Not Performed/undefined are
        // not real results to tally.
        if (screening?.hpvResult !== 'Positive' && screening?.hpvResult !== 'Negative') continue;
        const indicationType: CytologyHpvIndicationType = screening.hpvOrderReason === 'co_test' ? 'co_testing'
          : screening.hpvOrderReason === 'ascus_reflex' ? 'ascus_triage'
          : screening.hpvOrderReason === 'post_treatment_surveillance' ? 'post_treatment_follow_up'
          : 'primary_screening';
        const genotype = screening.hpvGenotypeDetail;
        inputs.push({
          testingSite,
          indicationType,
          hpvPositive: screening.hpvResult === 'Positive',
          hpv16Positive: !!genotype?.hpv16,
          hpv18Or45Positive: !!genotype?.hpv18Or45,
          otherHrPositive: !!genotype?.otherHighRisk,
        });
      }
    }
    return ok(resolveCytologyHpvPositivityMonitorReport(inputs));
  },

  // Real, per direct instruction ("synthesize synthetic values and
  // add them to the seed"): MOL-QA-02 and MOL-QA-04 both read the same
  // real MolecularQcRunRecord seed data. Real, honest scope note: an
  // instrument QC run has no real case/facility linkage in this data
  // model — it's real, lab-wide operational data, not scoped clinical
  // data — so _scope is accepted for interface consistency with every
  // other report here, but genuinely has nothing to filter against.
  async getMolecularQcFailureRateReport(_scope) {
    const runsRes = await mockMolecularQcRunRecordService.getAll();
    const runs = runsRes.ok ? runsRes.data : [];
    return ok(resolveCytologyMolecularQcFailureRateReport(runs));
  },

  async getMolecularLotToLotTrendReport(_scope) {
    const runsRes = await mockMolecularQcRunRecordService.getAll();
    const runs = runsRes.ok ? runsRes.data : [];
    return ok(resolveCytologyMolecularLotToLotTrendReport(runs));
  },

  // Real, per direct guidance on APAC-QA-01 — real, honest scope
  // note, same reasoning as the two molecular reports above: a real
  // PT grade is real, lab-wide operational data (the whole lab's own
  // real EQA performance), not scoped clinical data — _scope is
  // accepted for interface consistency, but genuinely has nothing to
  // filter against.
  async getApacProficiencyTestReport(_scope) {
    const resultsRes = await mockCytologyProficiencyTestResultService.getAll();
    const results = resultsRes.ok ? resultsRes.data : [];
    return ok(resolveCytologyApacProficiencyTestReport(results));
  },
};
