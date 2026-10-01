// src/types/events/CytologyInstrumentStatusEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a real
// ThinPrep processor's own run-status updates — the direct inbound
// mirror of HpvResultEventPayload.ts's own, already-established
// philosophy: "PathScribe publishes/ingests its own specification; the
// real interface engine owns translating a vendor's raw wire format
// into this shape." Per the Protocol-Driven Workflow Infrastructure
// story's Part 2a: "Instrument sends status events inbound ('In
// Process' -> 'Cell Transfer' -> 'Slide Prep Complete')."
//
// Real, deliberate keying on masterBarcode, not accessionNumber/
// specimenLetter the way HpvResultEventPayload is keyed: a ThinPrep
// processor run is a real, physical batch of many vials loaded
// together (services/batches/IBatchService.ts's own Batch concept),
// not a single case/specimen result — the instrument itself has no
// concept of "case," only of the physical carrier it's running.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyInstrumentStatus } from '@/services/batches/IBatchService';

export interface CytologyInstrumentStatusEventPayload {
  messageId: string;      // UUID v4, idempotency/tracing
  timestamp: string;       // ISO-8601 UTC — when the instrument's own interface sent this
  masterBarcode: string;  // Batch.masterBarcode — the real, physical carrier this status applies to
  /** Real, deliberately excludes 'Loaded to Instrument' — that status
   *  is set by PathScribe itself, at the real moment a vial is
   *  scanned into the batch (IBatchService.addItemByScan), never
   *  reported inbound by the instrument. */
  status: Exclude<CytologyInstrumentStatus, 'Loaded to Instrument'>;
}
