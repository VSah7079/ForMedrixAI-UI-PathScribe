// src/pages/SynopticReportPage/hooks/useOrchestratorDraft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracted from SynopticReportPage.tsx as part of the same incremental
// cleanup that produced the other hooks in this directory — see
// useLisIntegration.ts's header for the full rationale.
//
// This is a narrower, more honest scope than "the orchestrator state
// cluster" as a whole. orchSections and activeSectionId themselves stay
// in the main component — both are read directly in JSX (section
// editor props, tab-switch guards) and by other already-extracted hooks
// (useReportGeneration, useSignOutWorkflow), so moving the state itself
// would mean either dragging those concerns in too or splitting the
// state from its own usage. Same reasoning as caseData/orchSections in
// every earlier extraction tonight. What moves here is the DRAFT
// LIFECYCLE logic that operates on that state: save, restore-on-load,
// and sync-to-diagnostic.
//
// Deliberately NOT included: handleConcurrencyForceSave. It's defined
// very early in the main file (before orchSections is even declared —
// it only works via closure, since the function isn't actually called
// until well after mount) and duplicates part of saveDraftInternal's
// own logic (same isOrchCaseId check, same caseRouter.updateCase +
// localStorage.setItem pattern) rather than reusing it. That
// duplication is a real, separate observation worth a dedicated look
// later — folding it into this extraction now would either require
// reordering its definition (risky, unclear downstream effects) or
// accepting a second copy of the same save logic living inside this
// hook too. Neither is clean, so it stays where it is for now.
//
// SECOND HALF OF THIS EXTRACTION — pulled inline JSX closures into
// named functions:
// handleSectionTextChange, handleAcceptSection, handleAcceptDraft,
// handleKeepVersion, and handleAcceptAllSections were previously
// anonymous arrow functions written directly as OrchestratorSectionEditor
// JSX props (onSectionChange, onAcceptSection, onAcceptDraft,
// onKeepVersion, onAcceptAll) in the main file. Each one contains real
// business logic — what counts as a user edit, how a pending AI draft
// gets promoted to the committed version, what "accept all" means —
// not just event wiring. Per explicit direction to minimize business
// logic living in the UI/JSX layer, these are pulled out here as named,
// independently readable functions; the JSX now just wires each prop to
// the named function, same as every other handler in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { OrchestratorSection } from '../components/OrchestratorSectionEditor';
import type { Case } from '@/types/case/Case';
import type { SetConcurrencyConflict } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';

// orchSections genuinely isn't declared on the shared Case type — it's
// real, persisted data (see writeCaseDraft below), just never added to
// Case.ts. Extended locally here rather than editing the shared type:
// Case.ts is used across the whole app, and OrchestratorSection is
// defined in a UI component file, not a shared types module — importing
// it into Case.ts would be a real layering violation (core data types
// depending on component types). A local extension gets the same
// type-safety win (no more `as any` on every orchSections access) without
// that wider, harder-to-verify blast radius.
type CaseWithOrchSections = Case & { orchSections?: OrchestratorSection[] };

// ── Shared write path ──────────────────────────────────────────────────────
// Both saveDraftInternal below and the main file's handleConcurrencyForceSave
// (the "Save Mine Anyway" conflict-resolution action) need to write the same
// mode-aware field (orchSections for Orchestration, synopticReports for
// CoPilot) — that decision was previously duplicated verbatim in both
// places, a real, silent-drift risk if one path ever got fixed without the
// other. The genuine difference between the two callers — a normal save
// passes expectedVersion for the optimistic-concurrency check;
// "Save Mine Anyway" deliberately omits it to force the overwrite — is
// preserved by leaving expectedVersion as an explicit, optional parameter
// here rather than folding the two callers into one function outright.
// Exported as a plain async function, not part of the hook itself, so
// handleConcurrencyForceSave (defined very early in the main file, before
// useOrchestratorDraft is even called) can import and call it directly
// without needing to go through the hook's return value or be reordered.
export async function writeCaseDraft(
  caseData: Case,
  _caseId: string | undefined,
  orchSections: OrchestratorSection[],
  expectedVersion?: number,
): Promise<void> {
  // Real fix, per direct follow-up: "the case prefix can't determine
  // assist vs. orchestration case, we need to use a real flag."
  // caseData is already a real parameter here — reportingMode is the
  // real, authoritative field (see reportingModeRouting.ts's own
  // header comment); isOrchCaseId(caseId) was never actually needed
  // in this function at all once caseData is already in hand.
  if (caseData.reportingMode === 'orchestrator') {
    // Real fix, per direct report: "it has the attached synoptic
    // report attached to the specimen, why is it not displaying the
    // template?" — traced to here. This previously only persisted
    // orchSections, on the assumption Orchestration-mode cases only
    // ever edit that field. Not true: synopticReports and
    // grossingReports are both genuinely, actively edited for
    // Orchestration cases too (Stage 0/1 grossing, diagnostic
    // synoptic answers) — caseRouter.updateCase does a shallow merge,
    // so omitting them here meant Save Draft silently discarded any
    // edit to either field on every single save for every
    // Orchestration-mode case, not just this one flow.
    await caseRouter.updateCase(caseData.id, {
      orchSections,
      synopticReports: caseData.synopticReports,
      grossingReports: caseData.grossingReports,
    } as Partial<CaseWithOrchSections>, expectedVersion);
    localStorage.setItem(`ps_orch_sections_${caseData.id}`, JSON.stringify(orchSections));
  } else {
    // Real fix found while consolidating the save paths: this previously
    // always wrote orchSections regardless of mode — both save paths were
    // silently broken for CoPilot-mode cases, since orchSections means
    // nothing there and synopticReports (the field CoPilot actually
    // persists) was never touched.
    await caseRouter.updateCase(caseData.id, { synopticReports: caseData.synopticReports }, expectedVersion);
  }
}

interface UseOrchestratorDraftParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  caseId: string | undefined;
  orchSections: OrchestratorSection[];
  setOrchSections: React.Dispatch<React.SetStateAction<OrchestratorSection[]>>;
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
  isOrchestrationMode: boolean;
  leftTab: string;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  clearDirty: () => void;
  discardDraft: () => void;
  showToast: (message: string, kind?: import('@/utils/toastPolicy').ToastKind) => void;
}

export function useOrchestratorDraft({
  caseData, setCaseData, caseId, orchSections, setOrchSections,
  activeSectionId, setActiveSectionId, isOrchestrationMode, leftTab,
  knownVersionRef, setConcurrencyConflict, clearDirty, discardDraft, showToast,
}: UseOrchestratorDraftParams) {
  const { t } = useTranslation();

  // ── Save ──────────────────────────────────────────────────────────────
  // The real consolidation — ONE implementation of "save the draft,"
  // mode-aware (Orchestration's orchSections vs. CoPilot's synopticReports)
  // and version-checked, used by every save trigger in this file instead
  // of each one reimplementing the same logic slightly differently. Found
  // while wiring concurrency checks: there were at least four separate,
  // independently-written copies of this (the PATHSCRIBE_ORCH_SAVE_DRAFT
  // event handler, "Save & Switch," "Save & Leave," and the
  // onSaveDraft/onSaveAndNext pair) — fixing "Save Draft" didn't fix "Save
  // Draft" everywhere, because there wasn't one save path, there were four.
  //
  // Returns true if the save actually completed (caller may proceed with
  // whatever it wanted to do next — switch tabs, navigate, etc.); false if
  // held by a real conflict (caller must NOT proceed — the conflict modal
  // is now showing and owns the next step).
  //
  // Matches pre-existing behavior for non-conflict failures deliberately
  // unchanged: every one of the four original implementations logged the
  // error to console but still cleared dirty state and showed "Draft
  // saved" — not something this consolidation silently fixes, since
  // nobody asked for that behavior to change and it's a separate,
  // pre-existing issue if it's wrong.
  const saveDraftInternal = useCallback(async (): Promise<boolean> => {
    if (!caseData?.id) {
      clearDirty();
      showToast(t('useOrchestratorDraft.toast.draftSaved'));
      return true;
    }
    try {
      await writeCaseDraft(caseData, caseId, orchSections, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return false;
      console.error('Failed to persist draft:', e);
    }
    // Real fix, found via a direct bug report: this never cleared the
    // LOCAL draft cache (useDraftCache.ts) after a genuinely successful
    // server save — the server-side save and the local backup are two
    // separate mechanisms, and this function only ever handled the
    // former. That meant a stale local draft entry survived every
    // successful Save Draft, and the next time the draft-recovery check
    // ran (e.g. landing back on this case), it incorrectly reported an
    // "unsaved draft found" for work that had already been persisted.
    discardDraft();
    clearDirty();
    showToast(t('useOrchestratorDraft.toast.draftSaved'));
    return true;
  }, [caseData, caseId, orchSections, clearDirty, showToast, discardDraft, knownVersionRef, setConcurrencyConflict, t]);

  // ── Restore on load ──────────────────────────────────────────────────
  // Restore orchSections — checks localStorage AND the loaded caseData.
  // Runs whenever caseId OR caseData changes, so it can't be silently
  // overwritten by a later caseData load that doesn't carry orchSections.
  // localStorage (most recent local edits) takes priority over caseData
  // (server/mock-service state), since the pathologist's last edits are
  // the most current source of truth.
  useEffect(() => {
    if (!caseId) return;

    let restored: OrchestratorSection[] | null = null;

    // 1. Try localStorage first — most recent local draft
    try {
      const stored = localStorage.getItem(`ps_orch_sections_${caseId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          restored = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse orchSections from localStorage:', e);
    }

    // 2. Fall back to caseData.orchSections (from mock service / server)
    if (!restored) {
      const fromCase = (caseData as CaseWithOrchSections | null)?.orchSections;
      if (Array.isArray(fromCase) && fromCase.length > 0) {
        restored = fromCase;
      }
    }

    if (restored) {
      setOrchSections(restored);
    }
  // Re-run when caseData arrives (it loads asynchronously after caseId is known)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, caseData?.id]);

  // Default activeSectionId to the first section once sections load
  useEffect(() => {
    if (!activeSectionId && orchSections.length > 0) {
      setActiveSectionId(orchSections[0].id);
    }
  }, [orchSections, activeSectionId, setActiveSectionId]);

  // ── Sync to diagnostic ────────────────────────────────────────────────
  // Sync orchSections → caseData.diagnostic so LeftReportPanel (Full Report)
  // always reflects the current draft without requiring a manual save.
  // Extracted to a stable callback so it can be invoked both reactively
  // (whenever orchSections itself changes — the original behavior) AND
  // explicitly whenever the user switches onto the Synoptic Reporting tab,
  // as a defensive re-sync at the moment LeftReportPanel actually becomes
  // visible — covers any edge case where the continuous effect hasn't
  // caught up yet (e.g. orchSections just restored from localStorage on a
  // fresh tab switch before that effect's first run lands).
  const syncOrchSectionsToDiagnostic = useCallback(() => {
    if (!isOrchestrationMode || orchSections.length === 0) return;
    const find = (id: string) => orchSections.find(s => s.id === id)?.text ?? '';
    // Map known section IDs to diagnostic fields; fall back to concatenated narrative
    const grossText  = find('gross_description') || find('gross');
    const microText  = find('microscopic') || find('microscopic_description');
    const ancText    = find('ancillary_studies') || find('ancillary');
    // Full narrative: all sections joined for LeftReportPanel's report body
    const fullNarrative = orchSections.map(s => `<h3>${s.label}</h3>${s.text}`).join('');
    setCaseData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        diagnostic: {
          ...prev.diagnostic,
          grossDescription:       grossText       || prev.diagnostic?.grossDescription       || '',
          microscopicDescription: microText       || prev.diagnostic?.microscopicDescription || '',
          ancillaryStudies:       ancText         || prev.diagnostic?.ancillaryStudies       || '',
          reportNarrative:        fullNarrative,
        },
      };
    });
  }, [orchSections, isOrchestrationMode, setCaseData]);

  useEffect(() => { syncOrchSectionsToDiagnostic(); }, [orchSections, isOrchestrationMode]); // eslint-disable-line

  // Explicit re-sync on tab switch — the moment leftTab becomes 'report',
  // force a fresh pull from orchSections rather than relying solely on the
  // change-triggered effect above.
  useEffect(() => {
    if (leftTab === 'report') syncOrchSectionsToDiagnostic();
  }, [leftTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wire ORCH keyboard/voice events to page-level handlers ────────────────
  useEffect(() => {
    if (!isOrchestrationMode) return;
    const saveDraft = async () => {
      await saveDraftInternal();
    };
    const generateReport = () => {
      // Fire the same event that Generate Report button uses
      window.dispatchEvent(new CustomEvent('PATHSCRIBE_ORCH_START_GENERATE'));
    };
    window.addEventListener('PATHSCRIBE_ORCH_SAVE_DRAFT',    saveDraft    as EventListener);
    window.addEventListener('PATHSCRIBE_ORCH_GENERATE_REPORT', generateReport as EventListener);
    return () => {
      window.removeEventListener('PATHSCRIBE_ORCH_SAVE_DRAFT',    saveDraft    as EventListener);
      window.removeEventListener('PATHSCRIBE_ORCH_GENERATE_REPORT', generateReport as EventListener);
    };
  }, [isOrchestrationMode, caseData?.id, orchSections, saveDraftInternal]);

  // ── Section editing business logic ───────────────────────────────────
  // Previously five anonymous inline closures on OrchestratorSectionEditor's
  // JSX props — see this file's header for why they're named functions here.
  const handleSectionTextChange = useCallback((id: string, html: string) => {
    setOrchSections(prev => prev.map(s =>
      s.id === id ? { ...s, text: html, userEdited: html !== s.aiGenerated } : s
    ));
  }, [setOrchSections]);

  const handleAcceptSection = useCallback((id: string, finalText: string) => {
    setOrchSections(prev =>
      prev.map(s => s.id === id
        ? { ...s, text: finalText, userEdited: true } // explicit Accept — always commits, no text-equality guessing
        : s)
    );
  }, [setOrchSections]);

  const handleAcceptDraft = useCallback((id: string) => {
    setOrchSections(prev =>
      prev.map(s => s.id === id && s.pendingDraft != null
        ? { ...s, text: s.pendingDraft, aiGenerated: s.pendingDraft, userEdited: false, pendingDraft: undefined }
        : s)
    );
  }, [setOrchSections]);

  const handleKeepVersion = useCallback((id: string) => {
    setOrchSections(prev =>
      prev.map(s => s.id === id ? { ...s, pendingDraft: undefined } : s)
    );
  }, [setOrchSections]);

  const handleAcceptAllSections = useCallback(() => {
    setOrchSections(prev =>
      prev.map(s =>
        s.aiGenerated && !s.userEdited && !s.committed
          ? { ...s, userEdited: true }
          : s
      )
    );
  }, [setOrchSections]);

  return {
    saveDraftInternal,
    handleSectionTextChange,
    handleAcceptSection,
    handleAcceptDraft,
    handleKeepVersion,
    handleAcceptAllSections,
  };
}
