// src/pages/SynopticReportPage/hooks/useAmendmentWorkflow.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx as part of the same incremental
// cleanup that produced useLisIntegration.ts, useSpecimenBlockManagement.ts,
// and useReportGeneration.ts — see useLisIntegration.ts's header for the
// full rationale.
//
// PURE MOVE, not a rewrite — every function body is unchanged.
//
// This is the first half of a two-part extraction (amendment, then
// sign-out) that was originally scoped as two separate domains but
// turned out to be genuinely, deeply cross-called: handlePreFinalConfirm
// (sign-out) calls finalizeCase() then releasePendingAmendmentOrAddendum()
// (this file) in direct sequence. Amendment is extracted FIRST and
// sign-out will depend on it via parameters, matching the direction of
// the real call graph, not the other way around.
//
// STATE OWNED HERE (moved in fully — verified via grep that each has
// zero usage outside this file's original boundary before moving):
// amendmentDraftId, amendmentSequenceNumber, amendmentSubmitError,
// versionHistory, preOverrideSnapshot, pendingFieldOverrides (never
// actually read anywhere in the original file — kept as-is, flagged
// rather than silently removed, same as the original code's own
// comment said), resumingAmendment, protoChanges, showProtoReview.
//
// STATE DELIBERATELY NOT OWNED HERE, received as parameters instead:
//   - activeReportInstanceId: 38 usages across the main file, mostly
//     JSX display reads — too central to move, same reasoning as
//     caseData and orchSections in the earlier extractions.
//   - amendmentMode, amendmentText, setAmendmentText, setAmendmentMode,
//     setShowAmendmentModal: these come from the pre-existing
//     useSynopticModals() hook (not raw component state), so they're
//     already properly organized elsewhere — just threaded through.
//   - pendingLisNotice/setPendingLisNotice, sendSynopticReportToLis:
//     come from useLisIntegration.
//   - generateReportPdfSnapshot: stays in the main component (reads
//     resolvedContext/orchSections directly, used by sign-out too).
//
// NOT included despite living nearby: handleRequestFinalize,
// handlePreFinalConfirm, handleFinalizeConfirm, finalizeCase,
// buildSynopticsForReview, finalizeSignOut, handleSignOutConfirm —
// these are the sign-out domain, extraction #2, planned to receive
// releasePendingAmendmentOrAddendum and handleProtocolChangesDetected
// from this hook's return value once that pass happens.
//
// Also NOT included: the post-finalization drift-detection useEffect
// (which calls alertAdminsOfUnresolvedDrift). That effect is genuinely
// part of the grossing/drift domain via grossingSnapshotRef and
// caseData.grossingReports, not amendment — it stays in the main file
// and will receive alertAdminsOfUnresolvedDrift as a returned value
// from this hook, the same cross-hook pattern used throughout tonight.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { getOrganisationByHospitalId } from '@/services/organisation/organisationService';
import { userService } from '@/services';
import type { StaffUser } from '@/services/users/IUserService';
import { sendEmail } from '@/services/communications/notificationService';
import { amendmentService, reportVersionService } from '@/services';
import { aiBehaviorService } from '@/services';
import { lisAmendmentNoticeService } from '@/services';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { VersionHistoryEntry, FieldOverride } from '../modals/AmendmentModal';
import type { NotificationMethod } from '@/types/reports/AmendmentRecord';
import type { Case, SynopticReportInstance, ProtocolChange, AiFieldSuggestion, GrossingReportInstance } from '@/types/case/Case';
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { MutableRefObject } from 'react';
import type { SigningUser, SetConcurrencyConflict, SendSynopticReportToLisFn, GenerateReportPdfSnapshotFn } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';

interface UseAmendmentWorkflowParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  signingUser: SigningUser;
  showToast: (message: string) => void;
  activeReportInstanceId: string;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  sendSynopticReportToLis: SendSynopticReportToLisFn;
  generateReportPdfSnapshot: GenerateReportPdfSnapshotFn;
  pendingLisNotice: { id: string; lisAmendmentSummary: string; receivedAt: string } | null;
  setPendingLisNotice: (notice: { id: string; lisAmendmentSummary: string; receivedAt: string } | null) => void;
  amendmentMode: 'amendment' | 'correction' | 'addendum';
  amendmentText: string;
  setAmendmentText: (text: string) => void;
  setAmendmentMode: (mode: 'amendment' | 'correction' | 'addendum') => void;
  setShowAmendmentModal: (show: boolean) => void;
  log: (event: string, detail: Record<string, unknown>) => void;
}

export function useAmendmentWorkflow({
  caseData, setCaseData, signingUser, showToast, activeReportInstanceId,
  knownVersionRef, setConcurrencyConflict, sendSynopticReportToLis,
  generateReportPdfSnapshot, pendingLisNotice, setPendingLisNotice,
  amendmentMode, amendmentText, setAmendmentText, setAmendmentMode,
  setShowAmendmentModal, log,
}: UseAmendmentWorkflowParams) {
  const releasePendingAmendmentOrAddendum = useCallback(async (): Promise<string | undefined> => {
    if (!caseData?.id || !activeReportInstanceId) return undefined;
    const activeInstance = (caseData.synopticReports ?? []).find((r: SynopticReportInstance) => r.instanceId === activeReportInstanceId);
    let releasedAmendmentId: string | undefined;

    if (activeInstance?.pendingAddendumId) {
      const hasConcurrentAmendment = (caseData.synopticReports ?? []).some(
        (r: SynopticReportInstance) => r.instanceId !== activeReportInstanceId && r.pendingAmendmentId
      );
      const addendumReleaseRes = await amendmentService.release(activeInstance.pendingAddendumId, {
        addendumTitle: activeInstance.templateName,
        body: `Addendum synoptic instance ${activeInstance.instanceId} finalized.`,
      });
      const releasedAddendumType = addendumReleaseRes.ok ? addendumReleaseRes.data.type : 'addendum';
      // Real, per direct guidance's own follow-up on provenance &
      // auditability: found via direct check to have zero real audit
      // trail anywhere in this flow - this is the actual, genuine
      // release/transmission moment, not just a draft being opened.
      log('amendment_released', {
        caseId: caseData.id,
        amendmentId: activeInstance.pendingAddendumId,
        type: releasedAddendumType,
        reportInstanceId: activeInstance.instanceId,
        specimenId: activeInstance.specimenId,
      });
      setCaseData(prev => prev ? {
        ...prev,
        lastRevisionType: releasedAddendumType,
        synopticReports: (prev.synopticReports ?? []).map((r: SynopticReportInstance) =>
          r.instanceId === activeReportInstanceId ? { ...r, pendingAddendumId: undefined, lastRevisionType: releasedAddendumType } : r
        ),
      } : prev);
      try {
        await caseRouter.updateCase(caseData.id, {
          lastRevisionType: releasedAddendumType,
          synopticReports: (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
            r.instanceId === activeReportInstanceId ? { ...r, pendingAddendumId: undefined, lastRevisionType: releasedAddendumType } : r
          ),
        }, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
      } catch (e) {
        // Strict treatment — this releases a pending addendum, a real
        // status/lifecycle transition, same category as finalize.
        if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return undefined;
        console.error(e);
      }
      sendSynopticReportToLis({
        kind: hasConcurrentAmendment ? 'corrected_with_addition' : 'new_instance',
        caseId: caseData.id, instanceId: activeInstance.instanceId,
        sequenceNumber: (caseData.synopticReports ?? []).length,
        addendumTitle: activeInstance.templateName,
        payloadBody: `Addendum synoptic instance ${activeInstance.instanceId} finalized.`,
      });
    }

    if (activeInstance?.pendingAmendmentId) {
      releasedAmendmentId = activeInstance.pendingAmendmentId;
      const amendmentReleaseRes = await amendmentService.release(activeInstance.pendingAmendmentId, {
        body: `Synoptic instance ${activeInstance.instanceId} corrected and re-signed out.`,
      });
      // Whichever revision kind was actually released — 'amendment' today,
      // 'correction' once that entry point exists — drives the Final
      // (Amended)/(Corrected) display label. Falls back to 'amendment'
      // only if the release call itself failed to return the record.
      const releasedRevisionType = amendmentReleaseRes.ok ? amendmentReleaseRes.data.type : 'amendment';
      // Real, per direct guidance's own follow-up on provenance &
      // auditability - same real gap, same fix, as the addendum path
      // above.
      log('amendment_released', {
        caseId: caseData.id,
        amendmentId: activeInstance.pendingAmendmentId,
        type: releasedRevisionType,
        reportInstanceId: activeInstance.instanceId,
        specimenId: activeInstance.specimenId,
      });
      setCaseData(prev => prev ? {
        ...prev,
        status: 'finalized' as CaseStatus,
        lastRevisionType: releasedRevisionType,
        synopticReports: (prev.synopticReports ?? []).map((r: SynopticReportInstance) =>
          r.instanceId === activeReportInstanceId
            ? { ...r, status: 'finalized', pendingAmendmentId: undefined, previouslyFinalizedForAmendment: undefined, lastRevisionType: releasedRevisionType }
            : r
        ),
      } : prev);
      try {
        await caseRouter.updateCase(caseData.id, {
          status: 'finalized' as CaseStatus,
          lastRevisionType: releasedRevisionType,
          synopticReports: (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
            r.instanceId === activeReportInstanceId
              ? { ...r, status: 'finalized', pendingAmendmentId: undefined, previouslyFinalizedForAmendment: undefined, lastRevisionType: releasedRevisionType }
              : r
          ),
        }, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
      } catch (e) {
        // Strict treatment — this re-finalizes the case after an
        // amendment/correction. Same stakes as the primary finalize
        // path.
        if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return undefined;
        console.error(e);
      }
      sendSynopticReportToLis({
        kind: 'corrected', caseId: caseData.id, instanceId: activeInstance.instanceId,
        payloadBody: `Synoptic instance ${activeInstance.instanceId} corrected and re-signed out.`,
      });
    }

    // CoPilot's real completion moment — version record, tagged correctly
    // based on what actually happened above rather than always assuming
    // first-time finalize.
    if (caseData?.reportingMode === 'assist' && activeInstance) {
      const { pdfBase64, generationError } = await generateReportPdfSnapshot();
      if (generationError) showToast(`Version saved, but PDF snapshot failed to generate: ${generationError}`);
      await reportVersionService.create({
        caseId: caseData.id,
        mode: 'assist',
        trigger: releasedAmendmentId ? 'amendment' : 'initial_signout',
        createdBy: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
        pdfBase64, generationError,
        synopticAnswersSnapshot: activeInstance.answers,
        instanceId: activeInstance.instanceId,
        amendmentRecordId: releasedAmendmentId,
      });
    }

    return releasedAmendmentId;
  }, [caseData, activeReportInstanceId, signingUser, generateReportPdfSnapshot, showToast, setCaseData, sendSynopticReportToLis, knownVersionRef, setConcurrencyConflict, log]);

  const alertAdminsOfUnresolvedDrift = useCallback(async (caseId: string, count: number, outcome: string) => {
    try {
      const org = getOrganisationByHospitalId(caseData?.originHospitalId ?? '');
      if (!org) {
        // originHospitalId didn't resolve to a known Organisation — same
        // "deny/skip by default rather than guess" principle
        // caseAccessControl.ts uses for access decisions. A drift alert
        // that can't identify which org's admins should see it shouldn't
        // fall back to alerting everyone.
        console.error('[DriftAlert] Could not resolve organisation for case', caseId, '— alert not sent.');
        return;
      }
      const usersRes = await userService.getAll();
      if (!usersRes.ok) return;
      const admins = usersRes.data.filter((u: StaffUser) =>
        (u.roles ?? []).includes('Admin') && u.status === 'Active' && u.organisationId === org.id
      );
      const adminEmails = admins.map((u: StaffUser) => u.email).filter(Boolean);
      if (adminEmails.length === 0) return;
      await sendEmail({
        to: adminEmails,
        subject: `Action needed: unresolved post-finalization drift on case ${caseId}`,
        bodyText: `${count} finalized grossing report(s) on case ${caseId} were detected as edited after finalization. The automatic correction ${outcome} and has not been applied. This case may currently show finalized content that doesn't match what was actually signed out — please review directly.`,
        bodyHtml: `<p><strong>${count}</strong> finalized grossing report(s) on case <strong>${caseId}</strong> were detected as edited after finalization. The automatic correction <strong>${outcome}</strong> and has not been applied. This case may currently show finalized content that doesn't match what was actually signed out — please review directly.</p>`,
        metadata: { caseId, action: 'drift_correction_unresolved', outcome, organisationId: org.id },
      });
      mockAuditService.logEvent({
        type: 'system',
        event: 'Drift Alert Sent To Admins',
        detail: `Notified ${adminEmails.length} admin(s) in organisation ${org.id} of unresolved drift correction (${outcome})`,
        user: 'system',
        caseId,
        confidence: null,
      }).catch(() => {});
    } catch (err) {
      // A failed alert must never throw back into the drift-correction
      // effect that triggered it — the telemetry entry already logged is
      // the fallback of record if this itself fails.
      console.error('[DriftAlert] Failed to notify admins:', err);
    }
  }, [caseData?.originHospitalId]);

  // ── Stage 1: protocol change review (post-Gross re-evaluation) ────────────
  const [showProtoReview, setShowProtoReview] = useState(false);
  const [protoChanges, setProtoChanges] = useState<ProtocolChange[]>([]);

  const handleProtocolChangesDetected = useCallback((changes: ProtocolChange[]) => {
    if (!changes.length) return;
    setProtoChanges(changes);
    setShowProtoReview(true);
  }, []);

  // Real feature, per direct follow-up: "there is kind of a workflow that
  // allows the Gross to be dictated and on submission, the AI reads the
  // Text, and updates the template... Not sure if there is bearing here."
  // Real bearing, confirmed — see evaluateGrossingTemplateFit's own header
  // comment (mockCaseService.ts) and useGrossingCompletion.ts's own real
  // call site for the full design. Deliberately separate, parallel state
  // from the Synoptic review above — a single Gross Complete can propose
  // real changes to BOTH the Grossing Template (this) and the diagnostic
  // Synoptic Template (above) independently; conflating them into one
  // review would either force the pathologist through irrelevant
  // Synoptic rows to reach a real Grossing change or vice versa.
  const [showGrossingProtoReview, setShowGrossingProtoReview] = useState(false);
  const [grossingProtoChanges, setGrossingProtoChanges] = useState<ProtocolChange[]>([]);
  // Real, deliberate capture — NOT re-derived from caseData.diagnostic.
  // grossDescription at commit time, since Gross Complete's own real
  // patch (useGrossingCompletion.ts) never actually writes that field;
  // the dictated text this evaluation used only ever existed locally,
  // synchronously, at the point of evaluation. Captured here so
  // handleGrossingProtoCommit below uses the exact same text a
  // pathologist could still be reviewing minutes later, not a
  // potentially-stale or entirely absent re-read.
  const [grossingProtoDictatedText, setGrossingProtoDictatedText] = useState('');

  const handleGrossingProtocolChangesDetected = useCallback((changes: ProtocolChange[], dictatedText: string) => {
    if (!changes.length) return;
    setGrossingProtoChanges(changes);
    setGrossingProtoDictatedText(dictatedText);
    setShowGrossingProtoReview(true);
  }, []);

  const handleProtoCommit = useCallback(async (acceptedIds: string[]) => {
    setShowProtoReview(false);
    // FIELD NAMES CONFIRMED against ProtocolChangeModal.tsx's real ProtocolChange
    // type (June 2026). Previous version matched on `instanceId`, which never
    // existed on this type — every match silently failed and "Apply" was a
    // no-op that still logged success. Fixed to match on currentInstanceId
    // (falling back to specimenId + currentTemplateId for older callers that
    // don't set it), and to handle all three real actions: replace, add, remove.
    //
    // AI suggestions for a newly-assigned template: the previous version of
    // this function left answers/aiSuggestions empty with a comment claiming
    // "AI suggestions populate it on the next evaluation/render pass" — traced
    // that claim directly and it was false. RightSynopticPanel's load effect
    // only ever *reads* an instance's existing aiSuggestions; nothing anywhere
    // regenerates them for an instance that arrives via this commit path
    // specifically (as opposed to the manual TemplatePicker.onSelect flow,
    // which does call generateAiSuggestionsForReport). So a template accepted
    // here would have silently rendered as a genuinely blank form. Generating
    // suggestions inline below, gated by the same Microscopic-Driven AI
    // toggle as every other suggestion-generation call.
    if (acceptedIds.length > 0 && caseData) {
      const accepted = protoChanges.filter(c => acceptedIds.includes(c.id));
      const nowIso = new Date().toISOString();

      const matchesExisting = (change: ProtocolChange, r: SynopticReportInstance) =>
        change.currentInstanceId
          ? r.instanceId === change.currentInstanceId
          : r.specimenId === change.specimenId && r.templateId === change.currentTemplateId;

      const behaviorRes = await aiBehaviorService.get();
      const microAiEnabled = !behaviorRes.ok || behaviorRes.data.microscopicEnabled !== false;

      const generateSuggestionsFor = async (templateId: string): Promise<Record<string, AiFieldSuggestion>> => {
        if (!microAiEnabled || !templateId) return {};
        try {
          const templateModule = await import('@/services/templates/templateService');
          const { generateAiSuggestionsForReport } = await import('@/services/cases/mockCaseService');
          const detail = await templateModule.getTemplate(templateId);
          const allFields = detail.template.sections.flatMap(s => s.fields);
          const suggestions = await generateAiSuggestionsForReport(caseData, templateId, allFields);
          return suggestions;
        } catch (e) {
          console.error('[PathScribe] AI suggestion generation for newly-assigned template failed:', e);
          return {};
        }
      };

      let reports = [...(caseData.synopticReports ?? [])];

      for (const change of accepted) {
        const action = change.action ?? 'replace';

        if (action === 'remove') {
          reports = reports.filter(r => !matchesExisting(change, r));
          continue;
        }

        if (action === 'add') {
          const aiSuggestions = await generateSuggestionsFor(change.proposedTemplateId ?? '');
          reports.push({
            instanceId:   `${change.specimenId}_${change.proposedTemplateId}_${Date.now()}`,
            specimenId:   change.specimenId,
            templateId:   change.proposedTemplateId ?? '',
            templateName: change.proposedTemplateName ?? '',
            // Empty answers (no prior answers exist to carry forward for a
            // brand-new synoptic) — but aiSuggestions above is real, not
            // assumed; pathologist still explicitly confirms/overrides each
            // field, same as any other AI-suggested value.
            answers:      {},
            aiSuggestions,
            status:       'draft',
            createdAt:    nowIso,
            updatedAt:    nowIso,
          });
          continue;
        }

        // action === 'replace'
        const aiSuggestions = await generateSuggestionsFor(change.proposedTemplateId ?? '');
        reports = reports.map(r => {
          if (!matchesExisting(change, r)) return r;
          return {
            ...r,
            templateId:   change.proposedTemplateId ?? r.templateId,
            templateName: change.proposedTemplateName ?? r.templateName,
            updatedAt:    nowIso,
            // Answers cleared, not carried over — the old answers are keyed
            // to the OLD template's field IDs, which a different template
            // isn't guaranteed to share; carrying them forward silently
            // risks misattributing a value to the wrong field under the new
            // schema. Real AI suggestions generated above stand in instead —
            // still pathologist-confirmed per field, not auto-applied.
            answers:      {},
            aiSuggestions,
          };
        });
      }

      const patch = { synopticReports: reports };

      try {
        await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
        setCaseData({ ...caseData, ...patch } as typeof caseData);
        log('protocol_change_committed', {
          caseId: caseData.id,
          acceptedCount: acceptedIds.length,
          totalProposed: protoChanges.length,
          actions: accepted.map(c => c.action ?? 'replace'),
        });
      } catch (e) {
        if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
        console.error(e);
      }
    }
  }, [protoChanges, caseData, log, knownVersionRef, setCaseData, setConcurrencyConflict]);

  // Real feature, per direct follow-up: "there is kind of a workflow that
  // allows the Gross to be dictated and on submission, the AI reads the
  // Text, and updates the template... Not sure if there is bearing here."
  // Mirrors handleProtoCommit directly above, with two real differences:
  // (1) operates on grossingReports, not synopticReports; (2) instead of
  // regenerating suggestions from the case's diagnostic text
  // (generateAiSuggestionsForReport), reuses the SAME real, already-built
  // dictation-reading capability the Gross Complete workflow itself
  // already has (generateGrossingFieldSuggestionsFromDictation) — the
  // real answer to "can it just read the narrative and apply that to the
  // new template so you don't really lose any information": yes,
  // targeted at the newly-accepted template's own fields, using the
  // exact same dictated text the evaluation itself was based on
  // (grossingProtoDictatedText, captured at evaluation time — see that
  // state's own comment for why it's not re-derived here).
  const handleGrossingProtoCommit = useCallback(async (acceptedIds: string[]) => {
    setShowGrossingProtoReview(false);
    if (acceptedIds.length === 0 || !caseData) return;

    const accepted = grossingProtoChanges.filter(c => acceptedIds.includes(c.id));
    const nowIso = new Date().toISOString();

    const matchesExisting = (change: ProtocolChange, g: GrossingReportInstance) =>
      change.currentInstanceId
        ? g.instanceId === change.currentInstanceId
        : g.specimenId === change.specimenId && g.templateId === change.currentTemplateId;

    let reports = [...(caseData.grossingReports ?? [])];

    for (const change of accepted) {
      // evaluateGrossingTemplateFit only ever proposes 'replace' — a
      // Grossing Template always has one pre-assigned at accession (see
      // evaluateGrossingTemplateAssignment's own real fallback default),
      // so there's no real 'add'/'remove' concept here the way a
      // diagnostic Synoptic can genuinely have zero assigned.
      if ((change.action ?? 'replace') !== 'replace' || !change.proposedTemplateId) continue;

      let newFieldSuggestions: Record<string, AiFieldSuggestion> = {};
      try {
        const templateModule = await import('@/services/templates/templateService');
        const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
        const detail = await templateModule.getTemplate(change.proposedTemplateId);
        const allFields = detail.template.sections.flatMap(s => s.fields);
        const targetReport = reports.find(g => matchesExisting(change, g));
        if (targetReport && grossingProtoDictatedText.trim()) {
          const bySpecimen = await generateGrossingFieldSuggestionsFromDictation(
            grossingProtoDictatedText,
            [{ specimenId: change.specimenId, specimenLabel: change.specimenLabel, specimenDesc: change.specimenDesc, fields: allFields }],
            caseData.order?.clientId,
          );
          newFieldSuggestions = bySpecimen[change.specimenId] ?? {};
        }
      } catch (e) {
        // Non-blocking, same real posture as the original Gross Complete
        // dictation pass — the template still switches below even if
        // re-deriving fresh suggestions for it fails; a PA can fill the
        // new template in by hand exactly as if this feature didn't
        // exist.
        console.error('[PathScribe] Re-deriving Grossing field suggestions for the newly-accepted template failed:', e);
      }

      reports = reports.map(g => {
        if (!matchesExisting(change, g)) return g;
        return {
          ...g,
          templateId:   change.proposedTemplateId ?? g.templateId,
          templateName: change.proposedTemplateName ?? g.templateName,
          updatedAt:    nowIso,
          // Real, load-bearing safety property — same reasoning as
          // handleProtoCommit's own Synoptic 'replace' handling: the old
          // answers are keyed to the OLD template's field IDs, which the
          // new template isn't guaranteed to share; carrying them
          // forward silently risks misattributing a value to the wrong
          // field. Cleared, not carried over — the real information
          // itself isn't lost, though, since it's re-derived just above
          // from the same dictated narrative, targeted at the new
          // template's own real fields, still pathologist-confirmed per
          // field before anything commits as a real answer.
          answers:      {},
          aiSuggestions: newFieldSuggestions,
        };
      });
    }

    const patch = { grossingReports: reports };
    try {
      await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData({ ...caseData, ...patch } as typeof caseData);
      log('grossing_template_change_committed', {
        caseId: caseData.id,
        acceptedCount: acceptedIds.length,
        totalProposed: grossingProtoChanges.length,
      });
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error(e);
    }
  }, [grossingProtoChanges, grossingProtoDictatedText, caseData, log, knownVersionRef, setCaseData, setConcurrencyConflict]);

  const [amendmentDraftId, setAmendmentDraftId] = useState<string | null>(null);
  const [amendmentSequenceNumber, setAmendmentSequenceNumber] = useState(1);
  const [amendmentSubmitError, setAmendmentSubmitError] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>([]);
  const [preOverrideSnapshot, setPreOverrideSnapshot] = useState<Record<string, unknown> | null>(null);
  const [_pendingFieldOverrides, setPendingFieldOverrides] = useState<Record<string, FieldOverride>>({});
  const [resumingAmendment, setResumingAmendment] = useState<{ clinicianName?: string; method?: NotificationMethod; notifiedAt?: string } | undefined>(undefined);

  const openAmendmentDraft = useCallback(async (mode: 'amendment' | 'correction' | 'addendum') => {
    if (!caseData?.id) return;
    setAmendmentSubmitError(null);
    const res = await amendmentService.startDraft({
      caseId: caseData.id, type: mode,
      authoringPathologist: { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' },
      // Real, per direct guidance's own follow-up on structured
      // linkage: this exact context is already available right here,
      // before any editing happens - see AmendmentRecord.reportInstanceId's
      // own doc comment for the full reasoning.
      reportInstanceId: activeReportInstanceId ?? undefined,
      specimenId: (caseData.synopticReports ?? []).find((r: SynopticReportInstance) => r.instanceId === activeReportInstanceId)?.specimenId,
    });
    if (res.ok) {
      setAmendmentDraftId(res.data.id); setAmendmentSequenceNumber(res.data.sequenceNumber);
      // Real, per direct guidance's own follow-up on provenance &
      // auditability: this app's own established "all must be
      // audited" principle, found via direct check to have zero real
      // audit trail anywhere in the amendment/addendum flow -
      // startDraft, captureFields, and release all persisted real
      // data with no corresponding audit log entry at all, despite
      // this being one of the most compliance-critical actions in the
      // app (CAP/RCPath accreditation, AmendmentRecord.ts's own
      // header). Logs the real reportInstanceId/specimenId
      // association captured above, not just that a draft opened.
      log('amendment_draft_opened', {
        caseId: caseData.id,
        amendmentId: res.data.id,
        type: mode,
        reportInstanceId: res.data.reportInstanceId,
        specimenId: res.data.specimenId,
      });
    }

    // Delta step needs the true pre-amendment baseline captured NOW,
    // before any field overrides get applied below — not re-cloned
    // later at Save Draft time, which would already include overrides.
    const activeInstance = (caseData.synopticReports ?? []).find((r: SynopticReportInstance) => r.instanceId === activeReportInstanceId);
    setPreOverrideSnapshot(activeInstance ? structuredClone(activeInstance.answers) : null);

    const versionRes = await reportVersionService.getByCaseId(caseData.id);
    if (versionRes.ok) {
      const history = versionRes.data
        .filter(v => v.instanceId === activeReportInstanceId && v.synopticAnswersSnapshot)
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map(v => ({ versionNumber: v.versionNumber, releasedAt: v.createdAt, createdBy: v.createdBy, synopticAnswersSnapshot: v.synopticAnswersSnapshot! }));
      setVersionHistory(history);
    }

    // Per the triage spec's Exit Gate B — starting a real amendment IS
    // the pathologist's decision that changes are needed, so any
    // pending LIS notice transitions to synoptic_amended, not
    // acknowledged. The case stays rooted in triage regardless (an open
    // draft keeps it there), but the notice itself is no longer
    // "awaiting a decision" — the decision was just made.
    if (pendingLisNotice) {
      await lisAmendmentNoticeService.updateStatus(pendingLisNotice.id, 'synoptic_amended');
      setPendingLisNotice(null);
    }
  }, [caseData, signingUser, pendingLisNotice, setPendingLisNotice, activeReportInstanceId, log]);

  const handleFieldOverridesConfirmed = useCallback(async (overrides: Record<string, FieldOverride>) => {
    if (!caseData || !activeReportInstanceId) return;
    setPendingFieldOverrides(overrides);
    // pendingFieldOverrides (the state) is never read anywhere in this
    // file — this function immediately continues using the local
    // `overrides` parameter directly for everything below, not the
    // state it just set. Looks genuinely redundant rather than a
    // half-built feature; flagged rather than silently removed in case
    // something elsewhere was meant to read this reactively.
    if (Object.keys(overrides).length === 0) return;

    const now = new Date().toISOString();
    const chosenBy = { userId: signingUser?.id ?? 'unknown', userName: signingUser?.name ?? 'Unknown User' };

    const updatedReports = (caseData.synopticReports ?? []).map((r: SynopticReportInstance) => {
      if (r.instanceId !== activeReportInstanceId) return r;
      const newAnswers = { ...r.answers };
      const newLineage = { ...(r.fieldLineage ?? {}) };
      const newAiSuggestions = { ...(r.aiSuggestions ?? {}) };
      for (const [key, o] of Object.entries(overrides)) {
        // FieldOverride.value is deliberately typed unknown (a generic
        // override slot), but this specific flow — confirming an
        // earlier version's answer for a synoptic field — only ever
        // produces the same string | string[] shape every other answer
        // in this record has.
        newAnswers[key] = o.value as string | string[];
        newLineage[key] = { fieldKey: key, value: o.value, sourceVersionNumber: o.sourceVersionNumber, chosenAt: now, chosenBy, wasOverride: true };
        // Per feedback: only fields that actually changed should lose
        // their AI-confirmed badge. Untouched fields genuinely were
        // reviewed and remain correct — leaving their verification
        // alone is the right call, not a shortcut. 'disputed' already
        // exists on AiFieldVerification for exactly this case; no new
        // status needed.
        if (newAiSuggestions[key]) {
          newAiSuggestions[key] = { ...newAiSuggestions[key], verification: 'disputed' };
        }
      }
      return { ...r, answers: newAnswers, fieldLineage: newLineage, aiSuggestions: newAiSuggestions };
    });
    setCaseData({ ...caseData, synopticReports: updatedReports });
    try {
      await caseRouter.updateCase(caseData.id, { synopticReports: updatedReports }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error(e);
    }
  }, [caseData, activeReportInstanceId, signingUser, setCaseData, knownVersionRef, setConcurrencyConflict]);

  // Real gap fixed here: the "Amend" button always started a brand new
  // draft via openAmendmentDraft, even when the active instance already
  // had one in progress (pendingAmendmentId set) — creating an orphaned
  // duplicate AmendmentRecord instead of reopening the real one. Now it
  // checks first and resumes the existing draft's reason/notification
  // for editing when one exists.
  const handleRequestAmendment = useCallback(async () => {
    const activeInstance = (caseData?.synopticReports ?? []).find((r: SynopticReportInstance) => r.instanceId === activeReportInstanceId);

    if (activeInstance?.pendingAmendmentId && caseData?.id) {
      const res = await amendmentService.getByCaseId(caseData.id);
      const record = res.ok ? res.data.find(r => r.id === activeInstance.pendingAmendmentId) : undefined;
      if (record) {
        // Resume as whatever this draft actually is — 'amendment' or
        // 'correction' — not a hardcoded 'amendment'. Getting this wrong
        // would silently demand a Clinical Notification Log on a
        // correction draft that never needed one (and was never
        // captured with one), blocking release entirely.
        setAmendmentMode(record.type === 'correction' ? 'correction' : 'amendment');
        setAmendmentDraftId(record.id);
        setAmendmentSequenceNumber(record.sequenceNumber);
        setAmendmentText(record.explanationOfChange ?? '');
        setResumingAmendment({
          clinicianName: record.notification?.clinicianName,
          method: record.notification?.method,
          notifiedAt: record.notification?.notifiedAt,
        });
        setShowAmendmentModal(true);
        return;
      }
    }

    // No existing draft on this instance — genuinely new amendment.
    // Defaults to 'amendment' (Major); the modal's own mode buttons let
    // the pathologist switch to Minor Amendment or Addendum before
    // submitting.
    setAmendmentMode('amendment');
    setResumingAmendment(undefined);
    setShowAmendmentModal(true);
    openAmendmentDraft('amendment');
  }, [caseData, activeReportInstanceId, openAmendmentDraft, setAmendmentMode, setAmendmentText, setShowAmendmentModal]);

  const handleAmendmentSubmit = useCallback(async (fields: { addendumTitle?: string; explanationOfChange?: string; clinicianName?: string; method?: NotificationMethod; notifiedAt?: string; reasonId: string }) => {
    if (!amendmentDraftId) return;
    const notification = fields.clinicianName && fields.method
      ? { clinicianName: fields.clinicianName, method: fields.method, notifiedAt: fields.notifiedAt ?? new Date().toISOString() }
      : undefined;

    // Real architectural extension: this used to be CoPilot-only
    // (isCopilotAmendment required reportingMode === 'assist'). Real
    // gap, caught directly: Orchestration's amendment needs the exact
    // same two-stage unlock-and-re-edit behavior — stay open across
    // sessions, only clear from triage at actual re-finalize — not the
    // single-stage append-only behavior this had before. Stage 2
    // (finalizeSignOut) already checks for pendingAmendmentId
    // mode-agnostically, so this is the only change needed to make
    // both modes work identically here.
    const isUnlockAmendment = amendmentMode === 'amendment' || amendmentMode === 'correction';

    if (isUnlockAmendment) {
      // Stage 1 only — captures Reason + Notification up front and
      // unlocks the template. Nothing transmitted yet; that's Stage 2,
      // which fires for real at actual re-sign-out (see
      // handleSignOutConfirm), not here.
      if (!caseData?.id || !activeReportInstanceId) return;

      // The real snapshot — but now sourced from preOverrideSnapshot,
      // captured back when the draft first opened (before the Delta
      // step could apply any field overrides). Re-cloning caseData
      // here directly would incorrectly bake any confirmed overrides
      // into what's supposed to be the untouched "before" record,
      // destroying the whole point of the delta/lineage trail.
      const originalInstance = (caseData.synopticReports ?? []).find((r: SynopticReportInstance) => r.instanceId === activeReportInstanceId);
      const originalReportSnapshot = originalInstance
        ? { ...structuredClone(originalInstance), answers: preOverrideSnapshot ?? structuredClone(originalInstance.answers) }
        : null;

      const res = await amendmentService.captureFields(amendmentDraftId, {
        explanationOfChange: fields.explanationOfChange ?? '',
        notification,
        originalReportSnapshot,
        reasonId: fields.reasonId,
      });
      if (!res.ok) { setAmendmentSubmitError('error' in res ? res.error : 'Could not proceed — check required fields.'); return; }

      const unlockedReports = (caseData.synopticReports ?? []).map((r: SynopticReportInstance) =>
        r.instanceId === activeReportInstanceId
          ? { ...r, status: 'draft' as const, previouslyFinalizedForAmendment: true, pendingAmendmentId: amendmentDraftId }
          : r
      );
      setCaseData({ ...caseData, status: 'in-progress' as CaseStatus, synopticReports: unlockedReports });
      try {
        await caseRouter.updateCase(caseData.id, { status: 'in-progress' as CaseStatus, synopticReports: unlockedReports }, knownVersionRef.current);
        knownVersionRef.current = knownVersionRef.current + 1;
      } catch (e) {
        // Same reasoning as finalizeSignOut — this is a status
        // transition off 'finalized', not a routine draft edit.
        // Blocking and forcing a reload is the safe default when the
        // stakes are this high.
        if (handleConcurrencyConflict(e, setConcurrencyConflict, { blockOverride: true })) return;
        console.error(e);
      }
      showToast(`Report unlocked for ${amendmentMode === 'correction' ? 'correction' : 'amendment'} — edit the synoptic fields, then re-finalize and sign out to transmit.`);

      setAmendmentSubmitError(null);
      setShowAmendmentModal(false);
      setAmendmentDraftId(null);
      setAmendmentText('');
      return;
    }

    // Single-stage — addenda only. Amendments (both modes now) go
    // through the unlock-and-re-edit path above and never reach here.
    const res = await amendmentService.release(amendmentDraftId, {
      addendumTitle: fields.addendumTitle,
      explanationOfChange: fields.explanationOfChange,
      notification,
      body: amendmentText,
      reasonId: fields.reasonId,
    });
    if (!res.ok) { setAmendmentSubmitError('error' in res ? res.error : 'Could not release — check required fields.'); return; }

    // Real, per direct guidance's own follow-up on provenance &
    // auditability - same real gap, same fix, as
    // releasePendingAmendmentOrAddendum above. Uses the real,
    // returned record's own reportInstanceId/specimenId (set at
    // startDraft time), not re-derived here.
    log('amendment_released', {
      caseId: caseData?.id,
      amendmentId: amendmentDraftId,
      type: res.data.type,
      reportInstanceId: res.data.reportInstanceId,
      specimenId: res.data.specimenId,
    });

    setAmendmentSubmitError(null);
    setShowAmendmentModal(false);
    setAmendmentDraftId(null);
    showToast(`${amendmentMode === 'addendum' ? 'Addendum' : 'Amendment'} released`);
    setAmendmentText('');
  }, [amendmentDraftId, amendmentMode, amendmentText, caseData, activeReportInstanceId, setAmendmentText, setShowAmendmentModal, showToast, setCaseData, preOverrideSnapshot, knownVersionRef, setConcurrencyConflict, log]);

  return {
    releasePendingAmendmentOrAddendum,
    alertAdminsOfUnresolvedDrift,
    showProtoReview, setShowProtoReview,
    protoChanges,
    handleProtocolChangesDetected,
    handleProtoCommit,
    showGrossingProtoReview, setShowGrossingProtoReview,
    grossingProtoChanges,
    handleGrossingProtocolChangesDetected,
    handleGrossingProtoCommit,
    amendmentDraftId, setAmendmentDraftId,
    amendmentSequenceNumber,
    amendmentSubmitError, setAmendmentSubmitError,
    versionHistory,
    resumingAmendment, setResumingAmendment,
    openAmendmentDraft,
    handleFieldOverridesConfirmed,
    handleRequestAmendment,
    handleAmendmentSubmit,
  };
}
