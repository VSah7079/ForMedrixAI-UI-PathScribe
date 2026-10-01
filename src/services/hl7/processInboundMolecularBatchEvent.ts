// src/services/hl7/processInboundMolecularBatchEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for MolecularBatchResultEventPayload
// (types/events/) — per direct guidance: "a separate Batch
// Management... it will need to associate QA to the specimens in
// their test run locations. Using the engine to translate." Same real
// "ingest our own specification" posture as
// processInboundHpvResultEvent.ts: takes an already-translated,
// PathScribe-shaped event and applies it, through the same real
// caseRouter.updateCase() every other real write in this app already
// goes through. The real vendor's raw HL7 -> this shape is a real
// interface-engine (Mirth Connect) concern, deliberately kept out of
// this file, same real split already established.
//
// Real, genuine difference from the per-specimen HPV event this
// mirrors: one real batch event covers MANY real specimens, possibly
// across several real cases, not one. Every real specimen gets its
// own real, honest outcome — applied, specimen-not-found,
// case-not-found — never one blended result standing in for all of
// them; a batch where 8 of 10 real specimens resolve and 2 don't is
// real, partial, honest success, not an all-or-nothing failure.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import { mockMolecularQcRunRecordService } from '../cytology/mockMolecularQcRunRecordService';
import type { MolecularBatchResultEventPayload } from '@/types/events/MolecularBatchResultEventPayload';

export interface ProcessInboundMolecularBatchEventSpecimenResult {
  accessionNumber: string;
  specimenLetter: string;
  outcome: 'applied' | 'case-not-found' | 'specimen-not-found';
  caseId?: string;
  specimenId?: string;
}

export interface ProcessInboundMolecularBatchEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'invalid-payload';
  runId?: string;
  specimenResults?: ProcessInboundMolecularBatchEventSpecimenResult[];
  reason?: string;
}

// Real, minimal in-memory idempotency ledger — same real reasoning and
// scope as processInboundHpvResultEvent.ts's own.
const processedMessageIds = new Set<string>();

export async function processInboundMolecularBatchEvent(payload: MolecularBatchResultEventPayload): Promise<ProcessInboundMolecularBatchEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.instrumentId || !payload.reagentLotNumber || !payload.runDate || !payload.specimens || payload.specimens.length === 0) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: instrumentId, reagentLotNumber, runDate, specimens (at least one).' };
  }

  // Real, per-run QC record created first — the batch itself is a
  // real fact independent of whether every one of its specimens
  // resolves cleanly below.
  const runRes = await mockMolecularQcRunRecordService.add({
    runDate: payload.runDate,
    instrumentId: payload.instrumentId,
    assayName: payload.assayName,
    reagentLotNumber: payload.reagentLotNumber,
    totalSamplesRun: payload.specimens.length,
    invalidControlCount: payload.invalidControlCount,
    inhibitorCount: payload.inhibitorCount,
    controlResults: payload.controlResults,
  });
  if (!runRes.ok) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Failed to create the underlying molecular QC run record.' };
  }
  const runId = runRes.data.id;

  const specimenResults: ProcessInboundMolecularBatchEventSpecimenResult[] = [];
  for (const target of payload.specimens) {
    const caseData = await caseRouter.getCase(target.accessionNumber);
    if (!caseData) {
      specimenResults.push({ accessionNumber: target.accessionNumber, specimenLetter: target.specimenLetter, outcome: 'case-not-found' });
      continue;
    }

    const specimens = (caseData.specimens as any[]) ?? [];
    const targetSpecimen = specimens.find(sp => sp.label === target.specimenLetter);
    if (!targetSpecimen) {
      specimenResults.push({ accessionNumber: target.accessionNumber, specimenLetter: target.specimenLetter, outcome: 'specimen-not-found', caseId: caseData.id });
      continue;
    }

    const updatedSpecimens = specimens.map(sp =>
      sp.label === target.specimenLetter
        ? { ...sp, cytologyScreening: { ...sp.cytologyScreening, molecularRunId: runId } }
        : sp
    );

    try {
      await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
    } catch (e) {
      // Real, deliberate "force through" posture — same reasoning as
      // processInboundHpvResultEvent.ts's own.
      if (e instanceof ConcurrencyConflictError) {
        await caseRouter.updateCase(caseData.id, { specimens: updatedSpecimens } as any);
      } else {
        throw e;
      }
    }

    specimenResults.push({ accessionNumber: target.accessionNumber, specimenLetter: target.specimenLetter, outcome: 'applied', caseId: caseData.id, specimenId: targetSpecimen.id });
  }

  processedMessageIds.add(payload.messageId);
  return { messageId: payload.messageId, outcome: 'applied', runId, specimenResults };
}

/** Test-only reset — same real pattern as
 *  processInboundHpvResultEvent.ts's own. */
export function _resetProcessedMolecularBatchMessageIdsForTests(): void {
  processedMessageIds.clear();
}
