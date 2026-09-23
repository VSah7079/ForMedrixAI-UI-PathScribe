// src/pages/SynopticReportPage/hooks/useMicroscopicEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "So after gross complete, then
// the next logical step is to generate a Microscopic Description...
// Perhaps a gap in our orchestration flow." Same real caseRouter.
// updateCase() / knownVersionRef / concurrency-conflict pattern every
// other write hook in this directory already uses (useGrossingCompletion.ts,
// useSpecimenBlockManagement.ts) — not a new persistence approach.
//
// Deliberately its own, dedicated hook rather than folded into
// useGrossingCompletion — this is a genuinely separate real concern
// (a free-text narrative, entered independently of the Grossing
// checklist, per direct decision: "both, pathologist's choice" for
// entry method) with its own real state machine (draft -> saved,
// never 'finalized' the way a Grossing report is — see
// MicroscopicReportInstance's own doc comment in types/case/Case.ts
// for why there's no stored 'not-started' value).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { Case, MicroscopicReportInstance } from '@/types/case/Case';
import type { SetConcurrencyConflict } from './sharedHookTypes';
import { handleConcurrencyConflict } from './sharedHookTypes';

interface UseMicroscopicEntryParams {
  caseData: Case | null;
  setCaseData: React.Dispatch<React.SetStateAction<Case | null>>;
  knownVersionRef: MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
  showToast: (message: string) => void;
}

export interface UseMicroscopicEntryResult {
  /** Real, current instance for a specimen, or undefined if this
   *  specimen's Microscopic Description was never started — callers
   *  building evaluateMicroscopicFinalizeGate's own input treat
   *  undefined as that function's 'not-started' status. */
  getInstance: (specimenId: string) => MicroscopicReportInstance | undefined;
  /** Debounced-by-caller save while actively typing/dictating — sets
   *  status: 'draft'. Deliberately fire-and-forget (no concurrency-
   *  conflict surfacing) — a draft-in-progress losing a race against
   *  itself mid-keystroke isn't worth interrupting the pathologist
   *  over; the explicit confirm below is the real, meaningful save
   *  point that DOES surface conflicts. */
  saveDraft: (specimenId: string, text: string, entryMethod?: MicroscopicReportInstance['entryMethod']) => void;
  /** Explicit confirm — sets status: 'saved', even when text is
   *  empty (a real, deliberate, reviewed skip; see
   *  evaluateMicroscopicFinalizeGate.ts's own Rule 2/6). This is the
   *  real save point real concurrency conflicts get surfaced at. */
  confirmAndSave: (specimenId: string, text: string) => Promise<boolean>;
  /** Explicit clear — real, deliberate return to empty+'saved' (a
   *  reviewed skip), distinct from never having started at all only
   *  in that an instance genuinely exists on the case (audit trail:
   *  createdAt/updatedAt survive), not in how the finalize gate
   *  treats it. */
  clearAndSave: (specimenId: string) => Promise<boolean>;
}

export function useMicroscopicEntry({
  caseData, setCaseData, knownVersionRef, setConcurrencyConflict, showToast,
}: UseMicroscopicEntryParams): UseMicroscopicEntryResult {
  const { t } = useTranslation();

  const getInstance = useCallback((specimenId: string): MicroscopicReportInstance | undefined => {
    return (caseData?.microscopicReports ?? []).find(m => m.specimenId === specimenId);
  }, [caseData]);

  const writeInstance = useCallback(async (
    specimenId: string,
    patch: Partial<Pick<MicroscopicReportInstance, 'text' | 'status' | 'entryMethod'>>,
    options?: { surfaceConflict?: boolean },
  ): Promise<boolean> => {
    if (!caseData) return false;
    const nowIso = new Date().toISOString();
    const existing = (caseData.microscopicReports ?? []).find(m => m.specimenId === specimenId);
    const updated: MicroscopicReportInstance = existing
      ? { ...existing, ...patch, updatedAt: nowIso }
      : {
          instanceId: `micro-${specimenId}-${Date.now()}`,
          specimenId,
          text: '',
          status: 'draft',
          createdAt: nowIso,
          updatedAt: nowIso,
          ...patch,
        };
    const microscopicReports = existing
      ? (caseData.microscopicReports ?? []).map(m => m.specimenId === specimenId ? updated : m)
      : [...(caseData.microscopicReports ?? []), updated];

    setCaseData({ ...caseData, microscopicReports });

    if (!options?.surfaceConflict) {
      // Draft-in-progress save — fire and forget, matching this
      // hook's own doc comment above.
      caseRouter.updateCase(caseData.id, { microscopicReports }, knownVersionRef.current)
        .then(() => { knownVersionRef.current = knownVersionRef.current + 1; })
        .catch(() => { /* real, deliberate silence — see saveDraft's own doc comment */ });
      return true;
    }

    try {
      await caseRouter.updateCase(caseData.id, { microscopicReports }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
      return true;
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return false;
      showToast(t('useMicroscopicEntry.toast.saveFailed'));
      return false;
    }
  }, [caseData, setCaseData, knownVersionRef, setConcurrencyConflict, showToast, t]);

  const saveDraft = useCallback((specimenId: string, text: string, entryMethod?: MicroscopicReportInstance['entryMethod']) => {
    writeInstance(specimenId, { text, status: 'draft', entryMethod });
  }, [writeInstance]);

  const confirmAndSave = useCallback((specimenId: string, text: string) => {
    return writeInstance(specimenId, { text, status: 'saved' }, { surfaceConflict: true });
  }, [writeInstance]);

  const clearAndSave = useCallback((specimenId: string) => {
    return writeInstance(specimenId, { text: '', status: 'saved' }, { surfaceConflict: true });
  }, [writeInstance]);

  return { getInstance, saveDraft, confirmAndSave, clearAndSave };
}
