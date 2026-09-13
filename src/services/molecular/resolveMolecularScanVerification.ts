// src/services/molecular/resolveMolecularScanVerification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §3.4 "Scan-to-Verify
// Workflow": "Require forced barcode verification scanning of the
// Target Plate UUID and Instrument Deck Slot UUID before generating
// the outbound worklist payload."
//
// Real, deliberate design: a real physical scan is compared against
// the real, already-known-correct values on the batch itself
// (plateBarcode, and the deck location label derived from
// targetInstrumentId/deckSlot — resolveMolecularBarcodes.ts's own
// generateDeckLocationLabel) — never trusting that a tech scanned the
// right physical object just because they scanned SOMETHING. A
// mismatch is reported with which real check failed, not a single,
// undifferentiated "verification failed."
// ─────────────────────────────────────────────────────────────────────────────

import { generateDeckLocationLabel } from './resolveMolecularBarcodes';
import type { MolecularBatch } from './IMolecularBatchService';

export interface MolecularScanVerificationResult {
  plateVerified: boolean;
  deckLocationVerified: boolean;
  /** True only when both real, individual checks pass — the real
   *  precondition §3.4 requires before an outbound worklist payload
   *  may be generated at all. */
  fullyVerified: boolean;
}

export function resolveMolecularScanVerification(
  batch: Pick<MolecularBatch, 'plateBarcode' | 'targetInstrumentId' | 'deckSlot'>,
  scannedPlateBarcode: string | undefined,
  scannedDeckLocationLabel: string | undefined,
): MolecularScanVerificationResult {
  const plateVerified = !!scannedPlateBarcode && scannedPlateBarcode === batch.plateBarcode;

  const expectedDeckLocationLabel = batch.deckSlot ? generateDeckLocationLabel(batch.targetInstrumentId, batch.deckSlot) : undefined;
  const deckLocationVerified = !!scannedDeckLocationLabel && !!expectedDeckLocationLabel && scannedDeckLocationLabel === expectedDeckLocationLabel;

  return { plateVerified, deckLocationVerified, fullyVerified: plateVerified && deckLocationVerified };
}
