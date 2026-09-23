// src/pages/SynopticReportPage/hooks/useGrossingCompletion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx as part of the same incremental
// cleanup that produced the other hooks in this directory — see
// useLisIntegration.ts's header for the full rationale.
//
// PURE MOVE, not a rewrite — the function body is unchanged.
//
// This was deliberately EXCLUDED from the original useSpecimenBlockManagement
// extraction because it depended on handleProtocolChangesDetected, which at
// the time was still defined in the same scope as this function (a real
// TS2448 "used before declaration" risk to reorder around). Now that
// handleProtocolChangesDetected lives in useAmendmentWorkflow and is
// received as a parameter here — same as any other cross-hook dependency
// tonight — that blocker is gone.
//
// Given its own separate concern from day-to-day block editing
// (useSpecimenBlockManagement) — this is specifically about completing
// the grossing stage: required-field validation, pool routing, and
// triggering Stage 1 AI synoptic-assignment evaluation — it gets its own
// dedicated hook rather than being folded into that one.
//
// STATE OWNED HERE: none directly — isEvaluatingSynopticFit is defined
// here since it's set/cleared only within this function, but it's
// returned because it's read in JSX (BottomActionBar's
// synopticFitPending gate).
//
// STATE DELIBERATELY NOT OWNED HERE, received as parameters instead:
//   - grossingSnapshotRef: genuinely shared with the post-finalization
//     drift-detection useEffect, which stays in the main file (it's
//     part of the drift/grossing-edit-after-finalize concern, not
//     grossing *completion* itself) — both need the same ref instance.
//   - caseData/setCaseData, knownVersionRef, setConcurrencyConflict,
//     showToast, log: same shared, widely-used values as every other
//     extraction tonight.
//   - handleProtocolChangesDetected: from useAmendmentWorkflow.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { caseRouter } from '@/services/cases/CaseRouter';
import { routeCase, routeStatCase } from '@/services/cases/casePoolAssignmentService';
import { aiBehaviorService } from '@/services';
import type { Case, ProtocolChange } from '@/types/case/Case';
import type { CaseStatus } from '@/types/case/CaseStatus';
import type { SetConcurrencyConflict } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';
import { mockServiceChargeService } from '@/services/billing/mockServiceChargeService';
import { mockOutboundChargeQueueService } from '@/services/billing/mockOutboundChargeQueueService';
import { sweepChargesForOutbox } from '@/services/billing/sweepChargesForOutbox';
import { mockBillingTypeTriggerConfigService } from '@/services/billing/mockBillingTypeTriggerConfigService';
import { validateChargeMetadata } from '@/services/billing/validateChargeMetadata';

interface UseGrossingCompletionParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  showToast: (message: string) => void;
  log: (event: string, detail: Record<string, unknown>) => void;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  grossingSnapshotRef: MutableRefObject<Map<string, string>>;
  handleProtocolChangesDetected: (changes: ProtocolChange[]) => void;
  // Real feature, per direct follow-up: "there is kind of a workflow
  // that allows the Gross to be dictated and on submission, the AI
  // reads the Text, and updates the template... Not sure if there is
  // bearing here." Real bearing — see this hook's own real call site
  // below and evaluateGrossingTemplateFit's own header comment
  // (mockCaseService.ts) for the full design.
  handleGrossingProtocolChangesDetected: (changes: ProtocolChange[], dictatedText: string) => void;
  /** Real fix, per direct report: "I added some gross text, but the
   *  system is not allowing me to mark gross complete. Gives the no
   *  gross information has been entered." A PA who dictates the
   *  Gross directly (the manual-entry Report Draft path — see
   *  SynopticReportPage.tsx's handleStartManualEntry) writes real,
   *  genuine gross observations, but into orchSections' free-text
   *  'std_body_gross' section — a completely separate field from
   *  grossingReports[].answers, which is all this check previously
   *  looked at. Dictated prose is just as real as structured-field
   *  answers; the validation was only ever checking one of the two
   *  legitimate ways this app now lets a PA record it. */
  orchSections: { id: string; text: string; sourcePartId?: string; specimenId?: string }[];
}

export function useGrossingCompletion({
  caseData, setCaseData, showToast, log, knownVersionRef,
  setConcurrencyConflict, grossingSnapshotRef, handleProtocolChangesDetected,
  handleGrossingProtocolChangesDetected,
  orchSections,
}: UseGrossingCompletionParams) {
  const { t } = useTranslation();
  const [isEvaluatingSynopticFit, setIsEvaluatingSynopticFit] = useState(false);

  const handleGrossComplete = useCallback(async () => {
    if (!caseData) return;

    const draftGrossing = (caseData.grossingReports ?? []).filter(g => g.status === 'draft');
    if (draftGrossing.length === 0) return;

    // Every specimen needs something entered — no partial submissions.
    // A specimen with a draft grossing report but zero answers (never
    // opened, or opened and left blank) blocks the whole case from
    // completing Gross, same as any other required-field gate in this
    // app. This is deliberately strict: there's no override, because
    // grossing is direct physical observation a human has to actually
    // record, not something that can be reasonably skipped or inferred.
    //
    // Real feature, per direct request: "a separate section for each
    // specimen... so that it is easier for the User to dictate the
    // gross for each specimen." handleStartManualEntry
    // (useReportGeneration.ts) now creates one Gross Description
    // section PER SPECIMEN (tagged with both sourcePartId and the
    // real specimenId) rather than one section covering all of them
    // — so completeness is checked per specimen now, matching the
    // same per-specimen strictness the structured-answers path
    // already had. A case-wide section with no specimenId can still
    // appear (the AI-generation path, handleGenerateReport, wasn't
    // changed here — it still produces one combined section) — real
    // text there still satisfies every specimen at once, same as it
    // always did, since that path genuinely does cover every specimen
    // together in one narrative (mockReportPartService.ts's
    // grossPart — a single repeat-group over all specimens).
    const grossSections = orchSections.filter(s => s.sourcePartId === 'std_body_gross');
    const caseWideGrossSection = grossSections.find(s => !s.specimenId);
    const hasDictatedGrossText = !!caseWideGrossSection?.text?.trim();

    const hasDictatedTextForSpecimen = (specimenId: string) =>
      grossSections.some(s => s.specimenId === specimenId && s.text?.trim());

    const specimensWithoutAnswers = hasDictatedGrossText ? [] : (caseData.specimens ?? []).filter(sp => {
      if (hasDictatedTextForSpecimen(sp.id)) return false;
      const spGrossing = (caseData.grossingReports ?? []).filter(g => g.specimenId === sp.id);
      if (spGrossing.length === 0) return true; // no grossing report at all for this specimen
      return !spGrossing.some(g =>
        Object.values(g.answers ?? {}).some(v => v !== '' && !(Array.isArray(v) && !v.length))
      );
    });
    if (specimensWithoutAnswers.length > 0) {
      const labels = specimensWithoutAnswers.map(sp => sp.label).join(', ');
      showToast(t('useGrossingCompletion.toast.specimensMissingGrossing', { count: specimensWithoutAnswers.length, labels }));
      return;
    }

    const isUpdate = draftGrossing.some(g => g.previouslyFinalized);

    let reason = '';
    if (isUpdate) {
      // Matches the Grossing SOP's own audited-correction precedent for
      // post-handoff cassette edits ("must be flagged, logged with a
      // timestamp, and require a user-entered reason for modification").
      // MVP reason capture via prompt() — a dedicated modal (matching
      // RequestReviewModal/PoolClaimModal's pattern) is the real long-term
      // UI here, not a browser prompt.
      const entered = window.prompt(t('useGrossingCompletion.prompt.reasonForUpdate'));
      if (!entered || !entered.trim()) {
        showToast(t('useGrossingCompletion.toast.updateCancelledReasonRequired'));
        return;
      }
      reason = entered.trim();
    }

    const nowIso = new Date().toISOString();

    try {
      const grossingReports = (caseData.grossingReports ?? []).map(g =>
        g.status === 'draft'
          ? { ...g, status: 'finalized' as const, previouslyFinalized: true, updatedAt: nowIso }
          : g
      );

      // Snapshot finalized instances' answers now, so the useEffect below
      // can detect a future edit by diffing against this. Stored in a ref,
      // not state — purely internal bookkeeping, shouldn't trigger renders.
      grossingReports
        .filter(g => g.status === 'finalized')
        .forEach(g => grossingSnapshotRef.current.set(g.instanceId, JSON.stringify(g.answers)));

      const templateModule = await import('@/services/templates/templateService');
      const evalWarnings: string[] = [];

      const grossingAnswersBySpecimen = new Map<string, Array<{ fieldId: string; fieldLabel: string; displayValue: string }>>();
      // Real feature, per direct request: "Once I select Gross complete
      // that should also trigger the AI to fill in the Gross synoptic
      // form for each specimen." Captured alongside the existing
      // per-specimen answer extraction above — same template fetch,
      // no duplicate call — but keeping the FULL field definitions
      // (id/label/options), not just currently-answered values, since
      // generateGrossingFieldSuggestionsFromDictation needs to know
      // every field it could possibly suggest a value for.
      const grossingFieldsBySpecimen = new Map<string, Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>>();
      await Promise.all(grossingReports.map(async g => {
        try {
          const detail = await templateModule.getTemplate(g.templateId);
          const allFields = detail.template.sections.flatMap(s => s.fields);
          const fieldsById = new Map<string, { label?: string }>(
            allFields.map((f): [string, { label?: string }] => [f.id, f])
          );
          const resolved = Object.entries(g.answers).map(([fieldId, value]) => {
            const field = fieldsById.get(fieldId);
            const label = field?.label ?? fieldId;
            const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
            return { fieldId, fieldLabel: label, displayValue };
          });
          grossingAnswersBySpecimen.set(g.specimenId, resolved);
          grossingFieldsBySpecimen.set(g.specimenId, allFields);
        } catch (e) {
          evalWarnings.push(`Could not resolve Grossing template '${g.templateId}' for specimen '${g.specimenId}' — its answers won't appear in Stage 1 evaluation context`);
        }
      }));

      // RESOLVED (was previously flagged as an unconfirmed assumption):
      // listTemplates() returns the raw PROTOCOL_REGISTRY entries from
      // protocolShared.tsx with no field-stripping, so isDiagnostic flows
      // through untouched — confirmed by reading templateService.ts directly.
      // Filtering on isDiagnostic (default true) rather than category !==
      // 'GROSSING' matches the architecture's own stated principle (see
      // workflow summary §3): the real axis is diagnostic/registry-bound
      // vs. not, not Custom-vs-CAP or category-string equality. Today this
      // is behaviorally identical (only the three Grossing templates have
      // isDiagnostic: false), but it correctly excludes any FUTURE
      // non-diagnostic template that isn't categorized 'GROSSING' too.
      const allTemplates = await templateModule.listTemplates('published');
      const availableTemplates = allTemplates
        .filter(t => t.isDiagnostic !== false)
        .map(t => ({ id: t.id, name: t.name, category: t.category }));

      const specimens = (caseData.specimens ?? []).map(sp => ({
        specimenId: sp.id,
        specimenLabel: sp.label,
        specimenDesc: sp.description,
        // Populated with whatever's currently assigned, regardless of
        // whether this is a first finalize (empty) or a re-finalize
        // (already has entries) — same input shape either way, which is
        // exactly what lets evaluateSynopticAssignment decide add vs.
        // replace vs. remove vs. nothing, without this handler needing to
        // know which case it's in.
        currentSynoptics: (caseData.synopticReports ?? [])
          .filter(r => r.specimenId === sp.id)
          .map(r => ({ instanceId: r.instanceId, templateId: r.templateId, templateName: r.templateName })),
        grossingAnswers: grossingAnswersBySpecimen.get(sp.id),
      }));

      const evaluationInput = {
        caseText: {
          gross:       caseData.diagnostic?.grossDescription ?? '',
          microscopic: caseData.diagnostic?.microscopicDescription ?? '',
          ancillary:   caseData.diagnostic?.ancillaryStudies ?? '',
        },
        specimens,
        availableTemplates,
        facilityId: caseData.order?.facilityId,
      };

      // Persist first — Gross Complete/Update Gross should succeed even if
      // Stage 1 evaluation below fails or is slow.
      const patch: Partial<Case> = { grossingReports };
      // Real fix: grossCompletedAt is set once, on genuine first
      // completion only - a later correction/re-finalize (isUpdate above)
      // must not overwrite it, since TAT calculation needs this to stay
      // the real "when did grossing genuinely finish" milestone.
      if (!isUpdate) {
        patch.grossCompletedAt = nowIso;
      }

      // Same work-based gate as before (not a status-string check): only
      // advance/revert caseData.status if no real diagnostic work has
      // begun yet. On a first finalize this naturally sets 'gross-complete'.
      // On a re-finalize where a pathologist has already started real
      // work, status is left alone entirely — the correction stands on
      // its own in the audit trail without disrupting that work.
      const hasRealDiagnosticWorkBegun =
        (caseData.synopticReports ?? []).some(r => Object.keys(r.answers ?? {}).length > 0) ||
        !!(caseData.diagnostic?.microscopicDescription?.trim());
      if (!hasRealDiagnosticWorkBegun) {
        patch.status = 'gross-complete' as CaseStatus;
      }

      await caseRouter.updateCase(caseData.id, patch, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      setCaseData({ ...caseData, ...patch } as typeof caseData);

      // Real, per Epic: PathScribe Outbound Billing & Charge Event
      // Engine, User Story 2 - "emit TC codes immediately upon
      // SPECIMEN_GROSSED." Fire-and-forget, deliberately never awaited
      // - a failure here must never surface as a grossing-completion
      // failure. Scoped to the whole case, not one specimen - this
      // function itself transitions every draft grossingReport at
      // once (see its own header), so every specimen is genuinely,
      // simultaneously grossed at this moment.
      (async () => {
        const chargesRes = await mockServiceChargeService.getChargesForCase(caseData.id);
        if (!chargesRes.ok) return;
        const alreadyQueuedRes = await mockOutboundChargeQueueService.getByServiceChargeRecordIds(
          chargesRes.data.map(c => c.id)
        );
        const alreadyQueuedIds = new Set(alreadyQueuedRes.ok ? alreadyQueuedRes.data.map(e => e.serviceChargeRecordId) : []);
        const triggerMapRes = await mockBillingTypeTriggerConfigService.getEffectiveTriggerMap(caseData.order?.siteId);
        const toEnqueue = sweepChargesForOutbox(chargesRes.data, 'SPECIMEN_GROSSED', alreadyQueuedIds, triggerMapRes.ok ? triggerMapRes.data : undefined);
        const metadataFailures = validateChargeMetadata(caseData);
        await Promise.all(toEnqueue.map(async f => {
          const enqueueRes = await mockOutboundChargeQueueService.enqueue({
            serviceChargeRecordId: f.serviceChargeRecordId,
            caseId: f.caseId,
            specimenId: f.specimenId,
            billingType: f.billingType,
            triggerEvent: 'SPECIMEN_GROSSED',
          });
          // Real, per Story 4: a charge genuinely missing required
          // metadata is flagged FAILED immediately, not left QUEUED
          // with data already known to be bad.
          if (enqueueRes.ok && metadataFailures.length > 0) {
            await mockOutboundChargeQueueService.markFailed(enqueueRes.data.id, {
              errorCode: metadataFailures[0].errorCode,
              errorMessage: metadataFailures[0].errorMessage,
              maxRetriesExceeded: false,
            });
          }
        }));
      })().catch(e => console.error('[PathScribe] Outbound charge queue sweep failed (non-blocking):', e));

      // Real fix, found via a direct audit: automatic pool routing
      // (routeCase/routeStatCase) was fully built - real admin-
      // configurable Routing Rules, a preview tool, keyword matching,
      // pool application - but never actually called anywhere.
      // Deliberately triggered here, at grossing completion, not at
      // accession: grossing isn't gated by pool status (a case can be
      // "in pool, already grossed"), but routing *before* grossing
      // would let a pathologist claim a case with nothing to actually
      // review yet. Same hasRealDiagnosticWorkBegun gate as the status
      // transition above - only the first, genuine completion routes;
      // a later re-finalize on an already-in-progress case does not.
      if (!hasRealDiagnosticWorkBegun) {
        try {
          const casePriority = caseData?.order?.priority;
          const routingResult = casePriority === 'STAT'
            ? await routeStatCase({ ...caseData, ...patch })
            : await routeCase({ ...caseData, ...patch });
          if (routingResult.outcome === 'routed_to_pool' || routingResult.outcome === 'routed_to_fallback') {
            showToast(t('useGrossingCompletion.toast.routedToPool', { poolName: routingResult.poolName }));
          }
        } catch (e) {
          console.error('Pool routing failed (non-blocking):', e);
        }
      }

      log(isUpdate ? 'gross_updated' : 'gross_complete', {
        caseId: caseData.id,
        accession: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber,
        specimenCount: specimens.length,
        ...(isUpdate ? { reason } : {}),
      });

      // Gross-Driven AI toggle (Config → AI Behavior) — previously
      // persisted correctly but read by nothing, confirmed by searching
      // the whole codebase for grossEnabled outside the settings screen
      // itself before this change. Wired here: skip the evaluation
      // entirely when disabled, rather than run it and discard the
      // result, so a disabled toggle also means no wasted AI call.
      const aiBehaviorRes = await aiBehaviorService.get();
      const grossAiEnabled = !aiBehaviorRes.ok || aiBehaviorRes.data.grossEnabled !== false;

      if (!grossAiEnabled) {
        showToast(t(isUpdate ? 'useGrossingCompletion.toast.grossUpdated' : 'useGrossingCompletion.toast.grossingComplete'));
      } else {
        showToast(t(isUpdate ? 'useGrossingCompletion.toast.grossUpdatedReEvaluating' : 'useGrossingCompletion.toast.grossingCompleteEvaluating'));

        // Lock Finalize/Finalize & Next/Sign Out while evaluation runs and
        // while any resulting review modal is open — see isEvaluatingSynopticFit.
        setIsEvaluatingSynopticFit(true);
        try {
          const { evaluateSynopticAssignment } = await import('@/services/cases/mockCaseService');
          const result = await evaluateSynopticAssignment(evaluationInput);
          const allWarnings = [...evalWarnings, ...result.warnings];
          if (allWarnings.length) {
            console.warn('[PathScribe] Stage 1 evaluation warnings:', allWarnings);
          }

          if (result.changes.length > 0) {
            handleProtocolChangesDetected(result.changes);
            // Lock stays on — showProtoReview is now true, and the combined
            // gate in BottomActionBar (isEvaluatingSynopticFit ||
            // showProtoReview) keeps Finalize disabled until the pathologist
            // resolves the modal (commit or cancel), not just until this
            // call returns.
          } else {
            showToast(t('useGrossingCompletion.toast.noSynopticChangesProposed'));
          }

          // Real feature, per direct follow-up: "there is kind of a
          // workflow that allows the Gross to be dictated and on
          // submission, the AI reads the Text, and updates the
          // template... Not sure if there is bearing here." Real
          // bearing, confirmed directly: evaluates whether each
          // specimen's CURRENTLY-ASSIGNED Grossing Template still fits,
          // now that real dictated text exists — accession-time
          // evaluateGrossingTemplateAssignment only ever had a specimen
          // description + clinical indication to go on, a much thinner
          // signal. Runs BEFORE the existing dictation-to-fields pass
          // below, and any specimen with a proposed change is excluded
          // from that pass — no reason to populate fields against a
          // template that's about to be replaced, only to throw that
          // work away once the pathologist accepts the new one (which
          // re-derives fresh suggestions for the new template itself,
          // from the same dictated text — see handleGrossingProtoCommit,
          // useAmendmentWorkflow.ts).
          const { stripHtml } = await import('@/services/narrativeSignals/deidentification');
          const perSpecimenGrossSectionsForFit = grossSections.filter(s => s.specimenId && s.text?.trim());
          const combinedDictatedGrossText = perSpecimenGrossSectionsForFit.length > 0
            ? perSpecimenGrossSectionsForFit.map(s => {
                const sp = (caseData.specimens ?? []).find(sp => sp.id === s.specimenId);
                return `SPECIMEN ${sp?.label ?? s.specimenId}: ${stripHtml(s.text)}`;
              }).join('\n\n')
            : (caseWideGrossSection ? stripHtml(caseWideGrossSection.text) : '');

          let specimensWithProposedGrossingChange = new Set<string>();
          if (grossAiEnabled && combinedDictatedGrossText.trim()) {
            try {
              const { evaluateGrossingTemplateFit } = await import('@/services/cases/mockCaseService');
              const grossingAvailableTemplates = allTemplates
                .filter(t => t.isDiagnostic === false)
                .map(t => ({ id: t.id, name: t.name, category: t.category }));

              const grossingFitResult = await evaluateGrossingTemplateFit({
                dictatedGrossText: combinedDictatedGrossText,
                specimens: (caseData.specimens ?? []).map(sp => {
                  const currentReport = grossingReports.find(g => g.specimenId === sp.id);
                  return {
                    specimenId: sp.id,
                    specimenLabel: sp.label,
                    specimenDesc: sp.description,
                    currentGrossingTemplate: currentReport
                      ? { instanceId: currentReport.instanceId, templateId: currentReport.templateId, templateName: currentReport.templateName }
                      : undefined,
                  };
                }),
                availableTemplates: grossingAvailableTemplates,
                facilityId: caseData.order?.facilityId,
              });
              if (grossingFitResult.warnings.length) {
                console.warn('[PathScribe] Grossing template fit evaluation warnings:', grossingFitResult.warnings);
              }
              if (grossingFitResult.changes.length > 0) {
                specimensWithProposedGrossingChange = new Set(grossingFitResult.changes.map(c => c.specimenId));
                handleGrossingProtocolChangesDetected(grossingFitResult.changes, combinedDictatedGrossText);
              }
            } catch (e) {
              // Non-blocking — Gross Complete has already fully
              // succeeded by this point; the existing dictation-to-
              // fields pass below still runs normally against every
              // specimen's current template, same as if this feature
              // didn't exist at all.
              console.error('[PathScribe] Grossing template fit evaluation failed:', e);
            }
          }

          // Real feature, per direct request: "Once I select Gross
          // complete that should also trigger the AI to fill in the
          // Gross synoptic form for each specimen." Only meaningful
          // when the PA actually dictated rather than filling in the
          // structured template directly — if real structured answers
          // already exist, there's nothing to back-fill, same as
          // there'd be nothing to suggest for a field the pathologist
          // already typed an answer into by hand.
          const perSpecimenGrossSections = grossSections
            .filter(s => s.specimenId && s.text?.trim())
            // Real exclusion, per the fit-evaluation step just above —
            // see this block's own header comment.
            .filter(s => !specimensWithProposedGrossingChange.has(s.specimenId!));
          if ((hasDictatedGrossText || perSpecimenGrossSections.length > 0) && (caseData.specimens ?? []).some(sp => !specimensWithProposedGrossingChange.has(sp.id))) {
            try {
              const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
              // stripHtml already imported and in scope from the
              // fit-evaluation block above.

              let suggestionsBySpecimen: Record<string, Record<string, any>> = {};

              if (perSpecimenGrossSections.length > 0) {
                // Real feature, per direct request: sections are now
                // per-specimen (handleStartManualEntry in
                // useReportGeneration.ts), so each specimen's dictated
                // text is already unambiguously its own — no more
                // cross-specimen attribution for the AI to guess at.
                // One call per specimen, each with only that
                // specimen in the candidate list, is strictly more
                // accurate than the combined-text approach the
                // case-wide path below still needs.
                const results = await Promise.all(perSpecimenGrossSections.map(async section => {
                  const sp = (caseData.specimens ?? []).find(s => s.id === section.specimenId);
                  if (!sp || !grossingFieldsBySpecimen.has(sp.id)) return null;
                  const plainText = stripHtml(section.text);
                  const result = await generateGrossingFieldSuggestionsFromDictation(
                    plainText,
                    [{ specimenId: sp.id, specimenLabel: sp.label, specimenDesc: sp.description, fields: grossingFieldsBySpecimen.get(sp.id) ?? [] }],
                    caseData.order?.facilityId,
                  );
                  return result;
                }));
                for (const r of results) {
                  if (r) suggestionsBySpecimen = { ...suggestionsBySpecimen, ...r };
                }
              } else if (caseWideGrossSection) {
                // Backward-compat path — the AI-generation flow
                // (handleGenerateReport) still produces one combined,
                // case-wide Gross Description, so this keeps working
                // exactly as it did before per-specimen sections
                // existed.
                const plainDictatedText = stripHtml(caseWideGrossSection.text);
                const dictationSpecimens = (caseData.specimens ?? [])
                  .filter(sp => grossingFieldsBySpecimen.has(sp.id))
                  // Real exclusion, per the fit-evaluation step above —
                  // see that block's own header comment.
                  .filter(sp => !specimensWithProposedGrossingChange.has(sp.id))
                  .map(sp => ({
                    specimenId: sp.id,
                    specimenLabel: sp.label,
                    specimenDesc: sp.description,
                    fields: grossingFieldsBySpecimen.get(sp.id) ?? [],
                  }));
                suggestionsBySpecimen = await generateGrossingFieldSuggestionsFromDictation(
                  plainDictatedText, dictationSpecimens, caseData.order?.facilityId,
                );
              }

              if (Object.keys(suggestionsBySpecimen).length > 0) {
                const grossingReportsWithSuggestions = grossingReports.map(g => {
                  const suggestions = suggestionsBySpecimen[g.specimenId];
                  if (!suggestions || Object.keys(suggestions).length === 0) return g;
                  // Merge, don't overwrite — a field the PA already
                  // answered directly (however unlikely alongside a
                  // dictation-only completion) keeps its real answer;
                  // AI only fills genuinely empty fields, same
                  // "propose, don't decide" posture as every other
                  // suggestion path in this app.
                  return { ...g, aiSuggestions: { ...(g.aiSuggestions ?? {}), ...suggestions } };
                });
                await caseRouter.updateCase(caseData.id, { grossingReports: grossingReportsWithSuggestions }, knownVersionRef.current);
                knownVersionRef.current = knownVersionRef.current + 1;
                setCaseData(prev => prev ? ({ ...prev, grossingReports: grossingReportsWithSuggestions } as typeof prev) : prev);
                showToast(t('useGrossingCompletion.toast.dictatedGrossReviewed'));
              }
            } catch (e) {
              // Non-blocking — Gross Complete has already fully
              // succeeded by this point; a PA can still fill in the
              // Grossing template by hand exactly as if this feature
              // didn't exist at all.
              console.error('[PathScribe] Grossing dictation suggestion generation failed:', e);
            }
          }
        } finally {
          setIsEvaluatingSynopticFit(false);
        }
      }
    } catch (err) {
      if (handleConcurrencyConflict(err, setConcurrencyConflict)) return;
      console.error('[Gross Complete] Failed:', err);
      showToast(t(isUpdate ? 'useGrossingCompletion.toast.updateGrossFailed' : 'useGrossingCompletion.toast.grossCompleteFailed'));
    }
  }, [caseData, log, showToast, handleProtocolChangesDetected, setCaseData, knownVersionRef, setConcurrencyConflict, grossingSnapshotRef, orchSections, t]);

  return {
    isEvaluatingSynopticFit,
    handleGrossComplete,
  };
}
