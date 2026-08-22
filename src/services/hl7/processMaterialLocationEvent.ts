// src/services/hl7/processMaterialLocationEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for MaterialLocationEventPayload
// (types/events/MaterialLocationEventPayload.ts) — the direct sibling
// of processBlockExceptionEvent.ts, built per direct follow-up: "Is
// there any reason to block Material location and tracking on PS-49?
// I thought we would just let the engine handle the particular
// translation." Confirmed there wasn't — same real pattern, same real
// write path (caseRouter.updateCase()), same deliberate absence of
// any actual vendor HL7 parsing (that's still real interface-engine/
// thin-adapter territory once a field-verified vendor guide exists —
// PS-49 remains the track for that, and for the still-open unique-ID
// question, not a gate on this file existing).
//
// Same real, honest posture as processBlockExceptionEvent.ts:
// idempotent on messageId, every outcome is a distinct, honest
// result, and a concurrency conflict is forced through rather than
// discarded (the real, physical location this event describes already
// happened regardless of a local version conflict).
//
// Real rebuild, per direct follow-up with a concrete, detailed
// hierarchy/scan-log mockup in hand: every target level now APPENDS
// to a real locationHistory[] array instead of overwriting a single
// lastKnownLocation cache (see Material.ts's own MaterialLocation doc
// comment for the full reasoning), and a new 'aliquot'/'decant_aliquot'
// target level exists for molecular/genetic material derived from a
// slide — genuinely new, not modeled anywhere in this app before.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import { mockAuditService } from '../auditlog/mockAuditService';
import type { Specimen, StainOrder } from '@/types/case/Specimen';
import type { MaterialLocation, Aliquot } from '@/types/case/Material';
import type { MaterialLocationEventPayload } from '@/types/events/MaterialLocationEventPayload';
export interface ProcessMaterialLocationEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'case-not-found' | 'target-not-found' | 'invalid-payload';
  caseId?: string;
  /** Human-readable description of exactly what was updated, e.g.
   *  "A1-L2" or "Specimen A" — set only when outcome === 'applied'. */
  targetDescription?: string;
  reason?: string;
}

// Same real, minimal in-memory idempotency ledger as
// processBlockExceptionEvent.ts — see that file's own comment for the
// full reasoning.
const processedMessageIds = new Set<string>();

function appendHistory(existing: MaterialLocation[] | undefined, entry: MaterialLocation): MaterialLocation[] {
  return [...(existing ?? []), entry];
}

/** Real, deliberate default when a real aliquot doesn't exist yet on
 *  its parent slide — an inbound event about a real, physical aliquot
 *  is itself the first confirmation that material genuinely exists,
 *  so this creates the record rather than rejecting the event as
 *  target-not-found the way every other level does (a block/slide/
 *  decant is expected to already exist from a real creation flow;
 *  an aliquot commonly doesn't, since none exists in this app yet —
 *  same honest gap Decant's own doc comment already flags). */
function findOrCreateAliquot(stain: StainOrder, aliquotLabel: string, sourceSystem: string): { aliquot: Aliquot; isNew: boolean } {
  const existing = (stain.aliquots ?? []).find(a => a.label === aliquotLabel);
  if (existing) return { aliquot: existing, isNew: false };
  return {
    aliquot: {
      id: `aliquot-${stain.id}-${aliquotLabel}-${Date.now()}`,
      label: aliquotLabel,
      aliquotType: 'Unspecified', // real, honest placeholder — the sending system's own creation event should supply this in a real integration; refined by a later event if provided
      createdAt: new Date().toISOString(),
      createdBy: sourceSystem,
    },
    isNew: true,
  };
}

export async function processMaterialLocationEvent(payload: MaterialLocationEventPayload): Promise<ProcessMaterialLocationEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.accessionNumber || !payload.location || !payload.target) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: accessionNumber, location, target.' };
  }
  // Real, architectural fix, per direct follow-up: specimenLetter is
  // only required for target levels that genuinely belong to one
  // specimen — neither matrix_block nor matrix_slide has such a
  // specimen (see MaterialLocationEventPayload.specimenLetter's own
  // doc comment). Real bug caught via live testing: this check
  // originally only exempted 'matrix_block', silently rejecting every
  // real matrix_slide event as invalid-payload — the resolution side
  // (resolveMaterialFromScan.ts) correctly never returns a
  // specimenLetter for either real, case-level target, but this
  // validation hadn't caught up when matrix_slide was added.
  if (payload.target.level !== 'matrix_block' && payload.target.level !== 'matrix_slide' && !payload.specimenLetter) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing required field: specimenLetter.' };
  }

  const lookupId = payload.internalCaseId ?? payload.accessionNumber;
  const caseData = await caseRouter.getCase(lookupId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${lookupId}'.` };
  }

  const newEntry: MaterialLocation = {
    location: payload.location,
    workflowStage: payload.workflowStage,
    action: payload.action,
    at: payload.observedAt ?? payload.timestamp,
    source: payload.sourceSystem,
    performedByName: payload.performedByName,
  };

  // Real, architectural fix, per direct follow-up: "the matrix block
  // itself is the tracked asset." Handled entirely at the case level,
  // before any specimen lookup — a real matrix block genuinely
  // doesn't belong to one specimen, so there's no specimen to find
  // here at all. One, single, real record updated — no propagation
  // to consider, since there's nothing else to keep in sync.
  if (payload.target.level === 'matrix_block') {
    const matrixBlockId = payload.target.matrixBlockId;
    const matrixBlocks = caseData.matrixBlocks ?? [];
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) {
      return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Case ${caseData.id} has no matrix block ${matrixBlockId}.` };
    }
    const targetDescription = matrixBlock.label;
    const updatedMatrixBlocks = matrixBlocks.map(m => m.id !== matrixBlockId ? m : { ...m, locationHistory: appendHistory(m.locationHistory, newEntry) });
    try {
      await caseRouter.updateCase(caseData.id, { matrixBlocks: updatedMatrixBlocks });
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        await caseRouter.updateCase(caseData.id, { matrixBlocks: updatedMatrixBlocks });
      } else {
        throw e;
      }
    }
    processedMessageIds.add(payload.messageId);
    mockAuditService.logEvent({
      type: 'system',
      event: 'Material Location Update',
      detail: `${targetDescription} now at "${payload.location}"${payload.action ? ` — ${payload.action}` : ''}${payload.workflowStage ? ` (${payload.workflowStage})` : ''}`,
      user: payload.performedByName ?? payload.sourceSystem,
      caseId: caseData.id,
      confidence: null,
    }).catch(() => {});
    return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, targetDescription };
  }

  // Real feature, per direct follow-up: "Would this approach work?
  // {BlockBarcode}-S{Index}." Same real, case-level addressing as
  // matrix_block above (no specimen involved), one level deeper —
  // updates the one, real matching slide within the matrix block's
  // own slides[] array.
  if (payload.target.level === 'matrix_slide') {
    const matrixBlockId = payload.target.matrixBlockId;
    const matrixBlocks = caseData.matrixBlocks ?? [];
    const matrixBlock = matrixBlocks.find(m => m.id === matrixBlockId);
    if (!matrixBlock) {
      return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Case ${caseData.id} has no matrix block ${matrixBlockId}.` };
    }
    const slideIndex = Number(payload.target.slideLevel.replace(/^L/i, '')) - 1;
    const slide = (matrixBlock.slides ?? [])[slideIndex];
    if (!slide) {
      return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Matrix block ${matrixBlock.label} has no slide ${payload.target.slideLevel}.` };
    }
    const targetDescription = `${matrixBlock.label}-${payload.target.slideLevel}`;
    const updatedMatrixBlocks = matrixBlocks.map(m => m.id !== matrixBlockId ? m : {
      ...m,
      slides: (m.slides ?? []).map((s, i) => i !== slideIndex ? s : { ...s, locationHistory: appendHistory(s.locationHistory, newEntry) }),
    });
    try {
      await caseRouter.updateCase(caseData.id, { matrixBlocks: updatedMatrixBlocks });
    } catch (e) {
      if (e instanceof ConcurrencyConflictError) {
        await caseRouter.updateCase(caseData.id, { matrixBlocks: updatedMatrixBlocks });
      } else {
        throw e;
      }
    }
    processedMessageIds.add(payload.messageId);
    mockAuditService.logEvent({
      type: 'system',
      event: 'Material Location Update',
      detail: `${targetDescription} now at "${payload.location}"${payload.action ? ` — ${payload.action}` : ''}${payload.workflowStage ? ` (${payload.workflowStage})` : ''}`,
      user: payload.performedByName ?? payload.sourceSystem,
      caseId: caseData.id,
      confidence: null,
    }).catch(() => {});
    return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, targetDescription };
  }

  const specimen = (caseData.specimens ?? []).find(sp => sp.label === payload.specimenLetter);
  if (!specimen) {
    return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Case ${caseData.id} has no specimen ${payload.specimenLetter}.` };
  }

  const target = payload.target;
  let targetDescription: string;
  let updatedSpecimen: Specimen;

  if (target.level === 'specimen') {
    targetDescription = `Specimen ${specimen.label}`;
    updatedSpecimen = { ...specimen, locationHistory: appendHistory(specimen.locationHistory, newEntry) };
  } else if (target.level === 'block') {
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    targetDescription = `${specimen.label}${target.blockNumber}`;
    updatedSpecimen = { ...specimen, blocks: (specimen.blocks ?? []).map(b => b.id !== block.id ? b : { ...b, locationHistory: appendHistory(b.locationHistory, newEntry) }) };
  } else if (target.level === 'slide') {
    const block = (specimen.blocks ?? []).find(b => b.label === target.blockNumber);
    if (!block) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (block.stains ?? [])[slideIndex];
    if (!stain) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Block ${specimen.label}${target.blockNumber} has no slide ${target.slideLevel}.` };
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
    if (!block) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no block ${target.blockNumber}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (block.stains ?? [])[slideIndex];
    if (!stain) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Block ${specimen.label}${target.blockNumber} has no slide ${target.slideLevel}.` };
    const { aliquot, isNew } = findOrCreateAliquot(stain, target.aliquotLabel, payload.sourceSystem);
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
    if (!decant) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    targetDescription = `${specimen.label}${target.decantLabel}`;
    updatedSpecimen = { ...specimen, decants: (specimen.decants ?? []).map(d => d.id !== decant.id ? d : { ...d, locationHistory: appendHistory(d.locationHistory, newEntry) }) };
  } else if (target.level === 'decant_slide') {
    const decant = (specimen.decants ?? []).find(d => d.label === target.decantLabel);
    if (!decant) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (decant.stains ?? [])[slideIndex];
    if (!stain) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Decant ${specimen.label}${target.decantLabel} has no slide ${target.slideLevel}.` };
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
    if (!decant) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Specimen ${specimen.label} has no decant ${target.decantLabel}.` };
    const slideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
    const stain = (decant.stains ?? [])[slideIndex];
    if (!stain) return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Decant ${specimen.label}${target.decantLabel} has no slide ${target.slideLevel}.` };
    const { aliquot, isNew } = findOrCreateAliquot(stain, target.aliquotLabel, payload.sourceSystem);
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

  const updatedSpecimens = (caseData.specimens ?? []).map(sp => sp.id !== specimen.id ? sp : updatedSpecimen);

  try {
    await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
  } catch (e) {
    // Real, deliberate "force through" posture — same reasoning as
    // processBlockExceptionEvent.ts's own identical block.
    if (e instanceof ConcurrencyConflictError) {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens });
    } else {
      throw e;
    }
  }

  processedMessageIds.add(payload.messageId);

  // Real feature, per direct follow-up: "Are we storing just the last
  // entry, or all the entries?" Real fix, now storing every entry
  // (locationHistory[] above) — but this case-wide audit trail write
  // stays too, per the earlier direct decision to also surface these
  // as part of the existing, shared Audit Log. Same real, single
  // choke point every other audit trail in this app already funnels
  // through (mockAuditService.logEvent()).
  mockAuditService.logEvent({
    type: 'system',
    event: 'Material Location Update',
    detail: `${targetDescription} now at "${payload.location}"${payload.action ? ` — ${payload.action}` : ''}${payload.workflowStage ? ` (${payload.workflowStage})` : ''}`,
    user: payload.performedByName ?? payload.sourceSystem,
    caseId: caseData.id,
    confidence: null,
  }).catch(() => {});

  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, targetDescription };
}

/** Test-only reset — see processBlockExceptionEvent.ts's own
 *  identical helper for the full reasoning. */
export function _resetMaterialLocationMessageIdsForTests(): void {
  processedMessageIds.clear();
}
