// src/pages/CytologyWorklistPage/CytologyWorklistPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real Cytotech worklist — "their assigned cases and pool worklist,"
// per direct guidance. Deliberately NOT a second worklist destination
// for Pathologists — cytology cases needing pathologist review are
// real, separate, later work to surface within the existing
// /worklist instead (per direct guidance's own explicit constraint:
// "I do not want to send the Pathologist to multiple worklist").
//
// Real, per direct follow-up: three real tiles, matching the existing
// WorklistPage.tsx's own real stat-tile pattern (a colored, glowing,
// count-bearing tile row) more closely than this page's earlier,
// plainer tab design — My Worklist (default), Pool, and a genuinely
// new third tile, QC, for cases already flagged for mandatory QC and
// awaiting that specific review. QC is a real, distinct pool from the
// general one: a never-yet-screened case sits in Pool; a case
// already screened but flagged for mandatory rescreen sits in QC —
// conflating them would hide exactly the cases CLIA/CAP most need
// visible and actionable.
//
// Real, deliberate reuse rather than a parallel system: case
// visibility via caseRouter.listCasesForUser (the same real, secure,
// tenant-scoped entry point WorklistPage.tsx uses), assignment via the
// same real Case.order.assignedTo/CaseStatus.pool fields, and pool
// claim/pass via the same real claimPoolCase/acceptPoolCase/passPoolCase
// service functions WorklistPage.tsx's own PoolClaimModal calls.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import { useAuth } from '@contexts/AuthContext';
import { caseRouter } from '@/services/cases/CaseRouter';
import { processInboundHpvResultEvent } from '@/services/hl7/processInboundHpvResultEvent';
import { claimPoolCase, acceptPoolCase, passPoolCase } from '@/services/cases/mockCaseService';
import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';
import { mockCytologyRoutingSettingsService } from '@/services/cytology/mockCytologyRoutingSettingsService';
import { mockFacilityCytologyRoutingOverrideService } from '@/services/cytology/mockFacilityCytologyRoutingOverrideService';
import { mockCytologyScreeningStrategyService } from '@/services/cytology/mockCytologyScreeningStrategyService';
import { mockAiScreeningResultService } from '@/services/digitalPathology/mockAiScreeningResultService';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';
import { mockFacilityCytologyScreeningStrategyOverrideService } from '@/services/cytology/mockFacilityCytologyScreeningStrategyOverrideService';
import { mockCytologyReviewRecordService } from '@/services/cytology/mockCytologyReviewRecordService';
import { resolveEffectiveCytologyRoutingSettings } from '@/services/cytology/resolveEffectiveCytologyRoutingSettings';
import { resolveEffectiveCytologyScreeningStrategy } from '@/services/cytology/resolveEffectiveCytologyScreeningStrategy';
import { resolveEffectiveCytologyScreeningStrategyForPatient } from '@/services/cytology/resolveEffectiveCytologyScreeningStrategyForPatient';
import { resolveAgeFromDateOfBirth } from '@/services/cytology/resolveAgeFromDateOfBirth';
import { resolveCaseCytologyWorklistMembership } from '@/services/cytology/resolveCaseCytologyWorklistMembership';
import { resolveCaseCytologyTriagePendingMembership } from '@/services/cytology/resolveCaseCytologyTriagePendingMembership';
import { resolveCaseCytologyScansCompletedMembership } from '@/services/cytology/resolveCaseCytologyScansCompletedMembership';
import { mockCytologyInstrumentationService } from '@/services/cytology/mockCytologyInstrumentationService';
import { mockWsiScanBatchService } from '@/services/digitalPathology/mockWsiScanBatchService';
import { resolveCaseCytologyRecallNeededMembership } from '@/services/cytology/resolveCaseCytologyRecallNeededMembership';
import { resolveCytologyQcPoolMembership } from '@/services/cytology/resolveCytologyQcPoolMembership';
import { resolveCytologyRetrospectiveReviewPoolMembership } from '@/services/cytology/resolveCytologyRetrospectiveReviewPoolMembership';
import { resolveCytologyPostSignOutPeerReviewPoolMembership } from '@/services/cytology/resolveCytologyPostSignOutPeerReviewPoolMembership';
import { resolveCytologyHistologyCorrelationPoolMembership } from '@/services/cytology/resolveCytologyHistologyCorrelationPoolMembership';
import { resolveCytologyDecantPendingMembership } from '@/services/cytology/resolveCytologyDecantPendingMembership';
import { resolveSpecimenEntryMatchesCategory } from '@/services/specimenDictionary/resolveSpecimenEntryMatchesCategory';
import { resolveCytologyRoseActiveMembership } from '@/services/cytology/resolveCytologyRoseActiveMembership';
import type { Case } from '@/types/case/Case';
import type { NonGynCytologyRouting } from '@/services/cytology/ICytologyRoutingSettingsService';
import { formatFullDisplayName } from '@/utils/personName';
import { useSynopticFlags } from '@/pages/Synoptic/useSynopticFlags';
import FlagManagerModal from '@/components/Flags/FlagManagerModal';

type Tab = 'assigned' | 'pool' | 'qc' | 'hpv_triage' | 'recall_needed' | 'csms_qa' | 'retrospective_lookback' | 'post_signout_peer_review' | 'histology_correlation' | 'scans_completed' | 'cell_block_ancillary_pending' | 'rose_active';
type CytologyDomain = 'gyn' | 'non_gyn';

// Real, per direct guidance's own confirmed domain split: "Because GYN
// and Non-GYN have completely different regulatory workflows, Bethesda
// classifications, cell block tracking, and sub-filter needs, trying
// to jam both into a single tile set will force awkward UI
// compromises." Two real, separate primary tile sets, swapped by the
// real domain switcher below — not a single, shared row relabeled.
const GYN_TILES: { key: Tab; label: string; color: string }[] = [
  { key: 'assigned',   label: 'My Worklist', color: '#009E73' },
  { key: 'pool',       label: 'Pool',        color: '#F97316' },
  { key: 'qc',         label: 'QC / Rescreen', color: '#EF4444' },
  { key: 'hpv_triage', label: 'HPV Triage',  color: '#8B5CF6' },
];
const NON_GYN_TILES: { key: Tab; label: string; color: string }[] = [
  { key: 'assigned', label: 'My Worklist',     color: '#009E73' },
  { key: 'pool',     label: 'Unassigned Pool', color: '#F97316' },
  { key: 'cell_block_ancillary_pending', label: 'Cell Block / Ancillary Pending', color: '#EAB308' },
  { key: 'rose_active', label: 'ROSE / Bedside Evaluations', color: '#EC4899' },
];
// Real, per direct guidance's own earlier resolution: these serve a
// genuinely different, QA/compliance-aggregate purpose than the real,
// day-to-day GYN/Non-GYN screening domains above — kept as their own,
// separate secondary section, not folded into either domain's own
// primary tile set.
const QA_COMPLIANCE_TILES: { key: Tab; label: string; color: string }[] = [
  { key: 'recall_needed', label: 'Recall Needed',  color: '#DC2626' },
  { key: 'csms_qa',       label: 'CSMS QA',        color: '#0EA5E9' },
  { key: 'retrospective_lookback', label: '5-Year Lookback', color: '#A855F7' },
  { key: 'post_signout_peer_review', label: 'Peer Review', color: '#14B8A6' },
  { key: 'histology_correlation', label: 'Histology Correlation', color: '#F472B6' },
  { key: 'scans_completed', label: 'Scans Completed', color: '#22C55E' },
];

interface CytologyWorklistCase {
  caseData: Case;
  specimenId: string | null;
  /** Real, per direct guidance's own confirmed domain split ("GYN and
   *  Non-GYN have completely different regulatory workflows...")
   *  — resolved from the same real specimen-dictionary entry's own
   *  isGynCytology flag CytologyScreeningPage.tsx already uses,
   *  never a second, separate determination. */
  isGynCytology: boolean;
  /** Real, per direct guidance's own Specimen Auto-Categorization
   *  spec — resolved from the same real specimen-dictionary entry
   *  isGynCytology already uses, never a second, separate lookup.
   *  Undefined for a real GYN case, or a real Non-GYN case whose own
   *  dictionary entry has no organSite configured yet. */
  organSite?: string;
  isQcPending: boolean;
  isRetrospectiveReviewPending: boolean;
  isPostSignOutPeerReviewPending: boolean;
  isHistologyCorrelationPending: boolean;
  /** Real, per direct guidance's own Step 4 ask — true when any real
   *  decant on this case's own cytology specimen still has a
   *  genuinely unfinished stain order. See
   *  resolveCytologyDecantPendingMembership.ts. */
  isCellBlockAncillaryPending: boolean;
  /** Real, per direct guidance's own Step 4 ask — true when this
   *  case's own cytology specimen has a real ROSE evaluation
   *  performed within the real, recent window. See
   *  resolveCytologyRoseActiveMembership.ts. */
  isRoseActive: boolean;
  /** Real, per direct guidance's own real mechanism: true when this
   *  case carries a real, active 'f36' (CSMS Eligibility Verification
   *  Needed) flag — raised automatically at real UK CSMS registry
   *  dispatch, since PathScribe has no real eligibility/suspension
   *  data source of its own. Surfaced here so a human in the real
   *  Cytology QA group can find and resolve it. */
  isCsmsQaPending: boolean;
  /** Real, per RFP-APLIS-2026-GLOBAL Story 10 (Cytology Assist FOV
   *  Ingestion) — the real, most-recent completed AI screening
   *  result for this case, if any real vendor has reported one.
   *  Undefined for a case with no real AI order/result at all, never
   *  a fabricated default. */
  aiScreeningResult?: AiScreeningResult;
}

const CytologyWorklistPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Real, per direct guidance's own explicit spec: "Home > Cytology
  // Workspace" breadcrumb navigation across Cytology sub-routes —
  // reuses the app's own real, existing BreadcrumbContext mechanism
  // (the same one BatchManagementPage.tsx and others already use),
  // not a new, separate breadcrumb system.
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('cytologyWorklist.breadcrumbLabel'), '/cytology-worklist'); }, [pushCrumb, t]);
  const [rows, setRows]             = useState<CytologyWorklistCase[]>([]);
  const [triageRows, setTriageRows] = useState<Case[]>([]);
  const [scansCompletedRows, setScansCompletedRows] = useState<Case[]>([]);
  const [recallRows, setRecallRows] = useState<Case[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<Tab>('assigned');
  const [domain, setDomain] = useState<CytologyDomain>('gyn');
  // Real, per direct guidance's own Organ/Site Quick-Filter Chips ask
  // — a real, additional narrowing within the current Non-GYN tab
  // (My Worklist/Pool/etc.), not a separate tab of its own. Reset
  // whenever the domain changes so a stale GYN-side filter never
  // silently persists into Non-GYN or vice versa.
  const [organSiteFilter, setOrganSiteFilter] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  // Real, per direct guidance: "The flag can be removed like other
  // case or specimen flags." useSynopticFlags/FlagManagerModal are
  // already fully generic (despite the "Synoptic" name) — reused
  // directly here rather than building a second, cytology-specific
  // flag-removal mechanism. The hook's own caseId argument is only
  // ever used as a real, rarely-needed accession-number fallback;
  // openFlagManager takes the real, actual case to manage directly.
  const { flagCaseData, flagDefinitions, showFlagManager, setShowFlagManager, openFlagManager, onApplyFlags, onRemoveFlag } = useSynopticFlags('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [allCases, dictRes, enterpriseRes, enterpriseStrategyRes, aiScreeningRes] = await Promise.all([
        caseRouter.listCasesForUser(user.id),
        mockSpecimenDictionaryService.getAll(),
        mockCytologyRoutingSettingsService.get(),
        mockCytologyScreeningStrategyService.get(),
        mockAiScreeningResultService.getAll(),
      ]);
      const dictionary = dictRes.ok ? dictRes.data : [];
      const enterpriseDefault = enterpriseRes.ok ? enterpriseRes.data : { nonGynCytologyRouting: 'surgical_pathology_worklist' as NonGynCytologyRouting };
      const enterpriseStrategyDefault = enterpriseStrategyRes.ok ? enterpriseStrategyRes.data : { screeningStrategy: 'co_testing' as const };
      // Real, per RFP-APLIS-2026-GLOBAL Story 10 (Cytology Assist FOV
      // Ingestion) — the real gap this closes: the existing
      // AiScreeningResult system had no consumer anywhere in the
      // technician's own live screening queue. Most-recent completed
      // result per case, since a case could in principle carry more
      // than one real AI screening order over its own lifecycle.
      const aiResultByCaseId = new Map<string, AiScreeningResult>();
      if (aiScreeningRes.ok) {
        for (const r of aiScreeningRes.data) {
          if (r.status !== 'completed') continue;
          const existing = aiResultByCaseId.get(r.caseId);
          if (!existing || (r.completedAt ?? '') > (existing.completedAt ?? '')) aiResultByCaseId.set(r.caseId, r);
        }
      }

      // Real, per-case effective routing: resolve every distinct real
      // facilityId present just once each, not once per case.
      const facilityIds = Array.from(new Set(allCases.map(c => c.order?.facilityId).filter((id): id is string => !!id)));
      const overrideEntries = await Promise.all(
        facilityIds.map(async id => [id, await mockFacilityCytologyRoutingOverrideService.getForFacility(id)] as const)
      );
      const overridesByFacility = new Map(overrideEntries.map(([id, res]) => [id, res.ok ? res.data : null]));

      // Real, per-case effective screening strategy — same real,
      // per-facility resolution pattern as routing, above.
      const strategyOverrideEntries = await Promise.all(
        facilityIds.map(async id => [id, await mockFacilityCytologyScreeningStrategyOverrideService.getForFacility(id)] as const)
      );
      const strategyOverridesByFacility = new Map(strategyOverrideEntries.map(([id, res]) => [id, res.ok ? res.data : null]));

      const dictById = new Map(dictionary.map(e => [e.id, e]));

      const cytologyCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const facilityEffectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        const patientAge = resolveAgeFromDateOfBirth(c.patient?.dateOfBirth);
        const effectiveScreeningStrategy = resolveEffectiveCytologyScreeningStrategyForPatient(facilityEffectiveStrategy, patientAge);
        return resolveCaseCytologyWorklistMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveScreeningStrategy);
      });

      // Real, per direct guidance's own "HPV-First" triage — a real,
      // separate set of cases: genuinely different from cytologyCases
      // above, which only ever contains cases eligible for screening.
      const triagePendingCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const facilityEffectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        const patientAge = resolveAgeFromDateOfBirth(c.patient?.dateOfBirth);
        const effectiveScreeningStrategy = resolveEffectiveCytologyScreeningStrategyForPatient(facilityEffectiveStrategy, patientAge);
        return resolveCaseCytologyTriagePendingMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveScreeningStrategy);
      });
      setTriageRows(triagePendingCases);

      // Real, per direct follow-up on Cytology Assisted Instrumentation
      // — a real, separate set of cases whose WSI scans are done and
      // are ready to screen now, distinct from cytologyCases above
      // (which doesn't distinguish scan status at all).
      const [instrumentationRes, allBatchesRes] = await Promise.all([
        mockCytologyInstrumentationService.get(),
        mockWsiScanBatchService.getAll(),
      ]);
      const instrumentationModality = instrumentationRes.ok ? instrumentationRes.data.modality : 'wsi';
      const allBatches = allBatchesRes.ok ? allBatchesRes.data : [];
      const scansCompletedCases = allCases.filter(c =>
        resolveCaseCytologyScansCompletedMembership(c.id, c.specimens as any, allBatches, instrumentationModality),
      );
      setScansCompletedRows(scansCompletedCases);

      // Real, per direct guidance's own Australia/NZ NCSP information:
      // a real, distinct set of cases — a positive result on a
      // self-collected specimen, needing patient recall for a new,
      // clinician-collected specimen, never eligible for cytology
      // screening from the specimen already on hand.
      const recallNeededCases = allCases.filter(c => {
        const facilityId = c.order?.facilityId;
        const facilityOverride = facilityId ? overridesByFacility.get(facilityId) ?? null : null;
        const effective = resolveEffectiveCytologyRoutingSettings(enterpriseDefault, facilityOverride);
        const facilityStrategyOverride = facilityId ? strategyOverridesByFacility.get(facilityId) ?? null : null;
        const facilityEffectiveStrategy = resolveEffectiveCytologyScreeningStrategy(enterpriseStrategyDefault, facilityStrategyOverride);
        const patientAge = resolveAgeFromDateOfBirth(c.patient?.dateOfBirth);
        const effectiveScreeningStrategy = resolveEffectiveCytologyScreeningStrategyForPatient(facilityEffectiveStrategy, patientAge);
        return resolveCaseCytologyRecallNeededMembership(c.specimens as any, dictionary, effective.nonGynCytologyRouting, effectiveScreeningStrategy);
      });
      setRecallRows(recallNeededCases);

      // Real, per-case QC pool membership — needs each qualifying
      // specimen's own real review history to resolve.
      const withQcStatus = await Promise.all(cytologyCases.map(async c => {
        let cytoDictEntry: any = undefined;
        const cytoSpecimen = c.specimens?.find((sp: any) => {
          const entry = sp.specimenDictionaryEntryId ? dictById.get(sp.specimenDictionaryEntryId) : undefined;
          if (entry && (entry.type === 'Cytology' || entry.type === 'FNA')) { cytoDictEntry = entry; return true; }
          return false;
        }) as any;
        const isGynCytology = resolveSpecimenEntryMatchesCategory(cytoDictEntry, ['GYN_CYTOLOGY']);
        const organSite = cytoDictEntry?.organSite;
        const specimenId = cytoSpecimen?.id ?? null;
        let isQcPending = false;
        let isRetrospectiveReviewPending = false;
        if (specimenId && cytoSpecimen?.cytologyScreening?.qcFlag) {
          const reviewsRes = await mockCytologyReviewRecordService.getBySpecimenId(specimenId);
          const reviews = reviewsRes.ok ? reviewsRes.data : [];
          isQcPending = resolveCytologyQcPoolMembership(cytoSpecimen.cytologyScreening.qcFlag, reviews);
        }
        if (cytoSpecimen?.cytologyScreening?.retrospectiveReviewFlag) {
          isRetrospectiveReviewPending = resolveCytologyRetrospectiveReviewPoolMembership(cytoSpecimen.cytologyScreening.retrospectiveReviewFlag);
        }
        let isPostSignOutPeerReviewPending = false;
        if (specimenId && cytoSpecimen?.cytologyScreening?.postSignOutPeerReviewFlag) {
          const reviewsRes = await mockCytologyReviewRecordService.getBySpecimenId(specimenId);
          const reviews = reviewsRes.ok ? reviewsRes.data : [];
          isPostSignOutPeerReviewPending = resolveCytologyPostSignOutPeerReviewPoolMembership(cytoSpecimen.cytologyScreening.postSignOutPeerReviewFlag, reviews);
        }
        const isHistologyCorrelationPending = resolveCytologyHistologyCorrelationPoolMembership(cytoSpecimen?.cytologyScreening?.histologyCorrelationCandidates);
        const isCellBlockAncillaryPending = resolveCytologyDecantPendingMembership(cytoSpecimen?.decants);
        const isRoseActive = resolveCytologyRoseActiveMembership(cytoSpecimen?.roseEvaluations);
        return { caseData: c, specimenId, isGynCytology, organSite, isQcPending, isRetrospectiveReviewPending, isPostSignOutPeerReviewPending, isHistologyCorrelationPending, isCellBlockAncillaryPending, isRoseActive, isCsmsQaPending: ((c as any).caseFlags ?? []).some((f: any) => f.flagDefinitionId === 'f36' && !f.deletedAt), aiScreeningResult: aiResultByCaseId.get(c.id) };
      }));

      setRows(withQcStatus);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const domainRows = rows
    .filter(r => r.isGynCytology === (domain === 'gyn'))
    .filter(r => domain === 'gyn' || !organSiteFilter || r.organSite === organSiteFilter);
  const assigned = domainRows.filter(r => r.caseData.order?.assignedTo === user?.id && !r.isQcPending && !r.isCsmsQaPending && !r.isRetrospectiveReviewPending && !r.isPostSignOutPeerReviewPending && !r.isHistologyCorrelationPending);
  const pool     = domainRows.filter(r => r.caseData.status === 'pool' && !r.isQcPending && !r.isCsmsQaPending && !r.isRetrospectiveReviewPending && !r.isPostSignOutPeerReviewPending && !r.isHistologyCorrelationPending);
  const qc       = domainRows.filter(r => r.isQcPending);
  const cellBlockAncillaryPending = domainRows.filter(r => r.isCellBlockAncillaryPending);
  const roseActive = domainRows.filter(r => r.isRoseActive);
  const csmsQa   = rows.filter(r => r.isCsmsQaPending);
  const retrospectiveLookback = rows.filter(r => r.isRetrospectiveReviewPending);
  const postSignOutPeerReview = rows.filter(r => r.isPostSignOutPeerReviewPending);
  const histologyCorrelation = rows.filter(r => r.isHistologyCorrelationPending);
  const visible  = activeTab === 'assigned' ? assigned : activeTab === 'pool' ? pool : activeTab === 'qc' ? qc : activeTab === 'csms_qa' ? csmsQa : activeTab === 'retrospective_lookback' ? retrospectiveLookback : activeTab === 'post_signout_peer_review' ? postSignOutPeerReview : activeTab === 'histology_correlation' ? histologyCorrelation : activeTab === 'cell_block_ancillary_pending' ? cellBlockAncillaryPending : activeTab === 'rose_active' ? roseActive : csmsQa;
  const counts: Record<Tab, number> = { assigned: assigned.length, pool: pool.length, qc: qc.length, hpv_triage: triageRows.length, recall_needed: recallRows.length, csms_qa: csmsQa.length, retrospective_lookback: retrospectiveLookback.length, post_signout_peer_review: postSignOutPeerReview.length, histology_correlation: histologyCorrelation.length, scans_completed: scansCompletedRows.length, cell_block_ancillary_pending: cellBlockAncillaryPending.length, rose_active: roseActive.length };

  // Real, per direct correction: "for the molecular platform they
  // would be sending results through your engine which would
  // transform that into a json payload... no one is resulting an HPV
  // in the application." This button does not mutate the specimen
  // itself — it builds the real, already-translated
  // HpvResultEventPayload a real interface engine would deliver, and
  // routes it through the exact same processInboundHpvResultEvent
  // this app would use for a genuine, external delivery (services/hl7/).
  // The button exists because no real, external molecular platform is
  // actually connected in this environment — it simulates the
  // delivery, not the result itself.
  const handleRecordHpvResult = async (c: Case, result: 'Positive' | 'Negative') => {
    const cytoSpecimen = (c.specimens as any[])?.find(sp => sp.specimenDictionaryEntryId);
    if (!cytoSpecimen) return;
    await processInboundHpvResultEvent({
      messageId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      organisationId: (c as any).originEnterpriseId ?? 'unknown',
      internalCaseId: c.id,
      accessionNumber: c.accession?.fullAccession ?? c.id,
      specimenLetter: cytoSpecimen.label,
      hrHpvResult: result,
      abnormalFlag: result === 'Positive' ? 'A' : 'N',
    });
    await load();
  };

  const handleClaim = async (caseId: string) => {
    if (!user?.id) return;
    setClaimingId(caseId);
    try {
      const claim = await claimPoolCase(caseId, user.id);
      if (claim.success) {
        await acceptPoolCase(caseId, user.id, user.name);
        await load();
      }
    } finally {
      setClaimingId(null);
    }
  };

  const handlePass = async (caseId: string) => {
    if (!user?.id) return;
    setClaimingId(caseId);
    try {
      const claim = await claimPoolCase(caseId, user.id);
      if (claim.success) {
        await passPoolCase(caseId);
        await load();
      }
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <>
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Cytology Worklist</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            Your assigned GYN cytology cases, the shared pool, and cases flagged for mandatory QC.
          </p>

          {/* Real, per direct guidance's own confirmed domain switcher —
              GYN vs Non-GYN, each with its own real, separate tile set. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['gyn', 'non_gyn'] as CytologyDomain[]).map(d => (
              <button key={d} onClick={() => { setDomain(d); setActiveTab('assigned'); setOrganSiteFilter(null); }}
                style={{
                  padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: domain === d ? '#009E7318' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${domain === d ? '#009E73' : 'rgba(255,255,255,0.08)'}`,
                  color: domain === d ? '#009E73' : '#9ca3af',
                }}>
                {d === 'gyn' ? t('cytologyWorklist.domain.gyn') : t('cytologyWorklist.domain.nonGyn')}
              </button>
            ))}
          </div>

          {/* Real, per direct guidance's own Organ/Site Quick-Filter
              Chips ask — real, dynamic chips for whichever organSite
              values genuinely appear among this lab's own real
              Non-GYN cases right now, never a fixed, always-shown
              list that could include a site with zero real cases. */}
          {domain === 'non_gyn' && (() => {
            const availableSites = Array.from(new Set(rows.filter(r => !r.isGynCytology && r.organSite).map(r => r.organSite as string)));
            if (availableSites.length === 0) return null;
            return (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <button onClick={() => setOrganSiteFilter(null)}
                  style={{ padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: !organSiteFilter ? '#37415155' : 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: !organSiteFilter ? '#e5e7eb' : '#6b7280' }}>
                  {t('cytologyWorklist.organSite.all')}
                </button>
                {availableSites.map(site => (
                  <button key={site} onClick={() => setOrganSiteFilter(site)}
                    style={{ padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: organSiteFilter === site ? '#38bdf822' : 'transparent', border: `1px solid ${organSiteFilter === site ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`, color: organSiteFilter === site ? '#38bdf8' : '#9ca3af' }}>
                    {t(`cytologyWorklist.organSite.${site}`)}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Real, three-tile row — matches the existing WorklistPage.tsx's own real stat-tile pattern */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {(domain === 'gyn' ? GYN_TILES : NON_GYN_TILES).map(tile => {
              const active = activeTab === tile.key;
              return (
                <button key={tile.key} onClick={() => setActiveTab(tile.key)}
                  style={{
                    flex: 1, padding: '16px 18px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: active ? `${tile.color}18` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? tile.color : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: active ? `0 0 12px ${tile.color}40` : 'none',
                  }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: active ? tile.color : '#e5e7eb' }}>{counts[tile.key]}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: active ? tile.color : '#9ca3af', marginTop: 4 }}>{tile.label}</div>
                </button>
              );
            })}
          </div>

          {/* Real, per direct guidance's own earlier resolution: QA &
              Compliance stays its own, separate section — a genuinely
              different, aggregate purpose than either screening domain
              above, not folded into GYN or Non-GYN specifically. */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              {t('cytologyWorklist.qaComplianceSectionLabel')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {QA_COMPLIANCE_TILES.map(tile => {
                const active = activeTab === tile.key;
                return (
                  <button key={tile.key} onClick={() => setActiveTab(tile.key)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', minWidth: 130,
                      background: active ? `${tile.color}18` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? tile.color : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: active ? tile.color : '#e5e7eb' }}>{counts[tile.key]}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: active ? tile.color : '#9ca3af', marginTop: 2 }}>{tile.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {loading && <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Loading…</div>}

          {!loading && activeTab === 'hpv_triage' && (
            triageRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No cases currently awaiting a primary hrHPV result.</div>
            ) : (
              <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                {triageRows.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: i < triageRows.length - 1 ? '1px solid #111827' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }} data-phi="mrn">{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Case {c.id} · MRN {c.patient?.mrn ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#8B5CF618', color: '#8B5CF6', border: '1px solid #8B5CF633' }}>Awaiting hrHPV Result</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleRecordHpvResult(c, 'Negative')} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>Record Negative</button>
                      <button onClick={() => handleRecordHpvResult(c, 'Positive')} style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#0a0a0a', background: '#8B5CF6', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Record Positive</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Real, per direct guidance's own Australia/NZ NCSP recall rule —
              a positive self-collected result can never itself produce a
              screenable slide; this tile is the real, visible surface for
              the recall recommendation instead of the case silently
              vanishing from every real cytology tile. */}
          {!loading && activeTab === 'recall_needed' && (
            recallRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No cases currently need a recall for clinician-collected LBC.</div>
            ) : (
              <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                {recallRows.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: i < recallRows.length - 1 ? '1px solid #111827' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }} data-phi="mrn">{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Case {c.id} · MRN {c.patient?.mrn ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#DC262618', color: '#DC2626', border: '1px solid #DC262633' }}>
                      Positive (Self-Collected) — Recall for Clinician-Collected LBC
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {!loading && activeTab === 'scans_completed' && (
            scansCompletedRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No cases currently have a completed WSI scan awaiting screening.</div>
            ) : (
              <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
                {scansCompletedRows.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: i < scansCompletedRows.length - 1 ? '1px solid #111827' : 'none', cursor: 'pointer' }}
                    onClick={() => navigate(`/cytology-worklist/${c.id}`)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }} data-phi="mrn">{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Case {c.id} · MRN {c.patient?.mrn ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#22C55E18', color: '#22C55E', border: '1px solid #22C55E33' }}>Scan Complete — Ready to Screen</span>
                  </div>
                ))}
              </div>
            )
          )}

          {!loading && activeTab !== 'hpv_triage' && activeTab !== 'recall_needed' && activeTab !== 'scans_completed' && visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
              {activeTab === 'assigned' && 'No cases currently assigned to you.'}
              {activeTab === 'pool' && 'No cases in the pool right now.'}
              {activeTab === 'qc' && 'No cases currently flagged for QC.'}
              {activeTab === 'csms_qa' && 'No cases currently need CSMS eligibility verification.'}
              {activeTab === 'retrospective_lookback' && 'No specimens currently need 5-year retrospective review.'}
              {activeTab === 'post_signout_peer_review' && 'No cases currently need post-sign-out peer review.'}
              {activeTab === 'histology_correlation' && 'No specimens currently have a candidate histology correlation pending.'}
              {activeTab === 'cell_block_ancillary_pending' && 'No specimens currently have a pending cell block or ancillary test.'}
              {activeTab === 'rose_active' && 'No specimens have a recent ROSE evaluation on record.'}
            </div>
          )}

          {!loading && activeTab !== 'hpv_triage' && activeTab !== 'recall_needed' && activeTab !== 'scans_completed' && visible.length > 0 && (
            <div style={{ border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
              {visible.map((row, i) => {
                const c = row.caseData;
                const hasFinalDiagnosis = c.specimens?.some((sp: any) => sp.cytologyScreening?.finalDiagnosis);
                return (
                  <div key={c.id}
                    onClick={() => activeTab !== 'pool' && navigate(`/cytology-worklist/${c.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                      borderBottom: i < visible.length - 1 ? '1px solid #111827' : 'none',
                      cursor: activeTab !== 'pool' ? 'pointer' : 'default',
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }} data-phi="mrn">{formatFullDisplayName(c.patient as any) || c.patient?.mrn || 'Unknown Patient'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        Case {c.id} · MRN {c.patient?.mrn ?? '—'}
                      </div>
                    </div>
                    {activeTab === 'qc' && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#ef444418', color: '#ef4444', border: '1px solid #ef444433' }}>
                        {(c.specimens as any[])?.find(sp => sp.id === row.specimenId)?.cytologyScreening?.qcFlag?.reason === 'targeted_high_risk' ? 'High-Risk QC' : 'Random QC'}
                      </span>
                    )}
                    {activeTab === 'csms_qa' && (
                      <>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#0ea5e918', color: '#38bdf8', border: '1px solid #0ea5e933' }}>
                          CSMS Eligibility Verification Needed
                        </span>
                        <button
                          onClick={() => openFlagManager(c)}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#1c1c1c', border: '1px solid #374151', color: '#9ca3af', cursor: 'pointer' }}
                        >
                          Manage Flags
                        </button>
                      </>
                    )}
                    {row.aiScreeningResult?.slideTriage && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                        background: row.aiScreeningResult.slideTriage.reviewRecommended ? '#f59e0b18' : '#22c55e18',
                        color: row.aiScreeningResult.slideTriage.reviewRecommended ? '#f59e0b' : '#22c55e',
                        border: `1px solid ${row.aiScreeningResult.slideTriage.reviewRecommended ? '#f59e0b33' : '#22c55e33'}`,
                      }} title="AI slide-level triage, per RFP-APLIS-2026-GLOBAL Story 10">
                        {row.aiScreeningResult.slideTriage.reviewRecommended ? '🤖 AI: Review' : '🤖 AI: No Further Review'}
                        {row.aiScreeningResult.slideTriage.rankGroup != null && row.aiScreeningResult.slideTriage.totalRankGroups != null
                          ? ` (${row.aiScreeningResult.slideTriage.rankGroup}/${row.aiScreeningResult.slideTriage.totalRankGroups})` : ''}
                      </span>
                    )}
                    {!row.aiScreeningResult?.slideTriage && (row.aiScreeningResult?.findings?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#38bdf818', color: '#38bdf8', border: '1px solid #38bdf833' }}
                        title="AI-flagged fields of view, per RFP-APLIS-2026-GLOBAL Story 10">
                        🤖 {row.aiScreeningResult!.findings.length} AI-Flagged FOV{row.aiScreeningResult!.findings.length === 1 ? '' : 's'}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                      background: hasFinalDiagnosis ? '#22c55e18' : '#f59e0b18',
                      color: hasFinalDiagnosis ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${hasFinalDiagnosis ? '#22c55e33' : '#f59e0b33'}`,
                    }}>
                      {hasFinalDiagnosis ? 'Final Diagnosis Recorded' : 'Awaiting Review'}
                    </span>
                    {activeTab === 'pool' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); handlePass(c.id); }} disabled={claimingId === c.id}
                          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#9ca3af', background: '#1c1c1c', border: '1px solid #374151', borderRadius: 7, cursor: 'pointer' }}>
                          Pass
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleClaim(c.id); }} disabled={claimingId === c.id}
                          style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#0a0a0a', background: '#009E73', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                          {claimingId === c.id ? 'Claiming…' : 'Claim'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      {showFlagManager && flagCaseData && (
        <FlagManagerModal
          key={`flag-modal-${flagCaseData.id}`}
          caseData={flagCaseData as any}
          flagDefinitions={flagDefinitions}
          onApplyFlags={onApplyFlags}
          onRemoveFlag={onRemoveFlag}
          onDirtyChange={() => {}}
          onClose={() => { setShowFlagManager(false); load(); }}
        />
      )}
    </>
  );
};

export default CytologyWorklistPage;
