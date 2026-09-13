// src/pages/GrossingScreenPage/hooks/useGrossingScreen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 3 Grossing Screen. Same real optimistic-update + concurrency-
// conflict-retry shape as useSpecimenBlockManagement.ts's own write
// handlers — wraps utils/grossingScreenOperations.ts's pure functions
// with the actual real persistence.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { caseRouter } from '@/services/cases/CaseRouter';
import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import type { ProtocolPathway } from '@/services/protocols/IProtocolService';
import type { StainType } from '@/services/stains/IStainService';
import {
  addGrossingBlock, removeGrossingBlock, addGrossingStain, removeGrossingStain, updateGrossingPieceCount,
} from '@/utils/grossingScreenOperations';
import type { SigningUser, SetConcurrencyConflict } from '@/pages/SynopticReportPage/hooks/sharedHookTypes';
import { handleConcurrencyConflict } from '@/pages/SynopticReportPage/hooks/sharedHookTypes';

interface UseGrossingScreenParams {
  caseData: Case | null;
  setCaseData: (updater: Case | ((prev: Case | null) => Case | null)) => void;
  signingUser: SigningUser;
  knownVersionRef: React.MutableRefObject<number>;
  setConcurrencyConflict: SetConcurrencyConflict;
}

export function useGrossingScreen({ caseData, setCaseData, signingUser, knownVersionRef, setConcurrencyConflict }: UseGrossingScreenParams) {
  const [pendingStainRemoval, setPendingStainRemoval] = useState<{ specimenId: string; blockId: string; stainId: string } | null>(null);

  const persistSpecimen = useCallback(async (updatedSpecimen: Specimen) => {
    if (!caseData?.id) return;
    const updatedSpecimens = (caseData.specimens ?? []).map((sp: Specimen) => sp.id === updatedSpecimen.id ? updatedSpecimen : sp);
    setCaseData(prev => prev ? ({ ...prev, specimens: updatedSpecimens } as typeof prev) : prev);
    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens }, knownVersionRef.current);
      knownVersionRef.current = knownVersionRef.current + 1;
    } catch (e) {
      if (handleConcurrencyConflict(e, setConcurrencyConflict)) return;
      console.error('[GrossingScreen] Failed to persist specimen change:', e);
    }
  }, [caseData, setCaseData, knownVersionRef, setConcurrencyConflict]);

  const handleAddBlock = useCallback(async (specimenId: string, pathway: ProtocolPathway) => {
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    const result = addGrossingBlock(specimen, pathway, caseData.accession?.fullAccession ?? caseData.id);
    if (result.ok) await persistSpecimen(result.specimen);
  }, [caseData, persistSpecimen]);

  const handleRemoveBlock = useCallback(async (specimenId: string, blockId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!caseData) return { ok: false, error: 'No case loaded.' };
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return { ok: false, error: 'Specimen not found.' };
    const result = removeGrossingBlock(specimen, blockId);
    if (!result.ok) return { ok: false, error: 'error' in result ? result.error : 'Cannot remove this block.' };
    await persistSpecimen(result.specimen);
    return { ok: true };
  }, [caseData, persistSpecimen]);

  const handleAddStain = useCallback(async (specimenId: string, blockId: string, stainType: StainType) => {
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    const result = addGrossingStain(specimen, blockId, stainType, signingUser?.id ?? 'unknown', caseData.accession?.fullAccession ?? caseData.id);
    if (result.ok) await persistSpecimen(result.specimen);
  }, [caseData, signingUser, persistSpecimen]);

  // Real, per the spec's own "confirmation prompt if removing a
  // protocol default." First call (confirmed omitted/false) against a
  // real protocol-default stain returns needsConfirmation instead of
  // removing anything — the caller (the page) shows a real confirm
  // dialog and calls confirmPendingStainRemoval() only if the tech
  // actually confirms. A user-added stain never needs this round trip
  // at all — see grossingScreenOperations.ts's own doc comment.
  const handleRemoveStain = useCallback(async (specimenId: string, blockId: string, stainId: string): Promise<{ ok: true } | { needsConfirmation: true }> => {
    if (!caseData) return { ok: true };
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return { ok: true };
    const result = removeGrossingStain(specimen, blockId, stainId, signingUser?.id ?? 'unknown', false);
    if (!result.ok && 'needsConfirmation' in result) {
      setPendingStainRemoval({ specimenId, blockId, stainId });
      return { needsConfirmation: true };
    }
    if (result.ok) await persistSpecimen(result.specimen);
    return { ok: true };
  }, [caseData, signingUser, persistSpecimen]);

  const confirmPendingStainRemoval = useCallback(async () => {
    if (!caseData || !pendingStainRemoval) return;
    const { specimenId, blockId, stainId } = pendingStainRemoval;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    setPendingStainRemoval(null);
    if (!specimen) return;
    const result = removeGrossingStain(specimen, blockId, stainId, signingUser?.id ?? 'unknown', true);
    if (result.ok) await persistSpecimen(result.specimen);
  }, [caseData, pendingStainRemoval, signingUser, persistSpecimen]);

  const cancelPendingStainRemoval = useCallback(() => setPendingStainRemoval(null), []);

  const handleUpdatePieceCount = useCallback(async (specimenId: string, blockId: string, newCount: number) => {
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    const result = updateGrossingPieceCount(specimen, blockId, newCount, signingUser?.id ?? 'unknown');
    if (result.ok) await persistSpecimen(result.specimen);
  }, [caseData, signingUser, persistSpecimen]);

  return {
    handleAddBlock, handleRemoveBlock, handleAddStain, handleRemoveStain,
    pendingStainRemoval, confirmPendingStainRemoval, cancelPendingStainRemoval,
    handleUpdatePieceCount,
  };
}
