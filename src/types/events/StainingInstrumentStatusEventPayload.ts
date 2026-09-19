// src/types/events/StainingInstrumentStatusEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a real
// automated stainer's own run-status updates — mirrors
// CytologyInstrumentStatusEventPayload.ts's own, already-established
// philosophy exactly: "PathScribe publishes/ingests its own
// specification; the real interface engine owns translating a
// vendor's raw wire format into this shape."
//
// Real, per direct research on the Gating Strategy this feeds: an
// "External Pass-Through (Auto-Resolve)" enforcement mode reads this
// same real inbound channel to auto-clear a post-run gate on a
// successful 'Run Completed' status — built here first, honestly,
// before any gating logic itself exists to consume it, per direct
// decision to build this piece alone first.
//
// Same real, deliberate keying on masterBarcode, not accessionNumber,
// as CytologyInstrumentStatusEventPayload — a stainer run is a real,
// physical batch of many slides loaded together
// (services/batches/IBatchService.ts's own Batch concept), not a
// single case/specimen result.
// ─────────────────────────────────────────────────────────────────────────────

import type { StainingInstrumentStatus } from '@/services/batches/IBatchService';

export interface StainingInstrumentStatusEventPayload {
  messageId: string;      // UUID v4, idempotency/tracing
  timestamp: string;       // ISO-8601 UTC — when the instrument's own interface sent this
  masterBarcode: string;  // Batch.masterBarcode — the real, physical carrier this status applies to
  /** Real, deliberately excludes 'Loaded to Instrument' — that status
   *  is set by PathScribe itself, at the real moment a slide/rack is
   *  scanned into the batch (IBatchService.addItemByScan), never
   *  reported inbound by the instrument. Same real convention as
   *  CytologyInstrumentStatusEventPayload's own status field. */
  status: Exclude<StainingInstrumentStatus, 'Loaded to Instrument'>;
}
