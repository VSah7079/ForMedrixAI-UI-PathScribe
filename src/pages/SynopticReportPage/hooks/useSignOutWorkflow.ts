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
import { getSessionUser, canFinalizeCase } from '@/services/auth/caseAccessControl';
import { countersignService, userService, fppeAssignmentService } from '@/services';
import { intraoperativeService } from '@/services';
import { amendmentService, reportVersionService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockReportReleaseService } from '@/services/reportRelease/mockReportReleaseService';
import { sendEmail } from '@/services/communications/notificationService';
import type { FixativeGateSpecimen } from '../modals/FixativeTimeGateModal';
import { PreFinalisationModal, type SynopticForReview } from '../modals/PreFinalisationModal';
import { getFieldLabel, type ReportingStandard } from '@/utils/synopticFieldLabels';
import { getTemplate } from '@/services/templates/templateService';
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
  setPendingFinalizeArgs: (args: string[]) => void;
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

export function useSignOutWorkflow({
  caseData, setCaseData, signingUser, showToast, activeReportInstanceId,
  knownVersionRef, setConcurrencyConflict, sendSynopticReportToLis,
  generateReportPdfSnapshot, isOrchestrationMode, orchSections,
  setCaseSigned, setShowSignOutModal, setPendingReconciliation,
  countersignFeedback, specimenDictionary, setFixativeGateSpecimens,
  setPendingFinalizeArgs, synopticPanelRef, setAlertFieldId, safeSetLeftTab, setAmendmentMode,
  setActiveSpecimenId, setActiveReportType,
  setShowAmendmentModal, setShowFinalizeModal, openAmendmentDraft,
  releasePendingAmendmentOrAddendum, log,
}: UseSignOutWorkflowParams) {
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
          if (generationError) showToast(`Version saved, but PDF snapshot failed to generate: ${generationError}`);
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
        showToast(`Warning: ${failedInstances.length} corrected synoptic instance(s) could not be transmitted — they remain in your triage queue, not finalized.`);
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
          showToast(`Version saved, but PDF snapshot failed to generate: ${generationError}`);
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
    showToast('Case signed out successfully');
  }, [caseData, sendSynopticReportToLis, generateReportPdfSnapshot, isOrchestrationMode, signingUser, setCaseSigned, setShowSignOutModal, showToast, setCaseData, knownVersionRef, setConcurrencyConflict, setPendingReconciliation]);

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
      showToast('This report is already Pending Release — recall it first if you need to make further changes.');
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
      const residentParticipant = caseData?.participants?.find(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === signingUser?.id && p.participationTypeIds?.includes('resident')
      );
      const isAttendingToo = caseData?.participants?.some(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === signingUser?.id && p.participationTypeIds?.includes('attending')
      );
      const provisionalParticipant = caseData?.participants?.find(
        (p: CaseParticipant) => p.status === 'active' && p.staffId === signingUser?.id && p.participationTypeIds?.includes('provisional_hire')
      );
      const activeFppeAssignment = provisionalParticipant && !isAttendingToo
        ? await fppeAssignmentService.getActiveAssignmentForUser(signingUser?.id ?? '', caseData?.subspecialtyId).then(r => r.ok ? r.data : null).catch(() => null)
        : null;

      if ((residentParticipant && !isAttendingToo) || activeFppeAssignment) {
        const releasedAnswersSnapshot: Record<string, Record<string, string | string[]>> = {};
        (caseData.synopticReports ?? []).forEach((r: SynopticReportInstance) => { releasedAnswersSnapshot[r.instanceId] = r.answers ?? {}; });

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
        const reviewerId = activeFppeAssignment?.proctorUserId ?? attendingParticipant?.staffId;
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

        showToast(`Case ${caseData.id} released for attending countersign`);
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
    const signOutFinalizeDecision = canFinalizeCase(getSessionUser(), caseData?.participants);
    if (!signOutFinalizeDecision.granted) {
      showToast(signOutFinalizeDecision.reason);
      setShowSignOutModal(false);
      return;
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
        const assignmentRes = await fppeAssignmentService.getActiveAssignmentForUser(provisionalOnThisCase.staffId, caseData?.subspecialtyId).catch(() => null);
        if (assignmentRes?.ok && assignmentRes.data) {
          await fppeAssignmentService.recordCaseReviewed(assignmentRes.data.id).catch(() => {});
        }
      }
    }

    // Real Frozen-to-Permanent Reconciliation check — only fires when
    // this case actually has a merged intraop specimen with a real
    // frozen category (not 'deferred' — no real call was made at
    // frozen, so there's nothing to reconcile). Everything else signs
    // out exactly as it always did.
    if (caseData?.id) {
      const res = await intraoperativeService.getAll();
      if (res.ok) {
        const mergedSession = res.data.find(e => e.status === 'merged' && e.mergedIntoCaseId === caseData.id);
        const specimenNeedingReconciliation = mergedSession?.specimens.find(s => s.frozenCategory && s.frozenCategory !== 'deferred');
        if (mergedSession && specimenNeedingReconciliation) {
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
    finalizeSignOut();
  }, [caseData, finalizeSignOut, signingUser, showToast, countersignFeedback, setShowSignOutModal, knownVersionRef, setConcurrencyConflict, setCaseData, setPendingReconciliation]);

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
  const [finalizeAndNextPending, setFinalizeAndNextPending] = useState(false);

  // ── Pre-finalisation + protocol review state ───────────────────────
  const [showPreFinalise,   setShowPreFinalise]   = useState(false);
  const [preFinalSynoptics, setPreFinalSynoptics] = useState<SynopticForReview[]>([]);

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
    const finalizeDecision = canFinalizeCase(getSessionUser(), caseData?.participants);
    if (!finalizeDecision.granted) {
      showToast(finalizeDecision.reason);
      return false;
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
    const blockingSpecimens: FixativeGateSpecimen[] = (caseData.specimens ?? [])
      .filter((sp: Specimen) => {
        const entry = sp.specimenDictionaryEntryId
          ? specimenDictionary.find(e => e.id === sp.specimenDictionaryEntryId)
          : undefined;
        return entry?.requireFixativeTimeBeforeSignout && !sp.processing?.processedAt;
      })
      .map((sp: Specimen) => ({ specimenId: sp.id, label: sp.label, description: sp.description }));

    if (blockingSpecimens.length > 0) {
      setFixativeGateSpecimens(blockingSpecimens);
      setPendingFinalizeArgs(excludedInstanceIds);
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
        ? `Report signed — release in ${bufferResolution.durationMinutes} min unless recalled`
        : 'Report finalized');
      return true;
    } catch (err) {
      // The actual finalize action — the highest-stakes write in this
      // file. Strict, block-only treatment, same reasoning as every
      // other finalize-adjacent write: proceeding against a stale
      // version here risks finalizing over content the pathologist
      // never actually saw.
      if (handleConcurrencyConflict(err, setConcurrencyConflict, { blockOverride: true })) return false;
      console.error('[Finalise] Failed to persist finalization:', err);
      showToast('Finalization failed — please try again');
      return false;
    }
  }, [caseData, signingUser, log, showToast, specimenDictionary, knownVersionRef, setCaseData, setConcurrencyConflict, setFixativeGateSpecimens, setPendingFinalizeArgs]);

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
  const getMicroscopicBlockingSpecimens = useCallback(async (): Promise<{ specimenLabel: string; specimenId: string; reason: string }[]> => {
    if (!caseData) return [];
    const specimens = caseData.specimens ?? [];
    const blocking: { specimenLabel: string; specimenId: string; reason: string }[] = [];

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
        if (result.blocked) blocking.push({ specimenId: specimen.id, specimenLabel: specimen.label, reason: result.reason! });
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
      if (result.blocked) blocking.push({ specimenId: specimen.id, specimenLabel: specimen.label, reason: result.reason! });
    }

    return blocking;
  }, [caseData]);

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
      showToast(`This case is on hold: ${activeCaseHold.note} — release the hold before finalizing.`);
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
      showToast(
        microscopicBlocking.length === 1
          ? `Specimen ${first.specimenLabel}: ${first.reason}`
          : `${microscopicBlocking.length} specimens need attention before finalizing — starting with Specimen ${first.specimenLabel}: ${first.reason}`
      );
      setActiveSpecimenId(first.specimenId);
      setActiveReportType('microscopic');
      return;
    }
    if (!synopticPanelRef.current) {
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
          ? `1 AI suggestion still needs your review before this case can be finalized — "${blocking[0].fieldLabel}"`
          : `${blocking.length} AI suggestions still need your review before this case can be finalized — starting with "${blocking[0].fieldLabel}"`
      );
      if (isOrchestrationMode) safeSetLeftTab('draft');
      setAlertFieldId(blocking[0].fieldId);
      return;
    }
    setPreFinalSynoptics(await buildSynopticsForReview());
    setShowPreFinalise(true);
  }, [buildSynopticsForReview, caseData, synopticPanelRef, showToast, setAlertFieldId, isOrchestrationMode, safeSetLeftTab, getMicroscopicBlockingSpecimens, setActiveSpecimenId, setActiveReportType]);

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
            const clientId       = caseData?.order?.clientId ?? '';
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

  return {
    finalizeSignOut,
    handleSignOutConfirm,
    buildSynopticsForReview,
    finalizeCase,
    missingFields, setMissingFields,
    showMissingWarning, setShowMissingWarning,
    reviewFields, setReviewFields,
    showAiReview, setShowAiReview,
    finalizeAndNextPending, setFinalizeAndNextPending,
    showPreFinalise, setShowPreFinalise,
    preFinalSynoptics,
    handleRequestFinalize,
    handlePreFinalConfirm,
    handleFinalizeConfirm,
  };
}
