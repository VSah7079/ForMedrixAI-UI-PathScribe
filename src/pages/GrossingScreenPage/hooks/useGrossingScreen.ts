// src/pages/GrossingScreenPage/hooks/useGrossingScreen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 3 Grossing Screen. Same real optimistic-update + concurrency-
// conflict-retry shape as useSpecimenBlockManagement.ts's own write
// handlers — wraps utils/grossingScreenOperations.ts's pure functions
// with the actual real persistence.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from 'react';
import { caseRouter } from '@/services/cases/CaseRouter';
import { specimenDeficiencyService, fieldRequirementService, authorizationService, auditService } from '@/services';
import { resolveFieldRequirements, type ResolvedFieldRequirement } from '@/services/fieldRequirements/fieldRequirementRules';
import {
  completeGrossing, missingGrossingItems, specimensForSecondaryReview, type CompleteGrossingRefusal,
} from '@/services/grossing/grossingCompletion';
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
  // Real, per direct request — tracks which specimens already have a
  // real, OPEN def-missing-fixation-completion deficiency, so the
  // "Raise Deficiency" action can show its own real, recorded state
  // instead of silently doing something with no visible feedback,
  // same real convention as the fixation fields themselves above.
  // Multiple deficiencies per specimen are genuinely allowed (see
  // services/deficiencies/README.md's own real fix on this) — this
  // only reflects whether at least one open one already exists, it
  // never blocks raising another.
  const [specimensWithOpenFixationDeficiency, setSpecimensWithOpenFixationDeficiency] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!caseData?.id) return;
    specimenDeficiencyService.getByCaseId(caseData.id).then(res => {
      if (!res.ok) return;
      const open = res.data.filter(d => d.deficiencyTypeId === 'def-missing-fixation-completion' && d.status !== 'closed');
      setSpecimensWithOpenFixationDeficiency(new Set(open.map(d => d.specimenId).filter((id): id is string => !!id)));
    });
  }, [caseData?.id]);

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

  // Real, per direct request (ISO 15189 traceability — "duration of
  // fixation... from specimen collection to grossing") — grossing is
  // the real, natural moment tissue actually leaves the fixative, so
  // this is where fixationEndedAt gets recorded. Record only, per
  // direct decision — no gating on this yet.
  const handleRecordFixationEnded = useCallback(async (specimenId: string) => {
    if (!caseData) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    await persistSpecimen({
      ...specimen,
      processing: { ...specimen.processing, fixationEndedAt: new Date().toISOString() },
    });
  }, [caseData, persistSpecimen]);

  // Real, per direct guidance's own follow-up ("timestamp and user ID
  // associated with the... check to satisfy laboratory accreditation
  // traceability requirements") — a real audit object, not a bare
  // boolean. No real, structured tissue volume/weight field exists to
  // compute an actual ratio against (confirmed directly before this
  // was built), so this records a grossing tech's own direct,
  // qualitative confirmation instead.
  const handleConfirmFixativeRatio = useCallback(async (specimenId: string) => {
    if (!caseData || !signingUser?.id) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    await persistSpecimen({
      ...specimen,
      processing: {
        ...specimen.processing,
        fixativeToTissueRatioConfirmation: {
          userId: signingUser.id, userName: signingUser.name ?? signingUser.id, confirmedAt: new Date().toISOString(),
        },
      },
    });
  }, [caseData, signingUser, persistSpecimen]);

  // Real, per direct decision — a human, not a gate, raises this. No
  // capaTriggerRule/automatic-detection mechanism at all, unlike
  // def-ai-discordance/def-confirmed-high-risk-finding elsewhere in
  // this app; whoever is grossing and notices the gap raises it on
  // the spot. Reuses the real, existing specimenDeficiencyService.raise()
  // — a SpecimenDeficiency IS the real CAPA record in this app (see
  // services/deficiencies/README.md's own "Firestore-backed CAPA
  // foundation" section) — never a new, parallel CAPA entity.
  const handleRaiseFixationDeficiency = useCallback(async (specimenId: string) => {
    if (!caseData?.id || !signingUser?.id) return;
    const specimen = (caseData.specimens ?? []).find((sp: Specimen) => sp.id === specimenId);
    if (!specimen) return;
    const result = await specimenDeficiencyService.raise({
      caseId: caseData.id,
      specimenId: specimen.id,
      specimenLabel: specimen.label,
      deficiencyTypeId: 'def-missing-fixation-completion',
      comment: 'Flagged manually at grossing — fixation end time and/or fixative:tissue ratio confirmation missing.',
      raisedBy: signingUser.id,
    });
    if (result.ok) {
      setSpecimensWithOpenFixationDeficiency(prev => new Set(prev).add(specimenId));
    }
  }, [caseData, signingUser]);

  // Batch 378 (PS-359): Complete grossing, checked against the organisation's
  // Grossing field requirements. The decisions are in services/grossing.
  // Batch 379: with the protocol rule switched off, specimens without a
  // protocol need a confirmation (pendingProtocolConfirmation) and are then
  // routed for secondary review; the result says which.
  const [grossingRequirements, setGrossingRequirements] = useState<ResolvedFieldRequirement[]>(() => resolveFieldRequirements('grossing'));
  useEffect(() => { void fieldRequirementService.forSession('grossing').then(setGrossingRequirements); }, [signingUser?.id]);
  const missingItems = caseData ? missingGrossingItems(caseData, grossingRequirements) : [];
  const secondaryReviewSpecimens = caseData ? specimensForSecondaryReview(caseData, grossingRequirements) : [];
  const [completeRefusal, setCompleteRefusal] = useState<CompleteGrossingRefusal | null>(null);
  const [pendingProtocolConfirmation, setPendingProtocolConfirmation] = useState<string[] | null>(null);
  const [completionReview, setCompletionReview] = useState<{ routedForReview: string[]; reviewNotRaised: string[] } | null>(null);

  // One completion at a time: a double click, or a command heard twice,
  // must not start a second attempt against the same case version.
  const completingRef = useRef(false);
  const runCompleteGrossing = useCallback(async (confirmedWithoutProtocol: boolean) => {
    if (!caseData || completingRef.current) return;
    completingRef.current = true;
    try {
      const result = await completeGrossing(caseData, grossingRequirements, knownVersionRef.current, {
        authorization: authorizationService,
        updateCase: (id, patch, version) => caseRouter.updateCase(id, patch, version),
        audit: entry => auditService.logEvent(entry),
        raiseDeficiency: input => specimenDeficiencyService.raise(input),
        actorName: signingUser?.name ?? signingUser?.id ?? 'unknown',
        actorId: signingUser?.id ?? 'unknown',
      }, { confirmedWithoutProtocol });
      if (result.ok === false) {
        if (result.reason === 'needsConfirmation') { setPendingProtocolConfirmation(result.withoutProtocol ?? []); setCompleteRefusal(null); return; }
        setCompleteRefusal(result.reason);
        return;
      }
      knownVersionRef.current = knownVersionRef.current + 1;
      setCompleteRefusal(null);
      setCompletionReview(result.routedForReview.length || result.reviewNotRaised.length
        ? { routedForReview: result.routedForReview, reviewNotRaised: result.reviewNotRaised } : null);
      setCaseData(prev => (prev ? ({ ...prev, status: 'gross-complete' } as typeof prev) : prev));
    } catch (e) {
      if (!handleConcurrencyConflict(e, setConcurrencyConflict)) setCompleteRefusal('failed');
    } finally {
      completingRef.current = false;
    }
  }, [caseData, grossingRequirements, knownVersionRef, signingUser, setCaseData, setConcurrencyConflict]);

  const handleCompleteGrossing = useCallback(() => runCompleteGrossing(false), [runCompleteGrossing]);
  const confirmCompleteWithoutProtocol = useCallback(async () => {
    setPendingProtocolConfirmation(null);
    await runCompleteGrossing(true);
  }, [runCompleteGrossing]);
  const cancelCompleteWithoutProtocol = useCallback(() => setPendingProtocolConfirmation(null), []);

  return {
    handleAddBlock, handleRemoveBlock, handleAddStain, handleRemoveStain,
    pendingStainRemoval, confirmPendingStainRemoval, cancelPendingStainRemoval,
    handleUpdatePieceCount, handleRecordFixationEnded, handleConfirmFixativeRatio,
    handleRaiseFixationDeficiency, specimensWithOpenFixationDeficiency,
    missingItems, handleCompleteGrossing, completeRefusal,
    secondaryReviewSpecimens, pendingProtocolConfirmation, confirmCompleteWithoutProtocol, cancelCompleteWithoutProtocol,
    completionReview,
  };
}
