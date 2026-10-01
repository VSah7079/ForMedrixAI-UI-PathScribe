// src/services/molecular/resolveMolecularHistoricalTrace.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §5.3 "Historical
// Traceability": "Full ability to audit backwards from a patient
// result to determine the exact plate UUID, deck location, instrument
// ID, user ID, and reagent lot numbers used."
//
// Real, deliberate design: a real, pure lookup over the batches this
// app already has in memory (mockMolecularBatchService.getAll()) —
// no new storage, no duplicated index. A patient result's own real
// specimenUuid/accessionNumber already lives on the well that carries
// it (Phase 1/2); every other real field this section asks for
// already lives on that well's own parent batch. Tracing backwards is
// genuinely just finding the right well and reading what's already
// there — real traceability was mostly already possible once Phase 1
// through 7 existed; this file is what makes it a real, one-call
// lookup instead of manual cross-referencing.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularBatch, MolecularMovementRecord, MolecularReagentLot } from './IMolecularBatchService';
import type { MolecularWellResult } from '@/types/events/MolecularRunResultsPayload';

export interface MolecularHistoricalTraceQuery {
  specimenUuid?: string;
  accessionNumber?: string;
}

export interface MolecularHistoricalTrace {
  batchId: string;
  batchBarcode: string;
  plateUuid: string;
  plateBarcode: string;
  deckSlot?: string;
  targetInstrumentId: string;
  reagentLots: MolecularReagentLot[];
  createdByUserId: string;
  createdByUserName: string;
  wellPosition: string;
  movementHistory: MolecularMovementRecord[];
  result?: MolecularWellResult;
}

/**
 * Real, per this file's own header — given a real specimen identifier
 * (either the specimenUuid or the accessionNumber, whichever the real
 * caller has on hand), searches every real batch for the matching
 * well and assembles the full real trace. Returns null on a real,
 * honest "not found" — never a partial or fabricated trace.
 */
export function resolveMolecularHistoricalTrace(
  batches: MolecularBatch[],
  query: MolecularHistoricalTraceQuery,
): MolecularHistoricalTrace | null {
  for (const batch of batches) {
    const well = batch.wells.find(w =>
      (query.specimenUuid && w.specimenUuid === query.specimenUuid) ||
      (query.accessionNumber && w.accessionNumber === query.accessionNumber),
    );
    if (!well) continue;

    const result = batch.results?.find(r => r.well_position === well.wellPosition);

    return {
      batchId: batch.id,
      batchBarcode: batch.batchBarcode,
      plateUuid: batch.plateUuid,
      plateBarcode: batch.plateBarcode,
      deckSlot: batch.deckSlot,
      targetInstrumentId: batch.targetInstrumentId,
      reagentLots: batch.reagentLots,
      createdByUserId: batch.createdByUserId,
      createdByUserName: batch.createdByUserName,
      wellPosition: well.wellPosition,
      movementHistory: well.movementHistory ?? [],
      result,
    };
  }
  return null;
}
