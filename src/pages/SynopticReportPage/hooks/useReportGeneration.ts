// src/pages/SynopticReportPage/hooks/useReportGeneration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx (originally lines ~3184-3376, the
// "── Orchestrator handlers ──" section) as part of the same incremental
// cleanup that produced useLisIntegration.ts and
// useSpecimenBlockManagement.ts — see useLisIntegration.ts's header for
// the full rationale.
//
// PURE MOVE, not a rewrite — every function body is unchanged.
//
// IMPORTANT SCOPE NOTE, read before extending this hook further:
// orchSections itself is deliberately NOT owned by this hook, even
// though every function here reads or writes it. A full investigation
// (grep across all 56 usages in the main file) found orchSections is
// genuinely central to at least six other concerns beyond generation:
// draft persistence to localStorage, restoration on load, a sync
// effect keeping caseData.diagnostic current for LeftReportPanel,
// concurrency-conflict force-save, the main save-draft path, and the
// finalize/sign-out flow. Moving the state itself would mean either
// dragging all of those concerns into this hook too (far beyond
// "report generation") or leaving orchSections split across two files
// with its definition in one and half its real usage in the other —
// worse than not extracting at all. Instead, orchSections and
// setOrchSections are received as parameters here, same pattern as
// caseData/setCaseData in the other two extracted hooks. If a future
// pass tackles the draft-persistence/sync cluster as its own dedicated
// extraction, that would be the point to reconsider whether
// orchSections can move to a shared hook both depend on.
//
// Scope actually owned by this hook: the AI streaming callbacks
// (buildOrchCallbacks), the two ways generation is invoked
// (handleGenerateReport, handleRegenerateSection), cancellation
// (handleAbortGenerate), and the "auto-generate once" trigger/cancel
// flow (cancelAutoGenerate + its two effects) — plus their own
// tightly-scoped state (isOrchestrating, engineRef, abortRef,
// pendingAutoGenerate, autoGenerateAttemptedRef, autoGenerateTimerRef),
// all of which were verified via grep to have zero usage outside this
// cluster before being moved.
//
// Deliberately NOT included: handleOrchPrint and
// generateReportPdfSnapshot, even though they're also
// "report-generation-adjacent." Both read resolvedContext directly
// (13 usages across the file, including JSX), not just orchSections,
// and generateReportPdfSnapshot is called from both the sign-out and
// amendment workflows — genuinely separate domains not yet extracted.
// They stay in the main file for now rather than being swept in here
// just because their names overlap.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { textToHtml } from '../components/OrchestratorSectionEditor';
import type { OrchestratorSection } from '../components/OrchestratorSectionEditor';
import { OrchestratorEngine } from '@/orchestrator/orchestratorEngine';
import type { OrchestratorCallbacks } from '@/orchestrator/orchestratorEngine';
import { buildContext } from '@/orchestrator/contextBuilder';
import type { Case } from '@/types/case/Case';
import type { StructuredContext } from '@/orchestrator/contextBuilder';
import type { RightSynopticPanelHandle } from '../components/RightSynopticPanel';
import type { SigningUser } from './sharedHookTypes';

interface UseReportGenerationParams {
  caseData: Case | null;
  signingUser: SigningUser;
  showToast: (message: string) => void;
  orchSections: OrchestratorSection[];
  setOrchSections: React.Dispatch<React.SetStateAction<OrchestratorSection[]>>;
  overrideTemplateId: string | null;
  safeSetLeftTab: (tab: string) => void;
  leftTab: string;
  isOrchestrationMode: boolean;
  synopticPanelRef: MutableRefObject<RightSynopticPanelHandle | null>;
  caseId: string | undefined;
  setResolvedContext: (ctx: StructuredContext | null) => void;
  setResolvedTemplateId: React.Dispatch<React.SetStateAction<string>>;
  setResolvedTemplateName: (name: string) => void;
  setResolvedBy: (by: string) => void;
  setLastGeneratedAt: (date: Date) => void;
}

export function useReportGeneration({
  caseData, signingUser, showToast, orchSections, setOrchSections,
  overrideTemplateId, safeSetLeftTab, leftTab, isOrchestrationMode,
  synopticPanelRef, caseId,
  setResolvedContext, setResolvedTemplateId, setResolvedTemplateName, setResolvedBy,
  setLastGeneratedAt,
}: UseReportGenerationParams) {
  const abortRef  = useRef<AbortController | null>(null);
  const engineRef = useRef<OrchestratorEngine | null>(null);
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const { t } = useTranslation();

  // Real fix (PS-318 — "the Preliminary Diagnosis was expected to be
  // present but isn't showing"): buildContext() (contextBuilder.ts)
  // has always computed a real warnings[] array — ambiguous template
  // matches, a routing failure degraded to gold-standard, and now a
  // real, specific one for exactly this ticket's own case (an override
  // silently dropping the Preliminary Diagnosis section — see that
  // warning's own doc comment in contextBuilder.ts). None of it was
  // ever actually shown anywhere — every call site here set
  // resolvedContext and moved on, discarding ctx.warnings entirely.
  // That's the real, broader gap PS-318 sits inside: not that routing
  // is wrong (it's deliberately strict, per PS-292), but that when it
  // has something real to say about why a section won't appear, the
  // pathologist was never told. Small, shared surface point, used by
  // the two real "start a fresh report" callers (manual entry,
  // generate) right after buildContext resolves — deliberately NOT
  // wired into handleRegenerateSection below: Regen All (PS-317's own
  // fix) now calls that once per section in sequence, and the same
  // case/template-level warning would be identical on every single
  // one of those calls, so surfacing it there would mean the same
  // toast firing repeatedly instead of once.
  const surfaceContextWarnings = useCallback((ctx: StructuredContext) => {
    // Defensive optional-chain: StructuredContext.warnings is a real,
    // always-populated string[] from the actual buildContext()
    // implementation, but existing tests in this file mock buildContext
    // with a partial context object that doesn't include it — this
    // keeps a mock missing the field from throwing here instead of
    // reaching the real generation/regeneration logic those tests
    // exist to verify.
    // i18n note: these warning strings are now translated at their own
    // source (@/orchestrator/contextBuilder.ts resolves each one via a
    // direct i18next instance call — it's a plain service, not a hook),
    // so this hook stays correct simply by joining and displaying
    // whatever buildContext() returns, in any language.
    if (ctx.warnings?.length > 0) showToast(ctx.warnings.join(' • '));
  }, [showToast]);

  // ── Orchestrator callbacks ─────────────────────────────────────────────────
  const buildOrchCallbacks = useCallback((): OrchestratorCallbacks => ({
    onSectionStart: (sectionId, title, sourcePartId) => {
      setOrchSections(prev => {
        const exists = prev.find(s => s.id === sectionId);
        if (exists) {
          // CRITICAL: a regenerate must start the new stream from a blank
          // slate. Two distinct cases:
          //  • userEdited (accepted) sections — the committed `text` is
          //    the pathologist's signed-off version and must stay exactly
          //    as-is, untouched, for the whole regenerate. The new stream
          //    accumulates in `pendingDraft` only (onToken below), same as
          //    before. Clearing pendingDraft here (not undefined-merging
          //    onto whatever was left over) ensures the new draft starts
          //    from nothing.
          //  • not-yet-accepted (AI-generated or empty) sections — `text`
          //    IS the live preview, so it must also be reset to '' here.
          //    Previously it wasn't, so a regenerate's onToken branch
          //    (`s.text + token`) appended fresh tokens directly onto the
          //    end of the PREVIOUS generation's already-wrapped HTML
          //    string (e.g. "<p>...old draft...</p>" + "**" + ...) —
          //    textToHtml's leading-'<' passthrough then handed that
          //    malformed concatenation straight to the editor unwrapped,
          //    which is what produced the orphaned "**" fragment.
          return prev.map(s => s.id === sectionId
            ? (s.userEdited
                ? { ...s, isStreaming: true, pendingDraft: '' }
                : { ...s, isStreaming: true, pendingDraft: undefined, text: '' })
            : s);
        }
        return [...prev, { id: sectionId, label: title, type: 'narrative' as const, text: '', aiGenerated: '', userEdited: false, isStreaming: true, sourcePartId }];
      });
    },
    onToken: (sectionId, token) => {
      setOrchSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        // userEdited (accepted) sections: stream into pendingDraft only —
        // `text` (the committed version) must stay untouched until the
        // pathologist explicitly chooses "Use new draft".
        if (s.userEdited) return { ...s, pendingDraft: (s.pendingDraft ?? '') + token };
        // Not-yet-accepted sections: `text` was just reset to '' in
        // onSectionStart, so this is a clean accumulation, not a
        // concatenation onto stale content.
        return { ...s, text: s.text + token };
      }));
    },
    onSectionComplete: (sectionId, result) => {
      const html = textToHtml(result.text ?? '');
      setOrchSections(prev => prev.map(s => {
        if (s.id !== sectionId) return s;
        // Accepted section: `text` (the pathologist's signed-off version)
        // is left exactly as it was — the finished regenerate result lands
        // in `pendingDraft`, surfacing the "New AI draft available — Use
        // new draft / Keep my version" banner. Nothing is overwritten
        // until the pathologist explicitly chooses.
        if (s.userEdited) return { ...s, isStreaming: false, pendingDraft: html };
        return { ...s, isStreaming: false, text: html, aiGenerated: html };
      }));
    },
    onComplete: () => {
      setIsOrchestrating(false);
      setLastGeneratedAt(new Date());
      engineRef.current = null;
      abortRef.current  = null;
    },
    onError: (_sectionId, error) => {
      setIsOrchestrating(false);
      engineRef.current = null;
      abortRef.current  = null;
      showToast(t('useReportGeneration.toast.generationError', { error }));
    },
  }), [showToast, setOrchSections, setLastGeneratedAt, t]);

  // Real fix, per direct workflow description: "the PA prefers to
  // dictate the Gross and then AI would update the attached
  // synoptic." Previously the only way any section ever came into
  // existence was via handleGenerateReport below (a real AI call for
  // every section) — there was no way to open a blank, dictation-
  // ready "Gross Description" field without first triggering AI
  // generation for it. Reuses the exact same buildContext() section
  // resolution handleGenerateReport uses (so the section set/order
  // always matches what a real generation run would produce), but
  // builds them blank — same shape onSectionStart already creates
  // for a normal in-progress section (id/label/type/text/aiGenerated/
  // userEdited), just isStreaming: false since nothing is actually
  // generating. The pathologist types or dictates directly into
  // these; nothing here calls the AI provider at all.
  const handleStartManualEntry = useCallback(async () => {
    if (!caseData) return;
    try {
      const ctx = await buildContext(caseData, signingUser, overrideTemplateId || undefined);
      setResolvedContext(ctx);
      setResolvedTemplateId(ctx.narrativeTemplate.templateId);
      setResolvedTemplateName(ctx.narrativeTemplate.templateName);
      setResolvedBy(overrideTemplateId ? 'pathologist-override' : (ctx.routingResolvedBy ?? 'gold-standard'));
      surfaceContextWarnings(ctx);

      const enabledSections = (ctx.narrativeTemplate?.sections ?? [])
        .filter((s: any) => s.enabled)
        .sort((a: any, b: any) => a.order - b.order);

      // Real feature, per direct request: "a separate section for
      // each specimen location so that it is easier for the User to
      // dictate the gross for each specimen. The specimen Name
      // should display at the beginning." Scoped to Gross Description
      // specifically (sourcePartId === 'std_body_gross') — every
      // other narrative part (Microscopic/Ancillary/Diagnosis) stays
      // a single, case-wide section, matching the request precisely
      // and matching how those sections have always worked.
      //
      // Real fix (PS-317 — "it isn't clear at all what the field
      // represents (should explicitly say 'Gross Description' if
      // that's what it is)"): the original request asked for the
      // specimen name to display "at the beginning" — a prefix — but
      // this built the label as ONLY the specimen name/description,
      // dropping s.title ("Gross Description") entirely. That's the
      // real cause of the ambiguity: nothing in the label said what
      // kind of section this was, on any of these per-specimen rows.
      // Restored s.title as a real prefix, specimen name/description
      // after it, matching what was actually asked for.
      const specimens = caseData.specimens ?? [];
      const blankSections: OrchestratorSection[] = enabledSections.flatMap((s: any) => {
        if (s.sourcePartId === 'std_body_gross' && specimens.length > 0) {
          return specimens.map(sp => ({
            id: `${s.id}_${sp.id}`,
            label: sp.description ? `${s.title} — Specimen ${sp.label}: ${sp.description}` : `${s.title} — Specimen ${sp.label}`,
            type: 'narrative' as const,
            text: '', aiGenerated: '', userEdited: false, isStreaming: false,
            sourcePartId: s.sourcePartId,
            specimenId: sp.id,
          }));
        }
        return [{
          id: s.id, label: s.title, type: 'narrative' as const,
          text: '', aiGenerated: '', userEdited: false, isStreaming: false,
          sourcePartId: s.sourcePartId,
        }];
      });
      setOrchSections(blankSections);
      safeSetLeftTab('draft');
    } catch (e: unknown) {
      const err = e instanceof Error ? e : undefined;
      showToast(t('useReportGeneration.toast.couldNotOpenManualEntry', {
        message: err?.message ?? t('useReportGeneration.labels.unknownError'),
      }));
    }
  }, [caseData, signingUser, overrideTemplateId, setResolvedContext, setResolvedTemplateId, setResolvedTemplateName, setResolvedBy, setOrchSections, safeSetLeftTab, showToast, surfaceContextWarnings, t]);

  const handleGenerateReport = useCallback(async () => {
    if (!caseData) return;
    setIsOrchestrating(true);
    safeSetLeftTab('draft');
    try {
      // Build context async — resolves routing rules from service.
      // If the pathologist has overridden the template via Change ▾, pass
      // it straight through — buildContext resolves the override via the
      // same real Parts/Assembly path as auto-routing, so there is exactly
      // one place template→sections resolution happens, not two kept "in
      // sync." (Previously this block re-derived narrativeTemplate here via
      // the registry directly — that divergent path is gone.)
      const ctx = await buildContext(caseData, signingUser, overrideTemplateId || undefined);
      setResolvedContext(ctx);

      // Capture resolved template for display — reflects an active
      // override in the centre pane header, not the auto-resolved name.
      setResolvedTemplateId(ctx.narrativeTemplate.templateId);
      setResolvedTemplateName(ctx.narrativeTemplate.templateName);
      setResolvedBy(overrideTemplateId ? 'pathologist-override' : (ctx.routingResolvedBy ?? 'gold-standard'));
      surfaceContextWarnings(ctx);
      const engine = new OrchestratorEngine(undefined, ctx, buildOrchCallbacks());
      engineRef.current = engine;
      await engine.run();
    } catch (e: unknown) {
      const err = e instanceof Error ? e : undefined;
      if (err?.name !== 'AbortError') {
        showToast(t('useReportGeneration.toast.generationFailed', {
          message: err?.message ?? t('useReportGeneration.labels.unknown'),
        }));
      }
      setIsOrchestrating(false);
      engineRef.current = null;
      abortRef.current  = null;
    }
  }, [caseData, buildOrchCallbacks, showToast, overrideTemplateId, safeSetLeftTab, signingUser, setResolvedContext, setResolvedTemplateId, setResolvedTemplateName, setResolvedBy, surfaceContextWarnings, t]);

  const handleAbortGenerate = useCallback(() => {
    engineRef.current?.cancel();
    setIsOrchestrating(false);
    engineRef.current = null;
    abortRef.current  = null;
    showToast(t('useReportGeneration.toast.generationCancelled'));
  }, [showToast, t]);

  const handleRegenerateSection = useCallback(async (sectionId: string) => {
    if (!caseData || isOrchestrating) return;
    setIsOrchestrating(true);
    try {
      // Must pass overrideTemplateId here too — regenerating a single
      // section after a pathologist override previously fell back to the
      // auto-resolved template silently, generating against the wrong
      // section's instructions. Same root cause as handleGenerateReport.
      const ctx    = await buildContext(caseData, signingUser, overrideTemplateId || undefined);
      setResolvedContext(ctx);
      const engine = new OrchestratorEngine(undefined, ctx, buildOrchCallbacks());
      engineRef.current = engine;
      await engine.regenerateSection(sectionId);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : undefined;
      if (err?.name !== 'AbortError') {
        showToast(t('useReportGeneration.toast.regenerationFailed', {
          message: err?.message ?? t('useReportGeneration.labels.unknown'),
        }));
      }
    } finally {
      setIsOrchestrating(false);
      engineRef.current = null;
      abortRef.current  = null;
    }
  }, [caseData, isOrchestrating, buildOrchCallbacks, showToast, overrideTemplateId, signingUser, setResolvedContext, t]);

  // ── Auto-generate-once — Draft tab, data-state-driven ────────────────────
  // Per design discussion: NOT triggered by tab navigation alone (clicking
  // into Draft to peek shouldn't burn an AI call), and NOT silent (the
  // pathologist gets a cancelable window, not a draft that just appears).
  // Fires when ALL of the following hold simultaneously:
  //   - the pathologist has landed on the Draft tab
  //   - this is an Orchestration-mode case
  //   - no draft exists yet (orchSections is empty — won't re-fire on a
  //     second visit, and won't clobber an existing draft)
  //   - generation isn't already running
  //   - all required synoptic fields are answered (synopticPanelRef's
  //     validateRequired() — the same check already gating Finalize —
  //     returns nothing missing)
  //   - it hasn't already been attempted this case session (the ref guard
  //     below; reset whenever caseId changes)
  const autoGenerateAttemptedRef = useRef(false);
  const autoGenerateTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false);

  useEffect(() => {
    autoGenerateAttemptedRef.current = false;
    if (autoGenerateTimerRef.current) { clearTimeout(autoGenerateTimerRef.current); autoGenerateTimerRef.current = null; }
    setPendingAutoGenerate(false);
  }, [caseId]);

  const cancelAutoGenerate = useCallback(() => {
    if (autoGenerateTimerRef.current) { clearTimeout(autoGenerateTimerRef.current); autoGenerateTimerRef.current = null; }
    setPendingAutoGenerate(false);
  }, []);

  useEffect(() => {
    if (
      leftTab !== 'draft' ||
      !isOrchestrationMode ||
      orchSections.length > 0 ||
      isOrchestrating ||
      autoGenerateAttemptedRef.current ||
      !synopticPanelRef.current
    ) return;

    const missing = synopticPanelRef.current.validateRequired();
    if (missing.length > 0) return; // not complete yet — stay quiet, no nag

    autoGenerateAttemptedRef.current = true;
    setPendingAutoGenerate(true);
    autoGenerateTimerRef.current = setTimeout(() => {
      setPendingAutoGenerate(false);
      autoGenerateTimerRef.current = null;
      handleGenerateReport();
    }, 2000);
  }, [leftTab, isOrchestrationMode, orchSections.length, isOrchestrating, handleGenerateReport, synopticPanelRef]);

  // Cleanup on unmount — don't fire generation against an unmounted page.
  useEffect(() => () => {
    if (autoGenerateTimerRef.current) clearTimeout(autoGenerateTimerRef.current);
  }, []);

  return {
    isOrchestrating,
    pendingAutoGenerate,
    handleGenerateReport,
    handleStartManualEntry,
    handleAbortGenerate,
    handleRegenerateSection,
    cancelAutoGenerate,
  };
}
