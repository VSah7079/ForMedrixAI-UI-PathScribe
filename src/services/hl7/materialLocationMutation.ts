// src/services/hl7/materialLocationMutation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, extracted pure logic — same real reasoning as
// blockExceptionMutation.ts's own header: the exact, already-tested-
// in-production branching processMaterialLocationEvent.ts applied
// inline for all 8 real target levels, pulled out so it has zero
// dependency on HOW the result gets written (no caseRouter, no
// firebase-admin, no mockAuditService — pure data in, updated data
// out). Two, and only two, top-level fields can ever change: specimens
// (every target level except matrix_block/matrix_slide) or
// matrixBlocks (those two) — never both from one real event.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen, StainOrder } from '../../types/case/Specimen';
import type { MatrixBlock } from '../../types/case/MatrixBlock';
import type { MaterialLocation, Aliquot } from '../../types/case/Material';
import type { MaterialLocationEventPayload } from '../../types/events/MaterialLocationEventPayload';

export interface MaterialLocationMutationInput {
  specimenLetter?: string;
  target: MaterialLocationEventPayload['target'];
  location: string;
  workflowStage?: string;
  action?: string;
  observedAt?: string;
  timestamp: string;
  sourceSystem: string;
  performedByName?: string;
}

export type MaterialLocationMutationResult =
  | { level: 'matrix'; matrixBlocks: MatrixBlock[]; targetDescription: string }
  | { level: 'specimen'; specimens: Specimen[]; targetDescription: string };

export type MaterialLocationMutationOutcome =
  | { outcome: 'applied'; result: MaterialLocationMutationResult }
  | { outcome: 'target-not-found'; reason: string };

function appendHistory(existing: MaterialLocation[] | undefined, entry: MaterialLocation): MaterialLocation[] {
  return [...(existing ?? []), entry];
}

/** Real, deliberate default when a real aliquot doesn't exist yet on
 *  its parent slide — see processMaterialLocationEvent.ts's own,
 *  original doc comment on this exact function for the full reasoning
 *  (unchanged by this extraction). */
function findOrCreateAliquot(stain: StainOrder, aliquotLabel: string, sourceSystem: string): { aliquot: Aliquot; isNew: boolean } {
  const existing = (stain.aliquots ?? []).find(a => a.label === aliquotLabel);
  if (existing) return { aliquot: existing, isNew: false };
  return {
    aliquot: {
      id: `aliquot-${stain.id}-${aliquotLabel}-${Date.now()}`,
      label: aliquotLabel,
      aliquotType: 'Unspecified',
      createdAt: new Date().toISOString(),
      createdBy: sourceSystem,
    },
    isNew: true,
  };
}

/**
 * Applies a real material-location event to the given specimens/
 * matrixBlocks arrays, returning exactly which one changed. Mirrors
 * processMaterialLocationEvent.ts's own original, verbatim branching —
 * see that file's own header for the full history of each real target
 * level's own addition.
 */
export function applyMaterialLocation(
  specimens: Specimen[],
  matrixBlocks: MatrixBlock[],
  input: MaterialLocationMutationInput,
): MaterialLocationMutationOutcome {
  const newEntry: MaterialLocation = {
    location: input.location,
    workflowStage: input.workflowStage,
    action: input.action,
    at: input.observedAt ?? input.timestamp,
    source: input.sourceSystem,
    performedByName: input.performedByName,
  };

  if (input.target.level === 'matrix_block') {
    const matrixBlockId = input.target.matrixBlockId;
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) {
      return { outcome: 'target-not-found', reason: `No matrix block ${matrixBlockId}.` };
    }
    const updatedMatrixBlocks = matrixBlocks.map(m => m.id !== matrixBlockId ? m : { ...m, locationHistory: appendHistory(m.locationHistory, newEntry) });
    return { outcome: 'applied', result: { level: 'matrix', matrixBlocks: updatedMatrixBlocks, targetDescription: matrixBlock.label } };
  }

  if (input.target.level === 'matrix_slide') {
    const matrixBlockId = input.target.matrixBlockId;
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) {
      return { outcome: 'target-not-found', reason: `No matrix block ${matrixBlockId}.` };
    }
    const slideIndex = Number(input.target.slideLevel.replace(/^L/i, '')) - 1;
    const slide = (matrixBlock.slides ?? [])[slideIndex];
    if (!slide) {
      return { outcome: 'target-not-found', reason: `Matrix block ${matrixBlock.label} has no slide ${input.target.slideLevel}.` };
    }
    const targetDescription = `${matrixBlock.label}-${input.target.slideLevel}`;
    const updatedMatrixBlocks = matrixBlocks.map(m => m.id !== matrixBlockId ? m : {
      ...m,
      slides: (m.slides ?? []).map((s, i) => i !== slideIndex ? s : { ...s, locationHistory: appendHistory(s.locationHistory, newEntry) }),
    });
    return { outcome: 'applied', result: { level: 'matrix', matrixBlocks: updatedMatrixBlocks, targetDescription } };
  }

  const specimen = specimens.find(sp => sp.label === input.specimenLetter);
  if (!specimen) {
    return { outcome: 'target-not-found', reason: `No specimen ${input.specimenLetter}.` };
  }

  const target = input.target;
  let targetDescription: string;
  let updatedSpecimen: Specimen;

  if (target.level === 'specimen') {
    targetDescription = `Specimen ${specimen.label}`;
    updatedSpecimen = { ...specimen, locationHistory: appendHistory(specimen.locationHistory, newEntry) };
  } else if (target.level === 'block') {
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    targetDescription = `${specimen.label}${target.blockNumber}`;
    updatedSpecimen = { ...specimen, blocks: (specimen.blocks ?? []).map(b => b.id !== block.id ? b : { ...b, locationHistory: appendHistory(b.locationHistory, newEntry) }) };
  } else if (target.level === 'slide') {
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (block.stains ?? [])[slideIndex];
    if (!stain) return { outcome: 'target-not-found', reason: `Block ${specimen.label}${target.blockNumber} has no slide ${target.slideLevel}.` };
    targetDescription = `${specimen.label}${target.blockNumber}-${target.slideLevel}`;
    updatedSpecimen = {
      ...specimen,
      blocks: (specimen.blocks ?? []).map(b => b.id !== block.id ? b : {
        ...b,
        stains: (b.stains ?? []).map((s, i) => i !== slideIndex ? s : { ...s, locationHistory: appendHistory(s.locationHistory, newEntry) }),
      }),
    };
  } else if (target.level === 'aliquot') {
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (block.stains ?? [])[slideIndex];
    if (!stain) return { outcome: 'target-not-found', reason: `Block ${specimen.label}${target.blockNumber} has no slide ${target.slideLevel}.` };
    const { aliquot, isNew } = findOrCreateAliquot(stain, target.aliquotLabel, input.sourceSystem);
    targetDescription = `${specimen.label}${target.blockNumber}-${target.slideLevel}${target.aliquotLabel}`;
    const updatedAliquot: Aliquot = { ...aliquot, locationHistory: appendHistory(isNew ? undefined : aliquot.locationHistory, newEntry) };
    updatedSpecimen = {
      ...specimen,
      blocks: (specimen.blocks ?? []).map(b => b.id !== block.id ? b : {
        ...b,
        stains: (b.stains ?? []).map((s, i) => i !== slideIndex ? s : {
          ...s,
          aliquots: isNew ? [...(s.aliquots ?? []), updatedAliquot] : (s.aliquots ?? []).map(a => a.id === aliquot.id ? updatedAliquot : a),
        }),
      }),
    };
  } else if (target.level === 'decant') {
    const decant = (specimen.decants ?? []).find(d => d.label === target.decantLabel);
    if (!decant) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    targetDescription = `${specimen.label}${target.decantLabel}`;
    updatedSpecimen = { ...specimen, decants: (specimen.decants ?? []).map(d => d.id !== decant.id ? d : { ...d, locationHistory: appendHistory(d.locationHistory, newEntry) }) };
  } else if (target.level === 'decant_slide') {
    const decant = (specimen.decants ?? []).find(d => d.label === target.decantLabel);
    if (!decant) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (decant.stains ?? [])[slideIndex];
    if (!stain) return { outcome: 'target-not-found', reason: `Decant ${specimen.label}${target.decantLabel} has no slide ${target.slideLevel}.` };
    targetDescription = `${specimen.label}${target.decantLabel}-${target.slideLevel}`;
    updatedSpecimen = {
      ...specimen,
      decants: (specimen.decants ?? []).map(d => d.id !== decant.id ? d : {
        ...d,
        stains: (d.stains ?? []).map((s, i) => i !== slideIndex ? s : { ...s, locationHistory: appendHistory(s.locationHistory, newEntry) }),
      }),
    };
  } else {
    // target.level === 'decant_aliquot'
    const decant = (specimen.decants ?? []).find(d => d.label === target.decantLabel);
    if (!decant) return { outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (decant.stains ?? [])[slideIndex];
    if (!stain) return { outcome: 'target-not-found', reason: `Decant ${specimen.label}${target.decantLabel} has no slide ${target.slideLevel}.` };
    const { aliquot, isNew } = findOrCreateAliquot(stain, target.aliquotLabel, input.sourceSystem);
    targetDescription = `${specimen.label}${target.decantLabel}-${target.slideLevel}${target.aliquotLabel}`;
    const updatedAliquot: Aliquot = { ...aliquot, locationHistory: appendHistory(isNew ? undefined : aliquot.locationHistory, newEntry) };
    updatedSpecimen = {
      ...specimen,
      decants: (specimen.decants ?? []).map(d => d.id !== decant.id ? d : {
        ...d,
        stains: (d.stains ?? []).map((s, i) => i !== slideIndex ? s : {
          ...s,
          aliquots: isNew ? [...(s.aliquots ?? []), updatedAliquot] : (s.aliquots ?? []).map(a => a.id === aliquot.id ? updatedAliquot : a),
        }),
      }),
    };
  }

  const updatedSpecimens = specimens.map(sp => sp.id !== specimen.id ? sp : updatedSpecimen);
  return { outcome: 'applied', result: { level: 'specimen', specimens: updatedSpecimens, targetDescription } };
}
