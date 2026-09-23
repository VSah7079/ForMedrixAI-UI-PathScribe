// src/pages/SynopticReportPage/hooks/useSignOutWorkflow.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx as the second half of a two-part
// extraction (amendment first, then this) that was originally scoped as
// two separate domains but turned out to be genuinely, deeply cross-
// called — see useAmendmentWorkflow.ts's header for the full rationale.
//
// PURE MOVE, not a rewrite — every function body is unchanged.
//
// This hook depends on useAmendmentWorkflow's output: both
// releasePendingAmendmentOrAddendum and openAmendmentDraft are received
// as parameters here, not redefined. That's the real call-graph
// direction — handlePreFinalConfirm and handleFinalizeConfirm both call
// finalizeCase() then releasePendingAmendmentOrAddendum() in sequence.
//
// STATE OWNED HERE (moved in fully — verified via grep that each is
// only used within this file's original boundary or in JSX, before
// moving): missingFields, showMissingWarning, reviewFields,
// showAiReview, finalizeAndNextPending, showPreFinalise,
// preFinalSynoptics.
//
// STATE DELIBERATELY NOT OWNED HERE, received as parameters instead:
//   - activeReportInstanceId, orchSections: too central/widely-read
//     elsewhere, same reasoning as every prior extraction tonight.
//   - countersignFeedback: defined earlier in the main file, read in
//     JSX (a feedback textarea), so it stays there.
//   - fixativeGateSpecimens/setFixativeGateSpecimens,
//     pendingFinalizeArgs/setPendingFinalizeArgs: defined near the top
//     of the component (before this domain's original boundary) and
//     read directly in JSX for the FixativeTimeGateModal — stay in the
//     main file, only the setters are threaded through.
//   - specimenDictionary: comes from the pre-existing
//     useSpecimenDictionary() hook.
//   - setCaseSigned, showSignOutModal/setShowSignOutModal,
//     setAmendmentMode, setShowAmendmentModal, setShowFinalizeModal:
//     come from the pre-existing useSynopticModals() hook.
//   - pendingReconciliation/setPendingReconciliation: defined before
//     this domain's boundary, drives the FrozenToPermanentReconciliation
//     modal directly in JSX.
//   - sendSynopticReportToLis: from useLisIntegration.
//   - generateReportPdfSnapshot: stays in the main component (reads
//     resolvedContext/orchSections directly).
//   - releasePendingAmendmentOrAddendum, openAmendmentDraft: from
//     useAmendmentWorkflow, per the dependency direction above.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getSessionUser, canFinalizeCase } from '@/services/auth/caseAccessControl';
import { countersignService, userService, fppeAssignmentService, qaSupervisionAssignmentService } from '@/services';
import { FPPE_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaSupervisionAssignmentService';
import { intraoperativeService } from '@/services';
import { concordanceReviewSettingsService } from '@/services';
import { dispatchCancerRegistryReportIfApplicable } from '@/services/cancerRegistry/dispatchCancerRegistryReportIfApplicable';
import { amendmentService, reportVersionService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { syncPrimaryAssignee } from '@/services/cases/caseAssignmentSync';
import { mockReportReleaseService } from '@/services/reportRelease/mockReportReleaseService';
import { publishReportReleasedEvent } from '@/services/reports/publishReportReleasedEvent';
import { mockServiceChargeService } from '@/services/billing/mockServiceChargeService';
import { mockNcciEditService } from '@/services/billing/mockNcciEditService';
import { mockBillingDeficiencyService } from '@/services/billing/mockBillingDeficiencyService';
import type { BillingDeficiencyType, BillingDeficiencySeverity } from '@/types/billing/BillingDeficiencyRecord';
import { checkSignOutBillingDeficiencies } from '@/services/billing/checkSignOutBillingDeficiencies';
import { detectCriticalFindings } from '@/services/clinical/detectCriticalFindings';
import type { CriticalFindingFlag } from '@/services/clinical/detectCriticalFindings';
import { mockCriticalResultNotificationService } from '@/services/clinical/mockCriticalResultNotificationService';
import { dispatchCriticalAlerts } from '@/services/clinical/dispatchCriticalAlerts';
import { abnormalTriggerRuleService } from '@/services';
import { evaluateAbnormalTriggerRules, toCriticalFindingFlag } from '@/services/abnormalDetection/evaluateAbnormalTriggerRules';
import { resolveSyntheticCoding } from '@/services/abnormalDetection/resolveSyntheticCoding';
import { abnormalDetectionSignalService, qaActivityRecordService } from '@/services';
import { ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import { applySurgicalPostSignOutQa } from '@/services/quality/applySurgicalPostSignOutQa';
import { deidentifyText } from '@/services/narrativeSignals/deidentification';
import { resolveAnswers } from '@/orchestrator/contextBuilder';
import { resolveAbnormalDetectionEnabled } from '@/services/abnormalDetection/resolveAbnormalDetectionEnabled';
import { useSystemConfig } from '@/contexts/SystemConfigContext';
import { mockOutboundChargeQueueService } from '@/services/billing/mockOutboundChargeQueueService';
import { shouldRandomlySampleForCodeReview } from '@/services/billing/shouldRandomlySampleForCodeReview';
import { mockCodeReviewPoolService } from '@/services/billing/mockCodeReviewPoolService';
import { facilityService } from '@/services';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { getParticipationTypeLookup } from '@/utils/participationTypeLookup';
import type { ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';
import { sweepChargesForOutbox } from '@/services/billing/sweepChargesForOutbox';
import { mockBillingTypeTriggerConfigService } from '@/services/billing/mockBillingTypeTriggerConfigService';
import { validateChargeMetadata } from '@/services/billing/validateChargeMetadata';
import { sendEmail } from '@/services/communications/notificationService';
import { resolveResidentCountersignRequired } from '@/services/cases/resolveResidentCountersignRequired';
import type { FixativeGateSpecimen } from '../modals/FixativeTimeGateModal';
import type { PreAnalyticDateGateSpecimen } from '../modals/PreAnalyticDateGateModal';
import { PreFinalisationModal, type SynopticForReview } from '../modals/PreFinalisationModal';
import { getFieldLabel, type ReportingStandard } from '@/utils/synopticFieldLabels';
import { getTemplate } from '@/services/templates/templateService';
import { PathScribeAIService } from '@/services/aiIntegration/PathScribeAIService';
import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import { buildReviewFieldsFromAiSuggestions } from './buildReviewFieldsFromAiSuggestions';
import { evaluateMicroscopicFinalizeGate, type MicroscopicNarrativeStatus } from '@/utils/evaluateMicroscopicFinalizeGate';
import { isVisible } from '../components/RightSynopticPanel';
import type { Case, SynopticReportInstance, CaseParticipant } from '@/types/case/Case';
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { Specimen } from '@/types/case/Specimen';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import type { FrozenCategory } from '@/types/intraop/IntraoperativeEntry';
import type { MissingRequiredField, ReviewField } from '../components/RightSynopticPanel';
import type { RightSynopticPanelHandle } from '../components/RightSynopticPanel';
import type { OrchestratorSection } from '../components/OrchestratorSectionEditor';
import type { SigningUser, SetConcurrencyConflict, SendSynopticReportToLisFn, GenerateReportPdfSnapshotFn } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';
import { checkStainQcGate } from './checkStainQcGate';
import type { StainQcGateBlockingItem } from './checkStainQcGate';

// PreFinalisationModal imported only for its co-located SynopticForReview
// type re-export — not rendered from this hook.
void PreFinalisationModal;

interface UseSignOutWorkflowParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  signingUser: SigningUser;
  showToast: (message: string) => void;
  activeReportInstanceId: string;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  sendSynopticReportToLis: SendSynopticReportToLisFn;
  generateReportPdfSnapshot: GenerateReportPdfSnapshotFn;
  isOrchestrationMode: boolean;
  // Real fix (review pass): this was previously typed as the narrow,
  // incorrect { id: string; text: string }[] — code below reads
  // s.aiGenerated and s.label, neither of which exist on that type, and
  // only worked because the map/filter callbacks re-cast each item to
  // `any` internally. The declared type was wrong, not the code; fixed
  // to the real OrchestratorSection type shared with useOrchestratorDraft
  // and useReportGeneration, which is what the caller actually passes.
  orchSections: OrchestratorSection[];
  setCaseSigned: (signed: boolean) => void;
  setShowSignOutModal: (show: boolean) => void;
  setPendingReconciliation: (rec: { specimenId: string; caseType: string; frozenCategory: FrozenCategory; frozenDx: string } | null) => void;
  countersignFeedback: string;
  specimenDictionary: SpecimenEntry[];
  setFixativeGateSpecimens: (specs: FixativeGateSpecimen[] | null) => void;
  /** Real, per PS-289/PS-292's own Gating Strategy — see
   *  checkStainQcGate.ts's own header for the full reasoning. Same
   *  real "hard block, own gate-resolution modal" shape as the
   *  fixative/pre-analytic gates above. */
  setStainQcGateBlocking: (items: StainQcGateBlockingItem[] | null) => void;
  setPreAnalyticDateGateSpecimens: (specs: PreAnalyticDateGateSpecimen[] | null) => void;
  setPendingFinalizeArgs: (args: string[]) => void;
  /** Real, per direct guidance (retiring Finalize for Orchestration
   *  Mode): tells the gate-resolution callbacks in
   *  SynopticReportPage.tsx to resume handleSignOutConfirm() rather
   *  than finalizeCase(args) once a pre-analytic/fixative gate this
   *  function itself raised is resolved. */
  setPendingActionIsSignOut: (v: boolean) => void;
  synopticPanelRef: MutableRefObject<RightSynopticPanelHandle | null>;
  /** Real fix, per direct product decision: navigates the pathologist
   *  directly to a specific field (via RightSynopticPanel's existing
   *  scrollToField/alertFieldId mechanism) rather than opening a
   *  separate review modal — used to redirect to the first blocking
   *  unverified field when finalize is stopped. */
  setAlertFieldId: (id: string | null) => void;
  /** Same tab-switch-before-navigate need as the existing
   *  handleMissingFieldClick — if the pathologist is on a different
   *  tab (e.g. Material) when Finalize is blocked, alertFieldId alone
   *  won't visibly land them anywhere, since RightSynopticPanel needs
   *  to actually be mounted/visible for its scrollToField effect to
   *  do anything. */
  safeSetLeftTab: (tab: string) => void;
  /** Real feature, per direct follow-up: "Wire evaluateMicroscopicFinalizeGate
   *  into handleRequestFinalize." Redirects the pathologist straight
   *  to the blocking specimen's Microscopic panel — same real
   *  "navigate to what's actually blocking" pattern setAlertFieldId
   *  above already uses for the unverified-AI-suggestion check. */
  setActiveSpecimenId: (id: string) => void;
  setActiveReportType: (type: 'grossing' | 'microscopic' | 'synoptic') => void;
  setAmendmentMode: (mode: 'amendment' | 'correction' | 'addendum') => void;
  setShowAmendmentModal: (show: boolean) => void;
  setShowFinalizeModal: (show: boolean) => void;
  openAmendmentDraft: (mode: 'amendment' | 'correction' | 'addendum') => Promise<void>;
  releasePendingAmendmentOrAddendum: () => Promise<string | undefined>;
  log: (event: string, detail: Record<string, unknown>) => void;
}

// Real, per direct guidance's own severity categorization for each real
// Trigger A-F: NCCI bundling is a genuinely never-bypassable rejection
// risk. Missing ICD-10 and a wrong/omitted TC/26 modifier are both
// real, well-known claim-rejection causes in practice - CRITICAL_REJECTION_RISK,
// not merely a warning. An unattached ancillary order and a specimen
// billed above its own configured default are both real, but
// genuinely could be legitimate - COMPLIANCE_WARNING, routed to QA for
// a human judgment call, never auto-rejected. A $0.00 fee-schedule
// mapping gap is real, uncollected revenue, not a compliance/rejection
// risk at all - REVENUE_LEAKAGE, the one real trigger that
// legitimately uses this severity.
const BILLING_DEFICIENCY_SEVERITY: Record<BillingDeficiencyType, BillingDeficiencySeverity> = {
  UNSUPPORTED_CPT_LEVEL: 'COMPLIANCE_WARNING',
  NCCI_BUNDLING_VIOLATION: 'CRITICAL_REJECTION_RISK',
  MISSING_DIAGNOSTIC_ICD10: 'CRITICAL_REJECTION_RISK',
  UNATTACHED_ANCILLARY_ORDER: 'COMPLIANCE_WARNING',
  MODIFIER_MISMATCH: 'CRITICAL_REJECTION_RISK',
  ZERO_FEE_MAPPING_ERROR: 'REVENUE_LEAKAGE',
};

// Real, per direct guidance (retiring Finalize for Orchestration Mode,
// per "Path B Execution Plan": "Lift the pre-analytic date gate and
// the fixative-time gate directly out of finalizeCase() and insert
// them into handleSignOutConfirm()"). Extracted as a pure, shared
// helper rather than duplicated inline in both real callers —
// finalizeCase() (still real and active for Assist Mode's own
// Finalize) and handleSignOutConfirm() (Orchestration Mode's Sign Out
// Case, which now also needs these same real, hard-block gates since
// Finalize is being retired there). Same real gate logic either way,
// never two independently-maintained copies that could quietly drift.
// Real, per direct guidance ("Yes, complete the work" — wiring real
// enforcement for the per-performing-lab sign-out-authority flags added
// in the prior pass): resolves the two real facts canFinalizeCase() needs
// to make a data-driven decision instead of the old hardcoded literal —
// every real ParticipationTypeRecord (so .canFinalize/.authorityOverrides
// are actually read, not just displayed on the admin screen) and this
// case's own real performing-lab facility id (so a lab's own override
// actually takes effect) — same real resolvePerformingLabFacilityId()
// resolution already used elsewhere in this file (fetchCriticalFindings
// above, fetchBillingDeficiencyFindings below), reused rather than
// re-derived.
//
// Best-effort by design: a failed fetch resolves to an empty
// participationTypes array / undefined lab id rather than throwing —
// canFinalizeCase()'s own FINALIZE_ELIGIBLE_PARTICIPATION_TYPES_FALLBACK
// still applies in that case, so a transient service hiccup can never
// silently lock out every legitimate finalizer, only fall back to the
// pre-existing hardcoded behavior for that one attempt.
async function resolveFinalizeAuthorityContext(
  caseData: Case | null | undefined
): Promise<{ participationTypes: ParticipationTypeRecord[]; performingLabFacilityId: string | undefined }> {
  const orderingFacilityId = caseData?.order?.facilityId;
  const [participationTypes, labId] = await Promise.all([
    getParticipationTypeLookup().catch(() => []),
    (async () => {
      if (!orderingFacilityId) return undefined;
      const facilityRes = await facilityService.getById(orderingFacilityId).catch(() => null);
      return facilityRes?.ok ? resolvePerformingLabFacilityId(facilityRes.data) : undefined;
    })(),
  ]);
  return { participationTypes, performingLabFacilityId: labId };
}

function checkPreAnalyticAndFixativeGates(
  caseData: Case,
  specimenDictionary: SpecimenEntry[],
): { preAnalyticBlocking: PreAnalyticDateGateSpecimen[]; fixativeBlocking: FixativeGateSpecimen[] } {
  const preAnalyticBlocking: PreAnalyticDateGateSpecimen[] = (caseData.specimens ?? [])
    .filter((sp: Specimen) => (!sp.collectedAt && !sp.collectedAtAdministrativeOverride)
      || (!sp.receivedAt && !sp.receivedAtAdministrativeOverride))
    .map((sp: Specimen) => ({
      specimenId: sp.id,
      label: sp.label,
      description: sp.description,
      missingCollectedAt: !sp.collectedAt && !sp.collectedAtAdministrativeOverride,
      missingReceivedAt: !sp.receivedAt && !sp.receivedAtAdministrativeOverride,
    }));

  const fixativeBlocking: FixativeGateSpecimen[] = (caseData.specimens ?? [])
    .filter((sp: Specimen) => {
      const entry = sp.specimenDictionaryEntryId
        ? specimenDictionary.find(e => e.id === sp.specimenDictionaryEntryId)
        : undefined;
      return entry?.requireFixativeTimeBeforeSignout && !sp.processing?.processedAt;
    })
    .map((sp: Specimen) => ({ specimenId: sp.id, label: sp.label, description: sp.description }));

  return { preAnalyticBlocking, fixativeBlocking };
}

export function useSignOutWorkflow({
  caseData, setCaseData, signingUser, showToast, activeReportInstanceId,
  knownVersionRef, setConcurrencyConflict, sendSynopticReportToLis,
  generateReportPdfSnapshot, isOrchestrationMode, orchSections,
  setCaseSigned, setShowSignOutModal, setPendingReconciliation,
  countersignFeedback, specimenDictionary, setFixativeGateSpecimens, setStainQcGateBlocking,
  setPreAnalyticDateGateSpecimens, setPendingActionIsSignOut,
  setPendingFinalizeArgs, synopticPanelRef, setAlertFieldId, safeSetLeftTab, setAmendmentMode,
  setActiveSpecimenId, setActiveReportType,
  setShowAmendmentModal, setShowFinalizeModal, openAmendmentDraft,
  releasePendingAmendmentOrAddendum, log,
}: UseSignOutWorkflowParams) {
  // Real, per direct guidance (PS-105): "If the enterprise level is
  // disabled then the performing facility level is disabled and
  // cannot be overridden." Resolved once per hook instance — the real
  // facility-level value is looked up per-case inside
  // fetchCriticalFindings below (the case's own real ordering
  // facility isn't known until then).
  const { enterpriseConfig } = useSystemConfig();
  // i18n note: `canFinalizeCase()`'s own `.reason` (from
  // @/services/auth/caseAccessControl, shown as-is at the two
  // `showToast(...Decision.reason)` spots below) is now translated at
  // its own source — that file resolves it via a direct i18next
  // instance call (it's a plain service, not a hook), so both call
  // sites here stay correct simply by displaying whatever it returns,
  // in any language, with no wrapping needed here.
  const { t } = useTranslation();

  const finalizeSignOut = useCallback(async () => {
    // Stage 2 of the CoPilot amendment pipeline — this is the real
    // re-sign-out. Real, serious ordering bug caught and fixed here:
    // release() was firing before sendSynopticReportToLis() resolved,
    // meaning a synoptic instance could be marked 'released' — and
    // vanish from the triage tile — even if the transmission itself
    // failed. The LIS never getting the update while the case
    // disappears from the pathologist's active view is exactly the
    // dangerous gray area being guarded against. Fixed: send first,
    // only release/clear on confirmed success. A failed instance stays
    // exactly where it was — pendingAmendmentId intact, status
    // untouched — so it remains visible in the triage tile rather than
    // silently vanishing while the LIS never received anything.
    if (caseData?.id) {
      const pendingInstances = (caseData.synopticReports ?? []).filter((r: SynopticReportInstance) => r.pendingAmendmentId);
      const successfulInstanceIds = new Set<string>();
      const failedInstances: string[] = [];

      for (const instance of pendingInstances) {
        // Orchestration owns its own finalization directly — there's
        // no external LIS transmission to wait on the way CoPilot has.
        // It commits immediately; CoPilot still gates on a real,
        // confirmed send before releasing.
        if (caseData.reportingMode !== 'assist') {
          await amendmentService.release(instance.pendingAmendmentId!, {
            body: `Synoptic instance ${instance.instanceId} corrected and re-signed out.`,
          });
          successfulInstanceIds.add(instance.instanceId);
          continue;
        }
        const sendResult = await sendSynopticReportToLis({
          kind: 'corrected', caseId: caseData.id, instanceId: instance.instanceId,
          payloadBody: `Synoptic instance ${instance.instanceId} corrected and re-signed out.`,
        });
        if (!sendResult.ok) {
          failedInstances.push(instance.instanceId);
          continue; // do NOT release — this instance stays in draft/triage exactly as it was
        }
        await amendmentService.release(instance.pendingAmendmentId!, {
          body: `Synoptic instance ${instance.instanceId} corrected and re-signed out.`,
        });
        successfulInstanceIds.add(instance.instanceId);

        {
          const { pdfBase64, generationError } = await generateReportPdfSnapshot();
          if (generationError) showToast(t('useSignOutWorkflow.toast.versionSavedPdfSnapshotFailed', { error: generationError }));
          await reportVersionService.create({
            caseId: caseData.id,
            mode: 'assist',
            trigger: 'amendment',
            createdBy: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
            pdfBase64, generationError,
            synopticAnswersSnapshot: instance.answers,
            instanceId: instance.instanceId,
            amendmentRecordId: instance.pendingAmendmentId,
          });
        }
      }

      if (failedInstances.length > 0) {
        showToast(t('useSignOutWorkflow.toast.correctedInstancesNotTransmitted', { count: failedInstances.length }));
      }

      if (successfulInstanceIds.size > 0) {
        const clearedReports = (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
          successfulInstanceIds.has(r.instanceId) ? { ...r, status: 'finalized' as const, pendingAmendmentId: undefined } : r
        );
        setCaseData({ ...caseData, synopticReports: clearedReports });
        try {
          await caseRouter.updateCase(caseData.id, { synopticReports: clearedReports }, knownVersionRef.current);
          knownVersionRef.current = knownVersionRef.current + 1;
        } catch (e) {
          // Deliberately no override option here — this write finalizes
          // report content. Letting it proceed against a stale view
          // risks finalizing over data the pathologist never actually
          // saw, which is a materially worse outcome than blocking and
          // asking them to reload first.
          if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return;
          console.error(e);
        }
      }

      // Real, saved version of the report as it looks at THIS sign-out
      // — Version 1 the first time, a new version every re-sign-out
      // after that. Not a diff, not metadata — the actual exact PDF,
      // generated through the same real ReportLab pipeline as live
      // printing, so what gets saved genuinely matches what was signed.
      if (isOrchestrationMode) {
        const existingVersions = await reportVersionService.getByCaseId(caseData.id);
        const versionCount = existingVersions.ok ? existingVersions.data.length : 0;
        const { pdfBase64, generationError } = await generateReportPdfSnapshot();
        if (generationError) {
          showToast(t('useSignOutWorkflow.toast.versionSavedPdfSnapshotFailed', { error: generationError }));
        }
        await reportVersionService.create({
          caseId: caseData.id,
          mode: 'orchestration',
          trigger: versionCount === 0 ? 'initial_signout' : 'amendment',
          createdBy: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
          pdfBase64, generationError,
        });
      }
    }

    setCaseSigned(true);
    setShowSignOutModal(false);
    setPendingReconciliation(null);
    showToast(t('useSignOutWorkflow.toast.caseSignedOutSuccessfully'));
  }, [caseData, sendSynopticReportToLis, generateReportPdfSnapshot, isOrchestrationMode, signingUser, setCaseSigned, setShowSignOutModal, showToast, setCaseData, knownVersionRef, setConcurrencyConflict, setPendingReconciliation, t]);

  // Real, per direct guidance ("Yes we should scope 'Return to
  // Trainee'/'Reject with Notes'. I think the delegation workflow
  // might be a good method"): the attending's real alternative to
  // countersign() — declines the resident's submission and sends the
  // case back, rather than accepting and finalizing it. Deliberately
  // a separate, standalone action from handleSignOutConfirm() (never
  // called from within it) — an attending choosing to reject a case
  // never touches finalizeSignOut()/reportVersionService.create() at
  // all, since nothing about this case is being finalized.
  const handleReturnToTrainee = useCallback(async () => {
    if (!caseData?.id || caseData.status !== 'pending-countersign') return;

    const trimmedFeedback = countersignFeedback.trim();
    if (!trimmedFeedback) {
      showToast(t('useSignOutWorkflow.toast.feedbackRequiredForReturn'));
      return;
    }

    const result = await countersignService.reject({
      caseId: caseData.id,
      attendingId: signingUser?.id ?? 'unknown',
      attendingName: signingUser?.name ?? 'Unknown User',
      attendingFeedback: trimmedFeedback,
    });
    if (!result.ok) {
      showToast((result as { ok: false; error: string }).error ?? t('useSignOutWorkflow.toast.couldNotReturnCase'));
      return;
    }
    const record = result.data;

    // Real, per direct guidance: the same real ownership-transfer
    // primitive delegateCase()'s own transfersOwnership branch uses
    // (services/cases/caseAssignmentSync.ts) — deliberately reused
    // directly rather than going through delegateCase()/creating a
    // second, parallel DelegationRecord for the same event; the
    // real CountersignRecord above is already this specific
    // relationship's own audit trail.
    const syncUpdates = syncPrimaryAssignee(caseData, record.residentId, signingUser?.id ?? 'unknown', record.residentName);

    // Real, per direct guidance, same reasoning as Phase 4's own
    // per-instance sync fix (release() above): the per-instance
    // 'pending-countersign' status set at release time must be
    // reverted too, or the resident can't actually re-edit their own
    // synoptic reports — RightSynopticPanel.tsx's own tab-dot
    // indicator, and any other real UI gated on instance status,
    // would stay stuck showing pending-countersign forever.
    const revertedReports = (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
      r.status === 'pending-countersign' ? { ...r, status: 'draft' as const } : r
    );

    const patch: Partial<Case> = {
      ...syncUpdates,
      status: 'returned' as CaseStatus,
      returnedBy: signingUser?.id ?? 'unknown',
      synopticReports: revertedReports,
    };

    try {
      await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData({ ...caseData, ...patch } as typeof caseData);
      setShowSignOutModal(false);
      showToast(t('useSignOutWorkflow.toast.caseReturnedForRevision', { name: record.residentName }));
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return;
      console.error('[useSignOutWorkflow] Failed to apply the real return-to-trainee state transition:', e);
      showToast(t('useSignOutWorkflow.toast.feedbackRecordedUpdateFailed'));
    }
  }, [caseData, countersignFeedback, signingUser, showToast, setShowSignOutModal, knownVersionRef, setCaseData, setConcurrencyConflict, t]);

  const handleSignOutConfirm = useCallback(async () => {
    // Real, critical defense-in-depth guard, per direct specification:
    // Post-Sign-Out Release Buffer. A real, serious bug found during a
    // post-delivery gap review: this function's own real effect
    // (finalizeSignOut() below, unconditionally creating a new
    // ReportVersionRecord for Orchestration mode) has zero awareness of
    // the release buffer. BottomActionBar.tsx's own button visibility
    // is the primary fix, but a defense-in-depth check belongs here too
    // — the same real pattern this session already established for the
    // Recall action itself (a UI gate AND an independent, real check
    // underneath it, not just one or the other). Placed first, before
    // even the resident-countersign gate, since a case already sitting
    // in its own recall window should never reach any further sign-out
    // logic at all.
    if (caseData?.status === 'pending-release') {
      showToast(t('useSignOutWorkflow.toast.alreadyPendingRelease'));
      setShowSignOutModal(false);
      return;
    }
    // Real resident-countersign gate — must run before anything else in
    // this function, including the reconciliation check below. If the
    // current user is acting as a resident (not attending) on this case,
    // their "sign out" doesn't actually finalize anything; it releases
    // the case for the attending to review and countersign. Everyone
    // else (the attending, or any case with no resident participant)
    // falls through to the existing logic completely unchanged.
    //
    // Also covers FPPE provisional hires — same release/countersign
    // mechanism, but the reviewer is resolved from the active
    // FppeAssignment's own proctorUserId, not from searching case
    // participants for an 'attending' type. A provisional hire's case
    // may not even have a case-level attending participant at all (they're
    // fully credentialed; there's no clinical requirement for one) — the
    // FPPE assignment itself is what says who's proctoring them, for
    // however long the review period lasts.
    if (caseData?.id) {
      // Real fix (per direct follow-up on the intraop/FPPE differentiator
      // review): this used to re-derive the resident/attending decision
      // inline, in parallel with resolveResidentCountersignRequired.ts's
      // own identical logic (built for Cytology/Autopsy reuse) — two
      // independently-maintained copies of the same gate, a real drift
      // risk if either one ever changed alone. `isAttendingToo` is still
      // needed locally, on its own, purely to decide whether it's worth
      // making the async FPPE-assignment lookup below at all — that
      // pre-check isn't part of the shared decision itself, which stays
      // synchronous/pure by design (see that file's own header). The
      // actual required/reason decision now comes from one place.
      const isAttendingToo = caseData?.participants?.some(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === signingUser?.id && p.participationTypeIds?.includes('attending')
      );
      const provisionalParticipant = caseData?.participants?.find(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === signingUser?.id && p.participationTypeIds?.includes('provisional_hire')
      );
      // PS-114, Stage 4 (gate-check cutover) — reads from the new,
      // generic qaSupervisionAssignmentService now, not the old
      // fppeAssignmentService. Same real check as before (does this
      // provisional hire currently have an active assignment for this
      // subspecialty), just against the new system, which Stage 3's
      // id-synchronized shadow-write already proved stays a faithful
      // mirror. Real, deliberate scope: only THIS gate-check moved —
      // FppeAssignmentsSection.tsx's own list view still reads the old
      // system as its source of truth (confirmed directly before this
      // change), so old-system writes below are NOT retired here; that
      // screen's own migration is a separate, later piece of work.
      const activeFppeAssignment = provisionalParticipant && !isAttendingToo
        ? await qaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, signingUser?.id ?? '', caseData?.subspecialtyId).then(r => r.ok ? r.data : null).catch(() => null)
        : null;
      // Real, cheap safety net for this specific cutover — compares the
      // old system's own answer against the new one on every real
      // evaluation, logging (never blocking or changing behavior on) a
      // mismatch. Ids are synchronized since creation time (Stage 3),
      // so these should never actually disagree; this exists purely to
      // surface it immediately, on real usage, if they ever do — not
      // left running indefinitely once the old system is fully retired.
      if (provisionalParticipant && !isAttendingToo) {
        fppeAssignmentService.getActiveAssignmentForUser(signingUser?.id ?? '', caseData?.subspecialtyId)
          .then(r => {
            const legacyActive = r.ok ? !!r.data : null;
            const newActive = !!activeFppeAssignment;
            if (legacyActive !== null && legacyActive !== newActive) {
              console.warn('[PS-114 drift] FPPE gate disagreement between old and new systems', {
                userId: signingUser?.id, caseId: caseData?.id, legacyActive, newActive,
              });
            }
          })
          .catch(() => {});
      }

      const countersignCheck = resolveResidentCountersignRequired({
        participants: caseData?.participants,
        signingUserId: signingUser?.id ?? '',
        hasActiveFppeAssignment: !!activeFppeAssignment,
      });

      if (countersignCheck.required) {
        const releasedAnswersSnapshot: Record<string, Record<string, string | string[]>> = {};
        (caseData.synopticReports ?? []).forEach((r: SynopticReportInstance) => { releasedAnswersSnapshot[r.instanceId] = r.answers ?? {}; });

        // Real, per direct follow-up ("Continue with the version-record
        // creation to the trainee path... per your Path A step 3, the
        // immutable snapshot should be created there too, just without
        // triggering dispatch"): the real, immutable snapshot of what
        // the resident is actually submitting for review — same real
        // `generateReportPdfSnapshot()`/versionCount-based trigger
        // inference finalizeSignOut() already uses below, captured
        // BEFORE countersignService.release() so it genuinely reflects
        // what was submitted, not some later, possibly-edited state.
        // Deliberately no instanceId (the same real, whole-case
        // snapshot shape every orchestration-mode create() call in
        // this app already uses) — this alone is what correctly keeps
        // it out of the real ORU^R01 dispatch hook inside create()
        // itself (mode === 'orchestration' && instanceId), matching
        // this real step's own explicit "no release buffer starts, no
        // HL7 is queued" requirement without needing a second, separate
        // guard.
        {
          const existingVersions = await reportVersionService.getByCaseId(caseData.id);
          const versionCount = existingVersions.ok ? existingVersions.data.length : 0;
          const { pdfBase64, generationError } = await generateReportPdfSnapshot();
          if (generationError) showToast(t('useSignOutWorkflow.toast.submittedCountersignPdfFailed', { error: generationError }));
          await reportVersionService.create({
            caseId: caseData.id,
            mode: 'orchestration',
            trigger: versionCount === 0 ? 'initial_signout' : 'amendment',
            createdBy: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
            pdfBase64, generationError,
          });
        }

        await countersignService.release({
          caseId: caseData.id,
          subspecialtyId: caseData?.subspecialtyId,
          residentId: signingUser?.id ?? 'unknown',
          residentName: signingUser?.name ?? 'Unknown User',
          releasedAnswersSnapshot,
        });

        // Sync per-instance status alongside the case-level status —
        // previously only Case.status was updated here, leaving
        // SynopticReportInstance.status untouched. That's a real
        // inconsistency: RightSynopticPanel.tsx already has a pre-
        // existing tab-dot indicator checking
        // synopticReports.some(r => r.status === 'pending-countersign'),
        // which would never have fired for a case released through this
        // gate since nothing ever set an instance to that status. Only
        // 'draft' instances move — a report already 'finalized'
        // has its own real state that shouldn't be overwritten.
        const updatedReportsForRelease = (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
          r.status === 'draft' ? { ...r, status: 'pending-countersign' as const } : r
        );

        try {
          await caseRouter.updateCase(caseData.id, { status: 'pending-countersign', synopticReports: updatedReportsForRelease }, knownVersionRef.current);
          knownVersionRef.current = knownVersionRef.current + 1;
          setCaseData(prev => prev ? ({ ...prev, status: 'pending-countersign', synopticReports: updatedReportsForRelease }) : prev);
        } catch (e) {
          // Strict treatment — this releases the case for countersign,
          // a real status transition, same category as finalize.
          if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return;
          console.error(e);
        }

        // Real notification to the reviewer — an attending participant
        // for the resident path, or the FPPE assignment's own proctor
        // for the provisional-hire path. Fire-and-forget, same as every
        // other sendEmail() call in this app; hits a real backend
        // endpoint that doesn't exist in this dev environment, so it
        // will log an error to console rather than actually deliver,
        // but the call itself is architecturally correct for when a
        // real backend is behind it.
        const attendingParticipant = caseData?.participants?.find(
          (p: CaseParticipant) => p.status === 'active' && p.participationTypeIds?.includes('attending')
        );
        const reviewerId = activeFppeAssignment?.supervisorUserId ?? attendingParticipant?.staffId;
        if (reviewerId) {
          const attendingUserRes = await userService.getById(reviewerId).catch(() => null);
          const attendingEmail = attendingUserRes?.ok ? attendingUserRes.data?.email : undefined;
          if (attendingEmail) {
            sendEmail({
              to: [attendingEmail],
              subject: `Case ${caseData.id} ready for your countersign`,
              bodyText: `${signingUser?.name ?? 'A resident'} has released case ${caseData.id} for your review and countersign.`,
              bodyHtml: `<p>${signingUser?.name ?? 'A resident'} has released case <strong>${caseData.id}</strong> for your review and countersign.</p>`,
              metadata: { caseId: caseData.id, action: 'countersign_requested' },
            }).catch(() => {});
          }
        }

        showToast(t('useSignOutWorkflow.toast.caseReleasedForCountersign', { caseId: caseData.id }));
        setShowSignOutModal(false);
        return; // does not proceed to reconciliation check or any finalize logic below
      }
    }

    // Real write guard (dimension 4 — case relationship), placed exactly
    // where the gap was found: anyone falling through past the resident/
    // FPPE gate above with NO real relationship to this case at all
    // (no participant record, not primary/attending, not an admin role)
    // could previously proceed straight into the countersign-completion
    // and finalize logic below with zero verification. Deliberately
    // placed after the resident/FPPE gate, not before it — a resident
    // legitimately reaches this function and gets correctly routed to
    // release-for-countersign above; this guard only needs to catch
    // whoever isn't covered by either that routing or a genuine
    // primary/attending/admin relationship.
    const { participationTypes: signOutParticipationTypes, performingLabFacilityId: signOutLabId } =
      await resolveFinalizeAuthorityContext(caseData);
    const signOutFinalizeDecision = canFinalizeCase(getSessionUser(), caseData?.participants, signOutParticipationTypes, signOutLabId);
    if (!signOutFinalizeDecision.granted) {
      showToast(signOutFinalizeDecision.reason);
      setShowSignOutModal(false);
      return;
    }

    // Real, per direct guidance ("Path B Execution Plan" — retiring
    // Finalize for Orchestration Mode): the same two real, hard-block
    // regulatory gates finalizeCase() already enforces
    // (checkPreAnalyticAndFixativeGates() — see its own header comment
    // for the full cross-jurisdiction citations) now also apply here.
    // Deliberately placed after the resident/countersign gate above,
    // never before it — a resident's own submission ("I am done
    // drafting, but this is not a final medical record") is real,
    // legitimate, and doesn't need these; the attending's real
    // sign-out, reached only past this point, does.
    if (caseData) {
      const { preAnalyticBlocking, fixativeBlocking } = checkPreAnalyticAndFixativeGates(caseData, specimenDictionary);
      if (preAnalyticBlocking.length > 0) {
        setPreAnalyticDateGateSpecimens(preAnalyticBlocking);
        setPendingActionIsSignOut(true);
        setShowSignOutModal(false);
        return;
      }
      if (fixativeBlocking.length > 0) {
        setFixativeGateSpecimens(fixativeBlocking);
        setPendingActionIsSignOut(true);
        setShowSignOutModal(false);
        return;
      }
      // Real, per PS-289/PS-292's own Gating Strategy — checked after
      // the two more foundational gates above, same real ordering
      // principle ("basic accession date/time is more foundational
      // than biomarker-specific fixation timing") extended one step
      // further: stain QC is a later-stage concern than either.
      const stainQcBlocking = await checkStainQcGate(caseData);
      if (stainQcBlocking.length > 0) {
        setStainQcGateBlocking(stainQcBlocking);
        setPendingActionIsSignOut(true);
        setShowSignOutModal(false);
        return;
      }
    }

    // Real attending-side countersign completion — fires when a case
    // that was released by a resident is now actually being finalized
    // (by definition not by that same resident, since the gate above
    // already intercepted them). Captured alongside triggering the
    // existing finalize logic below, not after — the existing finalize
    // flow has several internal success paths, and hooking into all of
    // them individually would be far riskier than recording the
    // countersign completion here, at the one point every path shares.
    if (caseData?.id && caseData?.status === 'pending-countersign') {
      const currentAnswersByInstance: Record<string, Record<string, string | string[]>> = {};
      (caseData.synopticReports ?? []).forEach((r: SynopticReportInstance) => { currentAnswersByInstance[r.instanceId] = r.answers ?? {}; });
      await countersignService.countersign({
        caseId: caseData.id,
        attendingId: signingUser?.id ?? 'unknown',
        attendingName: signingUser?.name ?? 'Unknown User',
        currentAnswersByInstance,
        attendingFeedback: countersignFeedback.trim() || undefined,
      }).catch(() => {});

      // Real FPPE case-count increment — if this case's provisional
      // hire has an active assignment, this countersign counts toward
      // their review-period threshold. Checked independently of who's
      // actually completing the sign-out here (the gate above already
      // guarantees it isn't the provisional hire themselves) — this
      // only needs to know whether the CASE involves someone under FPPE.
      const provisionalOnThisCase = caseData?.participants?.find(
        (p: CaseParticipant) => p.status === 'active' && p.participationTypeIds?.includes('provisional_hire')
      );
      if (provisionalOnThisCase) {
        // PS-114, Stage 4 — the lookup and the properly-awaited,
        // failure-visible increment now target the new system first:
        // once the gate-check above reads from qaSupervisionAssignmentService,
        // an increment that silently failed to land there would leave a
        // pathologist who's actually graduated still gated, or vice
        // versa — a real, live-consequence bug a swallowed error could
        // hide. The old system's own write is now the shadow, kept
        // alive (not retired) because FppeAssignmentsSection.tsx's own
        // list view still reads it as its source of truth — confirmed
        // directly before this change, not assumed.
        const assignmentRes = await qaSupervisionAssignmentService.getActiveAssignmentForUser(FPPE_ACTIVITY_TYPE_ID, provisionalOnThisCase.staffId, caseData?.subspecialtyId).catch(() => null);
        if (assignmentRes?.ok && assignmentRes.data) {
          try {
            await qaSupervisionAssignmentService.recordCaseReviewed(assignmentRes.data.id);
          } catch (e) {
            console.error('[PS-114] Failed to record case review on the new QaSupervisionAssignment system — the sign-out gate reads from this system, so a silent failure here could leave a graduated pathologist incorrectly gated.', e);
          }
          // Real, synchronized shadow-write to the old system, using the
          // same real id (shared since creation time) — kept alive only
          // for FppeAssignmentsSection.tsx's own still-unmigrated list
          // view; never awaited in a way that could delay real sign-out.
          fppeAssignmentService.recordCaseReviewed(assignmentRes.data.id).catch(() => {});
        }
      }
    }

    // Real Frozen-to-Permanent Reconciliation check — only fires when
    // this case actually has a merged intraop specimen with a real
    // frozen category (not 'deferred' — no real call was made at
    // frozen, so there's nothing to reconcile). Everything else signs
    // out exactly as it always did.
    //
    // Real, per direct follow-up ("wire them [the concordance review
    // settings]"): gated by the real, persisted settings this session
    // decided (concordanceReviewSettingsService) rather than always
    // running unconditionally as before. aiComparisonEnabled off
    // skips this whole check — the case signs out exactly as if this
    // feature didn't exist. reviewScreenEnabled off still runs the
    // real detection (a site may still want the comparison to happen)
    // but never blocks sign-out on it — the same, real "still needs
    // reconciling" state simply remains open for later, manual
    // completion via the existing DiscordanceReconciliationModal
    // trigger, exactly as it would for a case signed out before this
    // feature existed at all.
    if (caseData?.id) {
      const concordanceSettingsRes = await concordanceReviewSettingsService.resolveEffectiveConfigForFacility(caseData.originHospitalId, signingUser?.id).catch(() => null);
      const concordanceSettings = concordanceSettingsRes?.ok ? concordanceSettingsRes.data : { aiComparisonEnabled: true, reviewScreenEnabled: true };

      if (concordanceSettings.aiComparisonEnabled) {
        const res = await intraoperativeService.getAll();
        if (res.ok) {
          const mergedSession = res.data.find(e => e.status === 'merged' && e.mergedIntoCaseId === caseData.id);
          const specimenNeedingReconciliation = mergedSession?.specimens.find(s => s.frozenCategory && s.frozenCategory !== 'deferred');
          if (mergedSession && specimenNeedingReconciliation && concordanceSettings.reviewScreenEnabled) {
            setPendingReconciliation({
              specimenId: specimenNeedingReconciliation.id,
              caseType: specimenNeedingReconciliation.specimenLabel,
              frozenCategory: specimenNeedingReconciliation.frozenCategory!,
              frozenDx: specimenNeedingReconciliation.frozenSectionDiagnosis ?? '',
            });
            return; // hold sign-out until the reconciliation modal resolves
          }
        }
      }
    }
    await finalizeSignOut();

    // Real, per direct guidance (PS-324): post-sign-out peer-review
    // selection + biopsy-to-resection correlation candidate detection
    // — surgical pathology only (this hook never runs for Cytology
    // sign-out, same real jurisdiction as the cancer registry dispatch
    // immediately below). Fire-and-forget, same real posture as every
    // other post-sign-out side effect in this function — a real
    // failure here must never block or retroactively undo the case's
    // own, already-successful sign-out. See applySurgicalPostSignOutQa.ts's
    // own header for why this deliberately re-fetches the case fresh
    // rather than racing this function's own knownVersionRef writes.
    if (caseData?.id) {
      applySurgicalPostSignOutQa(caseData.id).catch(e =>
        console.error('[useSignOutWorkflow] Could not apply surgical post-sign-out QA selection/correlation detection:', e)
      );
    }

    // Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry
    // Exports gap — per FHIR_DISPATCH_ARCHITECTURE_PLAN.md's own
    // already-settled, critical finding, this is the ONLY real place
    // in this app a general cancer registry report may ever be
    // triggered from: a genuine, confirmed surgical pathology sign-out
    // — never cytology. Fire-and-forget: a real dispatch-side failure
    // must never block the case's own, already-successful sign-out,
    // same real posture as every other post-sign-out side effect in
    // this function.
    if (caseData?.id && caseData.order?.facilityId) {
      dispatchCancerRegistryReportIfApplicable(caseData, caseData.order.facilityId, caseData.order.facilityName).catch(() => {});
    }

    // Real, per direct guidance ("Path B Execution Plan"): the real
    // case-level state transition + buffer decision, performed here in
    // the hooks/orchestration layer — deliberately never inside
    // reportVersionService.create() itself (a real service-boundary
    // violation; that service has no business writing Case.status).
    // Runs only for Orchestration Mode, matching finalizeSignOut()'s
    // own internal mode check immediately above — defense in depth,
    // never assuming the UI's own mode-gated button visibility is the
    // only real protection.
    if (isOrchestrationMode && caseData?.id) {
      const bufferResolution = await mockReportReleaseService.resolveBufferForCase(caseData);
      const finalizedAt = new Date().toISOString();
      const patch = {
        status: (bufferResolution.applies ? 'pending-release' : 'finalized') as CaseStatus,
        finalizedAt,
        finalizedBy: signingUser?.id ?? null,
        releasedAt: bufferResolution.applies ? undefined : finalizedAt,
        releaseBufferExpiresAt: bufferResolution.applies
          ? new Date(Date.now() + bufferResolution.durationMinutes * 60_000).toISOString()
          : undefined,
        releaseBufferDurationMinutes: bufferResolution.applies ? bufferResolution.durationMinutes : undefined,
        preReleaseBufferStatus: bufferResolution.applies ? caseData.status : undefined,
      };
      try {
        await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
        setCaseData({ ...caseData, ...patch } as typeof caseData);

        if (bufferResolution.applies) {
          log('sign_out_buffered', {
            caseId: caseData.id,
            accession: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber,
            durationMinutes: bufferResolution.durationMinutes,
            facilityId: caseData.originHospitalId,
          });
          showToast(t('useSignOutWorkflow.toast.reportSignedDispatchIn', { minutes: bufferResolution.durationMinutes }));
        } else {
          // Real, per direct guidance: no buffer applies (disabled
          // config, or a real STAT-priority bypass) — no reason to
          // make a real, already-signed case wait on a buffer that
          // was never going to fire. Dispatches immediately,
          // fire-and-forget — a real, external network dispatch
          // attempt must never delay this function's own return.
          publishReportReleasedEvent({
            caseId: caseData.id,
            reportType: 'FINAL',
            releasedAt: new Date().toISOString(),
            releasedBy: signingUser?.id ? { id: signingUser.id, name: signingUser.name ?? signingUser.id } : undefined,
          }).catch(e =>
            console.error('[useSignOutWorkflow] Real, non-blocking failure dispatching case instances at sign-out (no buffer applied):', e)
          );
        }
      } catch (e) {
        if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return;
        console.error('[useSignOutWorkflow] Failed to apply the real sign-out/buffer state transition:', e);
        showToast(t('useSignOutWorkflow.toast.signedOutBufferFailed'));
      }
    }
  }, [caseData, finalizeSignOut, signingUser, showToast, countersignFeedback, setShowSignOutModal, knownVersionRef, setConcurrencyConflict, setCaseData, setPendingReconciliation, isOrchestrationMode, log, t]);

  // ── Build SynopticForReview[] for PreFinalisationModal ─────────────────
  const buildSynopticsForReview = useCallback(async (): Promise<SynopticForReview[]> => {
    if (!caseData?.synopticReports?.length) return [];
    const reports = caseData.synopticReports;

    // Real section structure, per feedback — was previously a flat
    // field list with no grouping at all. getTemplate() gives the same
    // sections/fields structure that drives the main editor's tabs
    // (Specimen/Tumor/Margins/...), fetched in parallel per instance.
    const sectionsByInstance = await Promise.all(reports.map(async report => {
      try {
        const detail = await getTemplate(report.templateId);
        const sections = detail.template?.sections ?? [];
        return sections.map(s => ({ title: s.title, fieldKeys: (s.fields ?? []).map(f => f.id) }));
      } catch (e) {
        console.error(`[PreFinalisation] Could not load template sections for ${report.templateId}:`, e);
        return [] as { title: string; fieldKeys: string[] }[];
      }
    }));

    return reports.map((report, i) => {
        const specimen  = caseData.specimens?.find((s: Specimen) => s.id === report.specimenId);
        const answers   = report.answers ?? {};
        const fieldKeys = Object.keys(answers);
        const answeredCount = fieldKeys.filter(k => {
          const v = answers[k];
          return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
        }).length;
        const std: ReportingStandard =
          report.templateName?.includes('RCPath') ? 'RCPath' :
          report.templateName?.includes('RCPA')  ? 'RCPA'  :
          report.templateName?.includes('WHO')   ? 'WHO'   :
          report.templateName?.includes('CAP')   ? 'CAP'   : 'generic';
        const fieldLabels: Record<string, string> = {};
        fieldKeys.forEach(k => { fieldLabels[k] = getFieldLabel(k, std); });
        return {
          instanceId:    report.instanceId,
          templateName:  report.templateName,
          specimenId:    report.specimenId,
          specimenLabel: specimen?.label ?? '?',
          specimenDesc:  specimen?.description ?? 'Specimen',
          answers, fieldLabels, fieldOrder: fieldKeys,
          sections: sectionsByInstance[i],
          answeredCount, totalCount: fieldKeys.length,
          // Real gap, found during type cleanup, flagged rather than
          // silently invented a fix for: requiredFields is declared on
          // SynopticForReview (this function's own OUTPUT type) but was
          // never actually declared on SynopticReportInstance (the real,
          // persisted INPUT type) — report.requiredFields never existed,
          // so this always evaluated to [] regardless of what the real
          // template marks as required. PreFinalisationModal's own
          // "required field incomplete — sign-out blocked" warning
          // (driven by this exact field) can therefore never fire. Left
          // as an explicit [] here, preserving the exact current
          // behavior rather than guessing at where the real per-field
          // required flag should be sourced from (likely the template's
          // own field definitions) — that's a real, separate fix, not a
          // type-safety one.
          requiredFields: [] as string[],
          status: report.status,
        };
      });
  }, [caseData]);

  const [missingFields,          setMissingFields]          = useState<MissingRequiredField[]>([]);
  const [showMissingWarning,     setShowMissingWarning]     = useState(false);
  const [reviewFields,           setReviewFields]           = useState<ReviewField[]>([]);
  const [showAiReview,           setShowAiReview]           = useState(false);
  const [isSuggestingSynoptic,   setIsSuggestingSynoptic]   = useState(false);
  const [isGeneratingNarrative,  setIsGeneratingNarrative]  = useState(false);
  const [showNarrativeReview,    setShowNarrativeReview]    = useState(false);
  const [generatedNarrativeText, setGeneratedNarrativeText] = useState('');
  const [finalizeAndNextPending, setFinalizeAndNextPending] = useState(false);

  // ── Pre-finalisation + protocol review state ───────────────────────
  const [showPreFinalise,   setShowPreFinalise]   = useState(false);
  const [preFinalSynoptics, setPreFinalSynoptics] = useState<SynopticForReview[]>([]);

  // Real, per direct guidance's own PS-105 scope ("Sign-Out
  // Guardrails" - soft block, not a hard block): a real, detected
  // 'critical' severity finding must be acknowledged or recorded
  // before finalize can proceed to PreFinalisationModal; an
  // 'abnormal' finding is real but non-blocking, same posture as the
  // existing billing-warning check just above. acknowledgedCritical
  // is deliberately session-scoped (not per-finding) - once the
  // pathologist has actually seen and acted on the real modal once,
  // re-detecting the same, unchanged text on a second Finalize click
  // would be pure friction, not a real safeguard.
  const [criticalFindings,        setCriticalFindings]        = useState<CriticalFindingFlag[]>([]);
  const [showCriticalFindingsModal, setShowCriticalFindingsModal] = useState(false);
  const [acknowledgedCritical,    setAcknowledgedCritical]    = useState(false);

  // Real, shared detection step for Trigger A (UNSUPPORTED_CPT_LEVEL),
  // Trigger B (NCCI_BUNDLING_VIOLATION), Trigger C
  // (MISSING_DIAGNOSTIC_ICD10), Trigger D (UNATTACHED_ANCILLARY_ORDER),
  // Trigger E (MODIFIER_MISMATCH), and Trigger F
  // (ZERO_FEE_MAPPING_ERROR) - read-only, never raises or persists
  // anything itself. Two real callers: previewBillingWarnings
  // (below, via handleRequestFinalize - the actual "pathologist
  // attempts signature" moment, per Trigger A's own trigger event) and
  // finalizeCase's own real, post-commit raise immediately below.
  const fetchBillingDeficiencyFindings = useCallback(async () => {
    if (!caseData?.id) return [];
    const [chargesRes, ncciRes] = await Promise.all([
      mockServiceChargeService.getChargesForCase(caseData.id),
      mockNcciEditService.getAll(),
    ]);
    if (!chargesRes.ok || !ncciRes.ok) return [];
    const specimens = (caseData.specimens ?? []).map((sp: Specimen) => ({
      id: sp.id, label: sp.label, specimenDictionaryEntryId: sp.specimenDictionaryEntryId,
      // Real, per Trigger C's own fallback: the specimen's own
      // coding.icd10 override, when it has one.
      icd10: (sp as any).coding?.icd10,
    }));
    // Real, case-wide ICD-10 fallback - same real field
    // validateChargeMetadata.ts already checks at dispatch time; this
    // surfaces the same real gap earlier, at sign-out.
    const caseIcd10Codes = (caseData.order as any)?.icd10Codes ?? [];
    // Real, per Trigger D's own BlockForCheck shape - every real block
    // across every specimen, keyed by id, so a 'stain'-level charge's
    // own blockId resolves directly without a second, specimen-scoped
    // lookup.
    const blocksById = new Map<string, { id: string; lisRequestStatus?: 'pending' | 'confirmed' | 'rejected'; stains: { lisRequestStatus?: 'pending' | 'confirmed' | 'rejected' }[] }>();
    (caseData.specimens ?? []).forEach((sp: Specimen) => {
      (sp.blocks ?? []).forEach(b => {
        blocksById.set(b.id, { id: b.id, lisRequestStatus: b.lisRequestStatus, stains: (b.stains ?? []).map(s => ({ lisRequestStatus: s.lisRequestStatus })) });
      });
    });
    return checkSignOutBillingDeficiencies(chargesRes.data, specimens, specimenDictionary, ncciRes.data, caseIcd10Codes, blocksById);
  }, [caseData, specimenDictionary]);

  // Real, per direct guidance's own revised PS-105 scope: the actual
  // "pathologist attempts electronic signature" detection moment for
  // critical/abnormal narrative findings, same real trigger event as
  // fetchBillingDeficiencyFindings above. Read-only - detects and
  // returns real, structured flags; never records a notification or
  // blocks anything itself. Deliberately scoped to narrative text
  // only (gross/microscopic/ancillary), same real PHI-minimization
  // boundary detectCriticalFindings' own signature already enforces.
  const fetchCriticalFindings = useCallback(async (): Promise<CriticalFindingFlag[]> => {
    // Real, per direct guidance (PS-105): resolve the case's real
    // performing facility once, then gate the entire detection engine
    // on it — enterprise-disabled is an absolute floor; nothing below
    // this point runs at all when it applies, not even the AI call
    // (a real cost/performance win too, not just correctness).
    const orderingFacilityId = caseData?.order?.facilityId;
    let labId: string | undefined;
    let facilityAbnormalDetectionEnabled: boolean | undefined;
    if (orderingFacilityId) {
      const facilityRes = await facilityService.getById(orderingFacilityId);
      if (facilityRes.ok) {
        labId = resolvePerformingLabFacilityId(facilityRes.data);
        facilityAbnormalDetectionEnabled = facilityRes.data.abnormalDetectionEnabled;
      }
    }
    const enabled = resolveAbnormalDetectionEnabled(enterpriseConfig.features.abnormalDetectionEnabled, facilityAbnormalDetectionEnabled);
    if (!enabled) return [];

    let narrativeFindings: CriticalFindingFlag[] = [];
    if (caseData?.diagnostic) {
      const res = await detectCriticalFindings({
        gross:       caseData.diagnostic.grossDescription ?? '',
        microscopic: caseData.diagnostic.microscopicDescription ?? '',
        ancillary:   caseData.diagnostic.ancillaryStudies ?? '',
      });
      narrativeFindings = res.ok ? res.data.flags : [];
    }

    // Real, per direct guidance's own unified sign-out review: PS-129's
    // discrete synoptic trigger rules, checked alongside the AI
    // narrative findings above, merged into the same
    // CriticalFindingFlag[] the modal already renders — one real
    // review surface, not two independently-timed/-shaped ones.
    let discreteFindings: CriticalFindingFlag[] = [];
    if (caseData?.synopticReports?.length) {
      const rulesRes = await abnormalTriggerRuleService.getAll();
      if (rulesRes.ok) {
        const activeRules = rulesRes.data.filter(r => r.status === 'Active' && (!r.performingLabFacilityId || r.performingLabFacilityId === labId));

        const matchesPerInstance = await Promise.all(caseData.synopticReports.map(async report => {
          try {
            const detail = await getTemplate(report.templateId);
            const resolved = resolveAnswers(report.answers ?? {}, detail?.template ?? null);
            return evaluateAbnormalTriggerRules(report.specimenId, resolved, activeRules);
          } catch (e) {
            console.error(`[AbnormalDetection] Could not evaluate trigger rules for instance ${report.instanceId}:`, e);
            return [];
          }
        }));
        discreteFindings = matchesPerInstance.flat().map(toCriticalFindingFlag);
      }
    }

    return [...narrativeFindings, ...discreteFindings];
  }, [caseData, enterpriseConfig]);

  /** Real, per direct guidance - the pathologist has reviewed the real,
   *  detected finding(s) and chosen to record a real notification.
   *  Requires every real field ICriticalResultNotificationService
   *  itself requires - never partially recorded. Dismisses the modal
   *  and marks this session's findings acknowledged either way, same
   *  as handleAcknowledgeCriticalFindings below, since a pathologist
   *  who's actually recorded the call has just as genuinely dealt
   *  with the finding as one who explicitly acknowledged it. */
  const handleRecordCriticalNotification = useCallback(async (input: {
    clinicianName: string;
    method: 'verbal_phone' | 'secure_page' | 'direct_lis_flag';
    readBackConfirmed?: boolean;
    /** Real, per direct guidance: defaults to the signed-in user in
     *  the modal itself, but genuinely editable — a representative may
     *  have made the real call, with staff simply transcribing the
     *  event afterward. userId below always stays the real,
     *  verifiable, currently-signed-in user (who actually entered this
     *  record) — this is the separate, human-readable name of whoever
     *  actually performed the real notification, which the same
     *  person or a different one. */
    notifiedByName: string;
  }) => {
    if (!caseData?.id) return;
    const findingSummary = criticalFindings.map(f => f.term).join(', ') || 'Critical finding detected at sign-out';
    await mockCriticalResultNotificationService.recordNotification({
      caseId: caseData.id,
      trigger: 'critical_value',
      findingSummary,
      clinicianName: input.clinicianName,
      method: input.method,
      readBackConfirmed: input.readBackConfirmed,
      notifiedBy: { userId: signingUser?.id ?? 'unknown', userName: input.notifiedByName },
    });

    // Real, per direct guidance (PS-105): this is the actual, real
    // pathologist confirmation — set the case's own real,
    // WorklistTable.tsx-visible status here, to the single
    // highest-severity finding among everything shown in this modal.
    // Never set from an unconfirmed suggestion alone (handleAcknowledgeCriticalFindings
    // below deliberately does NOT set this).
    const severityRank: Record<'Abnormal' | 'Critical' | 'Malignant', number> = { Abnormal: 1, Critical: 2, Malignant: 3 };
    const highest = criticalFindings.reduce<'Abnormal' | 'Critical' | 'Malignant' | null>((best, f) => {
      if (!best) return f.severity;
      return severityRank[f.severity] > severityRank[best] ? f.severity : best;
    }, null);
    if (highest) {
      // Real, per direct guidance: "we can use synthetic codes
      // because we will not have a license until our first customer
      // or a partnership" — PS-130's real, current, intentional
      // approach. Prefers a matched PS-129 discrete rule's own,
      // admin-configured per-rule code (real, specific to the actual
      // finding, e.g. "Margin Status: Positive" vs. a generic
      // "Critical" placeholder) when one exists among the findings at
      // this severity; falls back to the real, severity-keyed default
      // only when none of them carry one (always true for an
      // AI-narrative finding, which has no fixed rule to attach one
      // to). See resolveSyntheticCoding.ts's own header for the full
      // structural safety reasoning (PS-130's real, licensed
      // implementation stays genuinely blocked; this never touches
      // that — it's the real, interim approach until a real
      // terminology source exists).
      const perRuleMatch = criticalFindings.find(f => f.severity === highest && f.syntheticCoding && f.syntheticCoding.length > 0);
      const patch = {
        abnormalDetectionStatus: { severity: highest, confirmedAt: new Date().toISOString() },
        syntheticAbnormalCoding: perRuleMatch?.syntheticCoding ?? resolveSyntheticCoding(highest),
      };
      try {
        await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
        setCaseData(prev => prev ? ({ ...prev, ...patch } as typeof prev) : prev);
      } catch (e) {
        console.error('[AbnormalDetection] Could not persist confirmed abnormal status:', e);
      }

      // Real, per direct correction (PS-134 follow-up: "when would a
      // CAPA be needed?"): this records a real, genuine audit-trail
      // entry for the pathologist's own confirmation — outcome:
      // 'concordant', since a primary pathologist confirming their
      // OWN finding is not a discrepancy of any kind, and severity is
      // deliberately omitted (QaActivityRecord's own contract: only
      // meaningful when outcome === 'discordant' — a concordant
      // record has nothing to grade). This activity type deliberately
      // carries NO capaTriggerRule — an earlier version of this code
      // incorrectly fired a CAPA on every confirmed Critical/
      // Malignant finding, which would flood a real CAPA queue with
      // hundreds of records for correct, unremarkable diagnoses in
      // any department that reads cancer routinely. The real CAPA
      // triggers per direct guidance are three, specific, genuinely
      // different signals — none of which are "a primary read was
      // confirmed" — see mockQaActivityTypeService.ts's own, fuller
      // comment on this activity type for the complete account of
      // what's real vs. still-needed for each. Fire-and-forget, same
      // real posture as the PS-137 signal capture immediately below —
      // never blocks the actual sign-out action.
      const highestFinding = criticalFindings.find(f => f.severity === highest);

      // Real, per direct guidance (PS-136): automated dispatch,
      // additive to the mandatory human verbal-notification recorded
      // above — fires on whichever real channels the ordering
      // physician's own contact record actually supports. Fire-and-
      // forget, same posture as the QA-activity/agreement-signal
      // captures immediately below — never blocks the actual sign-out
      // action, and a real dispatch failure here must never prevent
      // the human notification already recorded from standing.
      dispatchCriticalAlerts({
        caseId: caseData.id,
        orderingPhysicianId: caseData.order?.orderingPhysicianId,
        findingTerm: highestFinding?.term ?? highest,
        findingSeverity: highest,
        sourceQuote: highestFinding?.sourceQuote ?? '',
        confirmedAt: patch.abnormalDetectionStatus.confirmedAt,
      }).catch(e => console.error('[AbnormalDetection] Could not dispatch automated critical alert:', e));

      qaActivityRecordService.create({
        activityTypeId: ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID,
        caseId: caseData.id,
        caseType: caseData.specimens?.[0]?.description || caseData.id,
        fieldValues: {
          findingTerm: highestFinding?.term ?? highest,
          findingSource: highestFinding?.sourceQuote ?? '',
        },
        outcome: 'concordant',
        recordedBy: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
      }).catch(e => console.error('[AbnormalDetection] Could not record QA activity for this confirmed finding:', e));
    }

    // Real, per direct guidance (PS-105/PS-137): "How often was their
    // agreement... an opportunity to feed that information back for
    // learning, just like we do when we add or remove synoptic
    // reports." Fire-and-forget, same real posture as the existing
    // Level 1 narrative-edit-signal capture elsewhere in this file —
    // never blocks the actual sign-out action on this background
    // capture. One real signal per finding actually shown in this
    // session, 'confirmed' outcome — the pathologist genuinely
    // recorded a real notification for it.
    criticalFindings.forEach(f => {
      const source: 'discrete' | 'narrative' = f.sourceField === 'synoptic' ? 'discrete' : 'narrative';
      const reasonClean = source === 'narrative' ? deidentifyText(f.sourceQuote).clean : f.sourceQuote;
      abnormalDetectionSignalService.recordSignal({
        caseId: caseData.id,
        source,
        reasonClean,
        suggestedSeverity: f.severity,
        suggestedConfidence: f.confidence,
        outcome: 'confirmed',
      }).catch(e => console.error('[AbnormalDetection] Could not record agreement signal:', e));
    });

    setAcknowledgedCritical(true);
    setShowCriticalFindingsModal(false);
  }, [caseData, criticalFindings, signingUser, setCaseData, knownVersionRef]);

  /** Real, per direct guidance - a soft block, not a hard one: the
   *  detection here is an LLM-based heuristic that can be wrong, and
   *  the finding may already have been communicated through a real
   *  means this feature doesn't capture. Acknowledging dismisses the
   *  modal without recording anything - a real, honest choice, not a
   *  forced action. */
  const handleAcknowledgeCriticalFindings = useCallback(() => {
    // Real, per direct guidance (PS-105/PS-137) — same real agreement-
    // tracking capture as handleRecordCriticalNotification above,
    // 'dismissed' outcome. Deliberately does NOT set
    // Case.abnormalDetectionStatus (see that field's own doc comment,
    // types/case/Case.ts) — this is a real signal for learning, not a
    // confirmed clinical status.
    criticalFindings.forEach(f => {
      const source: 'discrete' | 'narrative' = f.sourceField === 'synoptic' ? 'discrete' : 'narrative';
      const reasonClean = source === 'narrative' ? deidentifyText(f.sourceQuote).clean : f.sourceQuote;
      abnormalDetectionSignalService.recordSignal({
        caseId: caseData?.id ?? 'unknown',
        source,
        reasonClean,
        suggestedSeverity: f.severity,
        suggestedConfidence: f.confidence,
        outcome: 'dismissed',
      }).catch(e => console.error('[AbnormalDetection] Could not record agreement signal:', e));
    });
    setAcknowledgedCritical(true);
    setShowCriticalFindingsModal(false);
  }, [caseData, criticalFindings]);

  // ── Real finalization logic — shared by both finalize entry points ────────
  // Previously: handlePreFinalConfirm only console.log'd and closed the
  // modal — no status change, no persistence, no audit event. The OTHER
  // finalize path (handleFinalizeConfirm, reached via the AI Review →
  // FinalizeModal route when uncertain fields exist) had real logic
  // (signal capture) but ALSO never actually
  // set status: 'finalized' or persisted anything via caseRouter.updateCase.
  // Both paths must finalize identically — this is the one real
  // implementation both call.
  const finalizeCase = useCallback(async (
    excludedInstanceIds: string[] = []
  ): Promise<boolean> => {
    if (!caseData) return false;

    // ── Real write guard (dimension 4 — case relationship). Found via
    // direct investigation: any user who could VIEW this case (passes
    // the tenant/pool checks in caseAccessControl.ts) could also
    // finalize/sign it out, with zero check that they have any actual
    // relationship to this specific case — no participant record
    // required at all. Only the assigned Primary/Attending, or an
    // administrative role, may finalize. Checked first, before the
    // fixative-time gate below — there's no reason to walk someone
    // through resolving a data-completeness gate for a case they were
    // never going to be allowed to sign out anyway.
    const { participationTypes: finalizeParticipationTypes, performingLabFacilityId: finalizeLabId } =
      await resolveFinalizeAuthorityContext(caseData);
    const finalizeDecision = canFinalizeCase(getSessionUser(), caseData?.participants, finalizeParticipationTypes, finalizeLabId);
    if (!finalizeDecision.granted) {
      showToast(finalizeDecision.reason);
      return false;
    }

    // ── Pre-analytic date gate — hard block, per direct guidance's own
    // cross-jurisdiction compliance research (UKAS ISO 15189 Clause 7.2,
    // CAP/CLIA § 493.1241, RCPath, EU IVDR/ISO 15189, IANZ AS ISO
    // 15189:2022, KAZA/KSP/KSLM, NATA/NPAAC — every real jurisdiction
    // this app targets is a hard block here, never merely advisory; see
    // resolvePreAnalyticDateGateConfig.ts for the full per-country
    // citation/label/disclaimer). Checked BEFORE the fixation-time gate
    // below — basic accession date/time is more foundational than
    // biomarker-specific fixation timing. Both real gates now shared
    // with handleSignOutConfirm() below, via checkPreAnalyticAndFixativeGates()
    // — see that function's own header comment for why.
    const { preAnalyticBlocking, fixativeBlocking } = checkPreAnalyticAndFixativeGates(caseData, specimenDictionary);

    if (preAnalyticBlocking.length > 0) {
      setPreAnalyticDateGateSpecimens(preAnalyticBlocking);
      setPendingFinalizeArgs(excludedInstanceIds);
      setPendingActionIsSignOut(false);
      return false; // abort — do not finalize until the gate is resolved
    }

    // ── Fixation-time gate — hard block, per the design decision this was
    // built from. A specimen whose matched Specimen Dictionary entry has
    // requireFixativeTimeBeforeSignout (breast/biomarker-relevant types)
    // needs processing.processedAt documented before this case can sign
    // out. No preliminary-report escape valve exists yet — the
    // FixativeTimeGateModal is the entire interim safety valve until it
    // does, offering three legitimate resolutions (documented, estimated,
    // or confirmed unrecoverable) rather than either silently blocking
    // forever or silently allowing incomplete biomarker-relevant data
    // through.
    if (fixativeBlocking.length > 0) {
      setFixativeGateSpecimens(fixativeBlocking);
      setPendingFinalizeArgs(excludedInstanceIds);
      setPendingActionIsSignOut(false);
      return false; // abort — do not finalize until the gate is resolved
    }

    // Real, per PS-289/PS-292's own Gating Strategy — same real
    // ordering principle as the sibling call site above (checked
    // after the two more foundational gates).
    const stainQcBlockingFinalize = await checkStainQcGate(caseData);
    if (stainQcBlockingFinalize.length > 0) {
      setStainQcGateBlocking(stainQcBlockingFinalize);
      setPendingFinalizeArgs(excludedInstanceIds);
      setPendingActionIsSignOut(false);
      return false; // abort — do not finalize until the gate is resolved
    }

    const finalizedAt = new Date().toISOString();

    // Real feature, per direct specification: Post-Sign-Out Release
    // Buffer. Decision only, from the real, shared service — see
    // IReportReleaseService.ts's own doc comment on why this function
    // computes the buffer fields inline in its own, single patch below
    // rather than calling reportReleaseService.startBuffer() as a
    // second, separate write. Now async as of Phase 2 — real
    // Enterprise/Facility config resolution needs a real, async
    // facility lookup.
    const bufferResolution = await mockReportReleaseService.resolveBufferForCase(caseData);

    try {
      // CaseRouter.updateCase is deliberately Promise<void> — it writes to
      // the owning service and logs an independent audit event per source
      // system, by design (see CaseRouter's class doc comment). It never
      // returns the updated record. Since we already have everything we
      // just sent, merge it locally rather than waiting on a return value
      // that was never going to arrive.
      const patch = {
        // Real feature: a genuine buffer holds the case at
        // 'pending-release' rather than 'finalized' — finalizedAt is
        // still stamped now regardless (see CaseStatus's own
        // 'pending-release' doc comment for why TAT/SLA calculations
        // must never silently shift by the buffer duration). releasedAt
        // — the real, buffer-aware "genuinely final" moment — is set
        // immediately only when no buffer applies; otherwise real
        // release comes later, via checkAndReleaseIfExpired().
        status: (bufferResolution.applies ? 'pending-release' : 'finalized') as CaseStatus,
        finalizedAt,
        finalizedBy: signingUser?.id ?? null,
        releasedAt: bufferResolution.applies ? undefined : finalizedAt,
        releaseBufferExpiresAt: bufferResolution.applies
          ? new Date(Date.now() + bufferResolution.durationMinutes * 60_000).toISOString()
          : undefined,
        releaseBufferDurationMinutes: bufferResolution.applies ? bufferResolution.durationMinutes : undefined,
        preReleaseBufferStatus: bufferResolution.applies ? caseData.status : undefined,
      };

      await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;

      const updated = { ...caseData, ...patch } as typeof caseData;
      setCaseData(updated);

      log('case_finalized', {
        caseId: caseData.id,
        accession: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber,
        finalizedBy: signingUser?.id ?? 'unknown',
        excludedCount: excludedInstanceIds.length,
      });
      if (bufferResolution.applies) {
        log('sign_out_buffered', {
          caseId: caseData.id,
          accession: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber,
          durationMinutes: bufferResolution.durationMinutes,
          facilityId: caseData.originHospitalId,
        });
      }

      showToast(bufferResolution.applies
        ? t('useSignOutWorkflow.toast.reportSignedReleaseIn', { minutes: bufferResolution.durationMinutes })
        : t('useSignOutWorkflow.toast.reportFinalized'));

      // Real, per direct guidance: the actual detection + raising step
      // for Trigger A/Trigger B, run here (inside the one, real, shared
      // finalize implementation) rather than in either outer caller -
      // a real, previously-shipped bug had this logic only in
      // handleFinalizeConfirm's own wrapper, meaning
      // handlePreFinalConfirm (the actual PRIMARY finalize path, per
      // this function's own header comment) never triggered it at
      // all. Fire-and-forget, deliberately never awaited - a failure
      // here must never surface as a sign-out failure.
      (async () => {
        const findings = await fetchBillingDeficiencyFindings();
        if (findings.length === 0) return;
        await Promise.all(findings.map(f => mockBillingDeficiencyService.raise({
          caseId: caseData.id,
          chargeRecordId: f.chargeRecordId,
          deficiencyType: f.deficiencyType,
          severity: BILLING_DEFICIENCY_SEVERITY[f.deficiencyType],
          raisedByTrigger: f.deficiencyType === 'NCCI_BUNDLING_VIOLATION' ? 'AUTO_NCCI_CHECK' : 'AUTO_CROSSWALK_CHECK',
          auditorNotes: f.auditorNotes,
          createdBy: 'system',
        })));
        showToast(t('useSignOutWorkflow.toast.billingItemsFlaggedQa', { count: findings.length }));
      })().catch(e => console.error('[PathScribe] Billing deficiency raise failed (non-blocking):', e));

      // Real, per direct guidance's own Code Review Pool design - the
      // random-sampling half (the manual-flagging half already exists
      // via the Request Colleague Review modal). Deliberately its own,
      // independent fire-and-forget block, same reasoning as every
      // other real block here - a failure must never affect sign-out
      // or any other real, independent post-finalize action. No toast
      // for a random selection - per direct confirmation, a random
      // compliance pull isn't actionable by the originating
      // pathologist, so it stays silent to them (unlike the manual
      // flagging path, which is a deliberate, visible action someone
      // just took).
      (async () => {
        if (!caseData.originHospitalId) return;
        const orderingRes = await facilityService.getById(caseData.originHospitalId);
        if (!orderingRes.ok) return;
        const labId = resolvePerformingLabFacilityId(orderingRes.data);
        if (!labId) return;
        const labRes = labId === caseData.originHospitalId ? orderingRes : await facilityService.getById(labId);
        if (!labRes.ok) return;
        if (!shouldRandomlySampleForCodeReview(labRes.data.codeReviewSamplingRatePercent)) return;
        await mockCodeReviewPoolService.create({
          caseId: caseData.id,
          caseLabel: caseData.patient ? `${caseData.patient.lastName}, ${caseData.patient.firstName}` : undefined,
          source: 'RANDOM_SAMPLE',
          performingLabFacilityId: labId,
        });
        // Real, per direct guidance's own follow-up on the broader
        // provenance & auditability sweep: the pool entry itself is a
        // real, persisted record, but every other similar
        // routing/flagging event this app builds also gets a separate,
        // case-searchable audit log entry - this one didn't. Silent
        // to the pathologist (no toast, per direct confirmation
        // above) is a UI decision, not a reason to leave the case's
        // own audit history blank about a real, significant event
        // that happened to it.
        log('code_review_random_sample', {
          caseId: caseData.id,
          performingLabFacilityId: labId,
          samplingRatePercent: labRes.data.codeReviewSamplingRatePercent,
        });
      })().catch(e => console.error('[PathScribe] Random code review sampling failed (non-blocking):', e));

      // Real, per Epic: PathScribe Outbound Billing & Charge Event
      // Engine, User Story 2 - "hold 26 and Combined codes until
      // CASE_SIGNED_OUT." Deliberately its own, independent
      // fire-and-forget block, not merged with the billing-deficiency
      // one above - a failure in one must never affect the other.
      (async () => {
        const chargesRes = await mockServiceChargeService.getChargesForCase(caseData.id);
        if (!chargesRes.ok) return;
        const alreadyQueuedRes = await mockOutboundChargeQueueService.getByServiceChargeRecordIds(
          chargesRes.data.map(c => c.id)
        );
        const alreadyQueuedIds = new Set(alreadyQueuedRes.ok ? alreadyQueuedRes.data.map(e => e.serviceChargeRecordId) : []);
        const triggerMapRes = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap(caseData.order?.siteId);
        const toEnqueue = sweepChargesForOutbox(chargesRes.data, 'CASE_SIGNED_OUT', alreadyQueuedIds, triggerMapRes.ok ? triggerMapRes.data : undefined);
        const metadataFailures = validateChargeMetadata(caseData);
        await Promise.all(toEnqueue.map(async f => {
          const enqueueRes = await mockOutboundChargeQueueService.enqueue({
            serviceChargeRecordId: f.serviceChargeRecordId,
            caseId: f.caseId,
            specimenId: f.specimenId,
            billingType: f.billingType,
            triggerEvent: 'CASE_SIGNED_OUT',
          });
          if (enqueueRes.ok && metadataFailures.length > 0) {
            await mockOutboundChargeQueueService.markFailed(enqueueRes.data.id, {
              errorCode: metadataFailures[0].errorCode,
              errorMessage: metadataFailures[0].errorMessage,
              maxRetriesExceeded: false,
            });
          }
        }));
      })().catch(e => console.error('[PathScribe] Outbound charge queue sweep failed (non-blocking):', e));

      return true;
    } catch (err) {
      // The actual finalize action — the highest-stakes write in this
      // file. Strict, block-only treatment, same reasoning as every
      // other finalize-adjacent write: proceeding against a stale
      // version here risks finalizing over content the pathologist
      // never actually saw.
      if (handleConcurrencyConflict(err, setConcurrencyConflict, { blockOverride: true })) return false;
      console.error('[Finalise] Failed to persist finalization:', err);
      showToast(t('useSignOutWorkflow.toast.finalizationFailed'));
      return false;
    }
  }, [caseData, signingUser, log, showToast, specimenDictionary, knownVersionRef, setCaseData, setConcurrencyConflict, setFixativeGateSpecimens, setStainQcGateBlocking, setPreAnalyticDateGateSpecimens, setPendingFinalizeArgs, fetchBillingDeficiencyFindings, t]);

  // Real feature, per direct follow-up: "Wire evaluateMicroscopicFinalizeGate
  // into handleRequestFinalize." Genuinely case-wide, unlike
  // validateRequired() above (which only ever checks whichever ONE
  // report instance happens to be active in the sidebar right now) —
  // finalize blocks the entire case's sign-out, so every specimen's
  // real microscopic state needs checking, not just whichever one a
  // pathologist happened to have selected last.
  //
  // requiresMicroscopicNarrative hardcoded to false for every
  // specimen — the real, admin-configurable procedure-code-level
  // setting per direct decision doesn't have a real config screen
  // built yet (a real, separate, flagged follow-up). Rule 4 (no
  // synoptic template assigned at all) still applies regardless, so
  // this isn't a silent no-op: a case with genuinely nothing
  // documenting it is still correctly blocked.
  const getMicroscopicBlockingSpecimens = useCallback(async (): Promise<{ specimenLabel: string; specimenId: string; reasonKey: string }[]> => {
    if (!caseData) return [];
    const specimens = caseData.specimens ?? [];
    const blocking: { specimenLabel: string; specimenId: string; reasonKey: string }[] = [];

    // Real, deliberate cache — several specimens can share the same
    // real synoptic templateId (e.g. the same CAP protocol assigned
    // to multiple specimens), and getTemplate() is a real, async
    // service call not worth repeating per specimen when the result
    // would be identical.
    const templateCache = new Map<string, Awaited<ReturnType<typeof getTemplate>>>();

    for (const specimen of specimens) {
      const microInstance = (caseData.microscopicReports ?? []).find(m => m.specimenId === specimen.id);
      const microscopicStatus: MicroscopicNarrativeStatus = microInstance?.status ?? 'not-started';
      const microscopicText = microInstance?.text ?? '';

      // Rules 1/2 in evaluateMicroscopicFinalizeGate never need
      // synoptic data at all (draft always blocks; real, saved text
      // always allows) — skip the real, async template fetch below
      // entirely for those two cases, not just for tidiness: avoids
      // a real network/service call finalize doesn't actually need to
      // wait on.
      if (microscopicStatus === 'draft' || (microscopicStatus === 'saved' && microscopicText.trim().length > 0)) {
        const result = evaluateMicroscopicFinalizeGate({
          microscopicStatus, microscopicText,
          hasSynopticTemplate: false, allRequiredSynopticFieldsComplete: false,
          requiresMicroscopicNarrative: false,
        });
        if (result.blocked) blocking.push({ specimenId: specimen.id, specimenLabel: specimen.label, reasonKey: result.reasonKey! });
        continue;
      }

      const synopticInstances = (caseData.synopticReports ?? [])
        .filter(r => r.specimenId === specimen.id);
      const hasSynopticTemplate = synopticInstances.length > 0;

      let allRequiredSynopticFieldsComplete = true;
      if (hasSynopticTemplate) {
        for (const inst of synopticInstances) {
          let detail = templateCache.get(inst.templateId);
          if (!detail) {
            try {
              detail = await getTemplate(inst.templateId);
              templateCache.set(inst.templateId, detail);
            } catch (e) {
              console.error(`[Finalize] Could not load template ${inst.templateId} for microscopic gate check:`, e);
              // Real, honest fallback — an unloadable template's own
              // completeness genuinely can't be verified; treated as
              // incomplete rather than silently assumed complete, the
              // same fail-safe direction every other real blocking
              // check in this app already takes.
              allRequiredSynopticFieldsComplete = false;
              continue;
            }
          }
          const answers = inst.answers ?? {};
          const hasIncomplete = (detail.template?.sections ?? []).some(sec => {
            if (!isVisible((sec as any).visibleWhen, answers)) return false;
            return (sec.fields ?? []).some((f: any) => {
              if (!f.required || !isVisible(f.visibleWhen, answers)) return false;
              const val = answers[f.id];
              return !val || (Array.isArray(val) ? val.length === 0 : val.toString().trim() === '');
            });
          });
          if (hasIncomplete) allRequiredSynopticFieldsComplete = false;
        }
      }

      const result = evaluateMicroscopicFinalizeGate({
        microscopicStatus, microscopicText,
        hasSynopticTemplate, allRequiredSynopticFieldsComplete,
        requiresMicroscopicNarrative: false,
      });
      if (result.blocked) blocking.push({ specimenId: specimen.id, specimenLabel: specimen.label, reasonKey: result.reasonKey! });
    }

    return blocking;
  }, [caseData]);

  // Real, per direct guidance ("alert the Pathologist with a warning
  // message, but not block") and per Trigger A's own real trigger
  // event ("Pathologist attempts electronic signature") - called from
  // handleRequestFinalize, the actual moment the pathologist clicks
  // Finalize, BEFORE PreFinalisationModal even opens. Read-only -
  // never raises a BillingDeficiencyRecord itself (that's a real,
  // durable audit event that should only happen once the case has
  // actually, successfully signed out - see finalizeCase's own
  // comment) - this is purely the real-time heads-up. Deliberately
  // never blocks: shows the toast, then lets the caller continue
  // straight on to PreFinalisationModal regardless of what it finds.
  const previewBillingWarnings = useCallback(async () => {
    const findings = await fetchBillingDeficiencyFindings();
    if (findings.length === 0) return;
    showToast(
      findings.length === 1
        ? t('useSignOutWorkflow.toast.billingNoteSingle', { note: findings[0].auditorNotes })
        : t('useSignOutWorkflow.toast.billingItemsFlaggedStartingWith', { count: findings.length, note: findings[0].auditorNotes })
    );
  }, [fetchBillingDeficiencyFindings, showToast, t]);

  const handleRequestFinalize = useCallback(async (andNext: boolean) => {
    setFinalizeAndNextPending(andNext);
    // Real feature, per direct follow-up: "putting a case on Hold at
    // the case level makes sense if there is something truly wrong."
    // Checked first, before every other gate below — an active hold
    // means something genuinely needs resolving; there's no reason to
    // walk a pathologist through the microscopic/fixative/required-
    // field gates for a case that can't proceed regardless of what
    // those checks find.
    const activeCaseHold = (caseData?.caseHolds ?? []).find(h => h.active);
    if (activeCaseHold) {
      showToast(t('useSignOutWorkflow.toast.caseOnHold', { note: activeCaseHold.note }));
      return;
    }
    // Real fix, found via direct live verification before shipping this:
    // this check MUST run before the synopticPanelRef.current check
    // below, not after it. It's genuinely independent of which panel
    // happens to be mounted (it reads caseData directly, never
    // synopticPanelRef) — but the pathologist is very often looking at
    // the Microscopic panel itself right when they click Finalize
    // (the exact moment this whole feature exists for), and
    // RightSynopticPanel — and therefore synopticPanelRef.current —
    // isn't mounted at all while that panel is showing. Running this
    // after the old `if (!synopticPanelRef.current)` early return
    // would have silently bypassed this entire gate in exactly the
    // scenario it's built to catch, confirmed live: it opened
    // PreFinalisationModal straight through, with zero warning, on a
    // case with nothing documenting it at all.
    const microscopicBlocking = await getMicroscopicBlockingSpecimens();
    if (microscopicBlocking.length > 0) {
      const first = microscopicBlocking[0];
      const firstReasonText = t(first.reasonKey);
      showToast(
        microscopicBlocking.length === 1
          ? t('useSignOutWorkflow.toast.specimenBlocking', { label: first.specimenLabel, reason: firstReasonText })
          : t('useSignOutWorkflow.toast.specimensNeedAttention', { count: microscopicBlocking.length, label: first.specimenLabel, reason: firstReasonText })
      );
      setActiveSpecimenId(first.specimenId);
      setActiveReportType('microscopic');
      return;
    }
    // Real, per direct guidance's own revised PS-105 scope ("Sign-Out
    // Guardrails" - soft block): a real, detected 'critical' severity
    // finding must be acknowledged or recorded before finalize can
    // proceed. Checked here, the one shared point before both real
    // setShowPreFinalise(true) exit paths below - never re-blocks
    // once the pathologist has already acted on this session's
    // findings once.
    if (!acknowledgedCritical) {
      const findings = await fetchCriticalFindings();
      // Real, per direct guidance's own severity unification with
      // PS-129: gates on Critical AND Malignant (both more severe than
      // the original single 'critical' level this replaced) — Abnormal
      // alone still doesn't prompt this modal, same original intent.
      const criticalOnly = findings.filter(f => f.severity === 'Critical' || f.severity === 'Malignant');
      if (criticalOnly.length > 0) {
        setCriticalFindings(criticalOnly);
        setShowCriticalFindingsModal(true);
        return;
      }
    }
    if (!synopticPanelRef.current) {
      previewBillingWarnings().catch(e => console.error('[PathScribe] Billing warning preview failed (non-blocking):', e));
      setPreFinalSynoptics(await buildSynopticsForReview());
      setShowPreFinalise(true);
      return;
    }
    const missing = synopticPanelRef.current.validateRequired();
    if (missing.length > 0) { setMissingFields(missing); setShowMissingWarning(true); return; }
    // Real fix, per direct product decision: any required field with
    // an AI suggestion still sitting unverified — regardless of
    // confidence or source-match — blocks finalize outright and sends
    // the pathologist straight to it, rather than opening a separate
    // review modal. An unconfirmed AI value getting silently accepted
    // at finalize is exactly the "AI accepted blindly" pattern that
    // doesn't hold up under regulatory scrutiny; this closes it for
    // good rather than softening it with a confidence threshold.
    const blocking = synopticPanelRef.current.getBlockingUnverifiedFields();
    if (blocking.length > 0) {
      showToast(
        blocking.length === 1
          ? t('useSignOutWorkflow.toast.aiSuggestionNeedsReview', { label: blocking[0].fieldLabel })
          : t('useSignOutWorkflow.toast.aiSuggestionsNeedReview', { count: blocking.length, label: blocking[0].fieldLabel })
      );
      if (isOrchestrationMode) safeSetLeftTab('draft');
      setAlertFieldId(blocking[0].fieldId);
      return;
    }
    // Real, per direct guidance: fire-and-forget, deliberately never
    // awaited - the actual "pathologist attempts electronic signature"
    // moment (Trigger A's own real trigger event), but this must never
    // delay or block PreFinalisationModal from opening.
    previewBillingWarnings().catch(e => console.error('[PathScribe] Billing warning preview failed (non-blocking):', e));
    setPreFinalSynoptics(await buildSynopticsForReview());
    setShowPreFinalise(true);
  }, [buildSynopticsForReview, caseData, synopticPanelRef, showToast, setAlertFieldId, isOrchestrationMode, safeSetLeftTab, getMicroscopicBlockingSpecimens, setActiveSpecimenId, setActiveReportType, previewBillingWarnings, acknowledgedCritical, fetchCriticalFindings, t]);

  const handlePreFinalConfirm = useCallback((_ordered: string[], _excluded: string[]) => {
    setShowPreFinalise(false);
    // Credentials already verified inside PreFinalisationModal.
    // _ordered is the pathologist's final section/synoptic ordering choice
    // from the drag-to-reorder interaction — display order only, not
    // persisted here since it doesn't affect report content or status.
    //
    // ROOT FIX — this is the PRIMARY finalize path (PreFinalisationModal
    // shows the full report; this is what runs when there's nothing
    // requiring the AI-review fallback). It previously called only
    // finalizeCase(), fire-and-forget, with zero amendment/addendum
    // awareness — meaning an in-progress amendment finalized through the
    // normal expected flow would NEVER get released at all, regardless
    // of any race condition. Now shares the same fixed logic as the
    // fallback path (handleFinalizeConfirm), properly sequenced.
    (async () => {
      const succeeded = await finalizeCase(_excluded);
      if (succeeded) await releasePendingAmendmentOrAddendum();
    })();
  }, [finalizeCase, releasePendingAmendmentOrAddendum]);

  const handleFinalizeConfirm = useCallback(() => {
    if (synopticPanelRef.current) {
      const { verificationSummary } = synopticPanelRef.current.sweepAndGetFinalState();
      console.info('[PathScribe] Finalization sweep:', verificationSummary);
    }
    setShowFinalizeModal(false);

    // ── Level 1 AI learning — capture narrative edit signals ──────────────────
    // Record the diff between AI-generated text and pathologist's final version
    // for each orchestration section. Stored for future few-shot / fine-tuning.
    if (isOrchestrationMode && orchSections.length > 0) {
      import('@/services/narrativeSignals/mockNarrativeSignalService').then(
        async ({ mockNarrativeSignalService, computeEditRatio }) => {
          const { deidentifySignal } = await import('@/services/narrativeSignals/deidentification');

          // ── Resolve the active study (if any) covering this case ───────────
          // Previously: studyId always read (caseData as any)?.activeStudyId,
          // a field NOTHING in the codebase ever sets — every real signal got
          // studyId: undefined regardless of whether an active study's scope
          // actually covered this case/pathologist/subspecialty. The matching
          // logic already existed (getStudyForCase), it was just never called
          // anywhere. Calling it here, at signal-capture time, is correct
          // because study membership is evaluated per-case at the moment of
          // finalization, not stored ahead of time.
          let resolvedStudyId: string | undefined;
          try {
            const { mockValidationStudyService } = await import('@/services/validationStudies/mockValidationStudyService');
            const clientId       = caseData?.order?.facilityId ?? '';
            const pathologistId  = signingUser?.id ?? '';
            const subspecialtyId = caseData?.subspecialtyId;
            const studyResult = await mockValidationStudyService.getStudyForCase(clientId, pathologistId, subspecialtyId);
            if (studyResult.ok && studyResult.data) {
              resolvedStudyId = studyResult.data.id;
            }
          } catch (e) {
            console.error('[PathScribe] Study lookup failed — signals will record without studyId:', e);
          }

          const signals = orchSections
            .filter(s => s.aiGenerated || s.text)
            .map(s => {
              const editRatio = computeEditRatio(s.aiGenerated, s.text);
              const deid      = deidentifySignal(s.aiGenerated, s.text, editRatio);
              return {
                caseId:             caseData?.id ?? '',
                accessionNumber:    caseData?.accession?.fullAccession ?? caseData?.accession?.accessionNumber ?? '',
                // Still genuinely missing from Case — unlike finalizedAt/
                // finalizedBy/pendingAddendumId, nothing in the codebase
                // resolves or persists this anywhere yet (Config → Report
                // Templates' Routing Rules resolve a template per-request,
                // they don't write the result back onto the case), so
                // there's no real value this could ever read here. Left
                // as an explicit fallback rather than invented as a
                // real Case field with nothing to populate it.
                reportTemplateId:   'tmpl-gold-standard',
                templateName:       s.label,
                sectionId:          s.id,
                sectionTitle:       s.label,
                aiGeneratedClean:   deid.aiGeneratedClean,
                finalTextClean:     deid.finalTextClean,
                structuralEditType: deid.structuralEditType,
                replacementCount:   deid.replacementCount,
                editRatio,
                wasAccepted:        s.aiGenerated === s.text && !!s.aiGenerated,
                subspecialtyId:     caseData?.subspecialtyId,
                studyId:            resolvedStudyId,
              };
            });
          mockNarrativeSignalService.recordSignals(signals).then(() => {
            console.info(`[PathScribe] Recorded ${signals.length} de-identified signal(s)${resolvedStudyId ? ` for study ${resolvedStudyId}` : ' (no active study match)'}`);
          });
        }
      ).catch(console.error);
    }

    // Genuine first-time finalize OR amendment/addendum completion —
    // properly sequenced: finalizeCase() first (awaited, not
    // fire-and-forget), THEN the amendment/addendum release, so there's
    // no race between the two independently updating caseData from
    // stale closures. Previously finalizeCase() ran fire-and-forget
    // while this same logic ran inline right after it — whichever one's
    // setCaseData call resolved last would silently clobber the other,
    // which is exactly why the "AMENDMENT IN PROGRESS" banner stayed
    // stuck inconsistently rather than every time.
    (async () => {
      const succeeded = await finalizeCase();
      if (succeeded) await releasePendingAmendmentOrAddendum();
    })();
  }, [setShowFinalizeModal, caseData, activeReportInstanceId, setAmendmentMode, setShowAmendmentModal, isOrchestrationMode, orchSections, finalizeCase, releasePendingAmendmentOrAddendum, signingUser, synopticPanelRef, openAmendmentDraft]);

  // Real, per direct guidance's own confirmed, foundational gap (PS-274):
  // suggestSynopticFields() and AiReviewModal were both already real
  // and live, but nothing ever connected them. This is that missing
  // connection — reuses the exact same real getTemplate()/PathScribeAIService
  // patterns already established elsewhere in this same file, rather
  // than inventing new ones. Real, confirmed direction: an orchestrator-
  // mode option (a user can dictate/enter the narrative and let AI fill
  // the synoptic) — assist/LIS mode's own real trigger for this same
  // underlying call is real, separate UI work, not built here.
  // Real, per direct guidance's own confirmed correction: "Gross
  // Complete" was the wrong trigger point (it implies the narrative or
  // synoptic was already reviewed — too late to offer AI help). Real,
  // second confirmed correction: a single, auto-detecting action was
  // also the wrong shape — it silently does nothing when both sides
  // already have content, and gives the user no way to explicitly ask
  // for one direction regardless of current state. Two separate,
  // explicitly user-triggered actions instead — each always attempts
  // its own real direction when called, regardless of whether the
  // other side already has content (a real user re-running
  // suggestions after editing the narrative further is a legitimate,
  // real use, not an error state).
  const handleSuggestSynopticFromNarrative = useCallback(async () => {
    if (!caseData?.id) return;
    const activeInstance = activeReportInstanceId
      ? caseData.synopticReports?.find(r => r.instanceId === activeReportInstanceId)
      : caseData.synopticReports?.[0];

    const caseText = {
      gross: caseData.diagnostic?.grossDescription ?? '',
      microscopic: caseData.diagnostic?.microscopicDescription ?? '',
      ancillary: caseData.diagnostic?.ancillaryStudies ?? '',
    };

    if (!caseText.gross.trim() && !caseText.microscopic.trim() && !caseText.ancillary.trim()) {
      showToast(t('useSignOutWorkflow.toast.enterNarrativeBeforeAiSuggestions'));
      return;
    }
    if (!activeInstance?.templateId) {
      showToast(t('useSignOutWorkflow.toast.noSynopticTemplateAssigned'));
      return;
    }

    setIsSuggestingSynoptic(true);
    try {
      let template: EditorTemplate | undefined;
      try {
        const detail = await getTemplate(activeInstance.templateId);
        template = detail.template;
      } catch (e) {
        showToast(t('useSignOutWorkflow.toast.couldNotLoadTemplateForAiSuggestion'));
        return;
      }
      if (!template) return;

      const fields = template.sections.flatMap((s: any) => s.fields.map((f: any) => ({
        id: f.id, label: f.label, options: (f.options ?? []).map((o: any) => ({ id: o.id, label: o.label })),
      })));

      const aiService = new PathScribeAIService();
      const result = await aiService.suggestSynopticFields(caseText, fields);
      if (!result.success || !result.data) {
        showToast(t('useSignOutWorkflow.toast.aiSuggestionFailed'));
        return;
      }

      const newReviewFields = buildReviewFieldsFromAiSuggestions(result.data, template, caseData);
      if (newReviewFields.length === 0) {
        showToast(t('useSignOutWorkflow.toast.aiFoundNoFields'));
        return;
      }
      setReviewFields(newReviewFields);
      setShowAiReview(true);
    } finally {
      setIsSuggestingSynoptic(false);
    }
  }, [caseData, activeReportInstanceId, showToast, setReviewFields, setShowAiReview, t]);

  // Real, per direct guidance's own confirmed PS-275 scope (Phase 2,
  // the reverse of PS-274's own Narrative -> Synoptic direction).
  // Builds the real prompt from the case's own current synoptic
  // answers (PathScribeAIService.generateNarrativeFromSynopticAnswers,
  // which itself reuses buildSynopticNarrativePrompt.ts \u2014 never
  // duplicated here), then opens AiNarrativeReviewModal.tsx \u2014 the
  // real, deliberately separate review surface PS-275 itself called
  // for, since generated prose has no per-field confidence score the
  // way AiReviewModal's own discrete field values do.
  const handleGenerateNarrativeFromSynoptic = useCallback(async () => {
    if (!caseData?.id) return;
    const activeInstance = activeReportInstanceId
      ? caseData.synopticReports?.find(r => r.instanceId === activeReportInstanceId)
      : caseData.synopticReports?.[0];
    const synopticAnswers = activeInstance?.answers ?? caseData.synopticAnswers ?? {};

    if (Object.keys(synopticAnswers).length === 0) {
      showToast(t('useSignOutWorkflow.toast.answerFieldsBeforeGeneratingNarrative'));
      return;
    }
    if (!activeInstance?.templateId) {
      showToast(t('useSignOutWorkflow.toast.noSynopticTemplateAssigned'));
      return;
    }

    setIsGeneratingNarrative(true);
    try {
      let template: EditorTemplate | undefined;
      try {
        const detail = await getTemplate(activeInstance.templateId);
        template = detail.template;
      } catch (e) {
        showToast(t('useSignOutWorkflow.toast.couldNotLoadTemplateForNarrativeGeneration'));
        return;
      }
      if (!template) return;

      const aiService = new PathScribeAIService();
      const result = await aiService.generateNarrativeFromSynopticAnswers(template, synopticAnswers);
      if (!result.success || !result.data) {
        showToast(t('useSignOutWorkflow.toast.narrativeGenerationFailed'));
        return;
      }

      setGeneratedNarrativeText(result.data);
      setShowNarrativeReview(true);
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, [caseData, activeReportInstanceId, showToast, t]);

  /** Real, per direct guidance's own confirmed PS-275 review step:
   *  the pathologist's own final, possibly-edited text — never the
   *  raw AI output unconditionally — lands in the real diagnostic
   *  field they chose in AiNarrativeReviewModal.tsx. Persists via the
   *  same real caseRouter.updateCase() + knownVersionRef pattern this
   *  file already uses elsewhere for diagnostic field writes. */
  const handleAcceptGeneratedNarrative = useCallback(async (
    finalText: string,
    targetField: 'gross' | 'microscopic' | 'ancillary',
  ) => {
    if (!caseData?.id) return;
    const diagnosticKey = targetField === 'gross' ? 'grossDescription'
      : targetField === 'microscopic' ? 'microscopicDescription'
      : 'ancillaryStudies';

    const updatedDiagnostic = { ...caseData.diagnostic, [diagnosticKey]: finalText };
    setCaseData({ ...caseData, diagnostic: updatedDiagnostic, updatedAt: new Date().toISOString() } as any);
    setShowNarrativeReview(false);

    try {
      await caseRouter.updateCase(caseData.id, { diagnostic: updatedDiagnostic } as any, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      showToast(t('useSignOutWorkflow.toast.narrativeInsertedSaveFailed'));
    }
  }, [caseData, setCaseData, knownVersionRef, showToast, t]);

  return {
    finalizeSignOut,
    handleSignOutConfirm,
    handleReturnToTrainee,
    buildSynopticsForReview,
    finalizeCase,
    missingFields, setMissingFields,
    showMissingWarning, setShowMissingWarning,
    reviewFields, setReviewFields,
    showAiReview, setShowAiReview,
    handleSuggestSynopticFromNarrative,
    isSuggestingSynoptic,
    handleGenerateNarrativeFromSynoptic,
    isGeneratingNarrative,
    showNarrativeReview, setShowNarrativeReview,
    generatedNarrativeText,
    handleAcceptGeneratedNarrative,
    finalizeAndNextPending, setFinalizeAndNextPending,
    showPreFinalise, setShowPreFinalise,
    preFinalSynoptics,
    handleRequestFinalize,
    handlePreFinalConfirm,
    handleFinalizeConfirm,
    criticalFindings,
    showCriticalFindingsModal, setShowCriticalFindingsModal,
    handleRecordCriticalNotification,
    handleAcknowledgeCriticalFindings,
  };
}
