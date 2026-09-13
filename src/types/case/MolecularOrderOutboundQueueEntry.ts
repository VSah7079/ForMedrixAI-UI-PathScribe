// src/types/case/MolecularOrderOutboundQueueEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part 2b.
// Separate from AccessionOutboundQueueEntry.ts — a distinct real
// concern (ordering a molecular assay / notifying an instrument) from
// that queue's own (publishing accession/deficiency events to a
// clinical-history interface engine) — but follows its exact same
// established shape: QUEUED/SENT/FAILED status, retry/error tracking,
// same DISPATCH_* error codes. See services/molecularOrders/README.md
// for the three real triggers that enqueue onto this queue.
// ─────────────────────────────────────────────────────────────────────────────

import type { CasePriority } from '@/services/cases/ICaseService';

/** Real, per the story's own three-way accounting of why an assay was
 *  ordered: 'protocol_configured' — the accession trigger, reading
 *  PathwayTask.sendOutboundOrder for the specimen's assigned protocol.
 *  'hpv_reflex_genotyping' — the reflex trigger, firing st-hpv-
 *  genotyping automatically off a positive standalone st-hpv-
 *  highrisk-screen result (processInboundHpvResultEvent.ts). Real,
 *  closed set — not free text — since a real interface engine
 *  downstream needs to know which of these two real triggers fired,
 *  not just that an order exists. */
export type MolecularOrderReason = 'protocol_configured' | 'hpv_reflex_genotyping';

export interface MolecularOrderPayload {
  accessionNumber: string;
  specimenLetter: string;
  /** Real FK into the Stain Dictionary (StainType.id) — e.g.
   *  'st-hpv-highrisk-screen', 'st-hpv-genotyping'. Never a free-text
   *  assay name, same real reasoning as PathwayTask.stainTypeIds. */
  assayCode: string;
  orderReason: MolecularOrderReason;
  priority: CasePriority;
  /** Real, set only by the reflex trigger — traces this order back to
   *  the specific inbound HpvResultEventPayload.messageId that caused
   *  it, so a real interface engine (or a later audit) can follow the
   *  chain from original screen result to the genotyping order it
   *  triggered. Undefined for every 'protocol_configured' order —
   *  those were never triggered by an inbound result. */
  reflexFromMessageId?: string;
}

/** Real, per the story's own "processing order to Hologic at batch
 *  creation" — genuinely case/specimen-independent (the instrument
 *  doesn't run against one case, it runs a physical batch of vials),
 *  so this payload is deliberately scoped to the real Batch itself,
 *  not to a case/specimen the way MolecularOrderPayload above is. */
export interface InstrumentOrderPayload {
  /** Batch.masterBarcode (services/batches/IBatchService.ts) — the
   *  real, physical carrier this instrument order is for. */
  masterBarcode: string;
  /** Real, closed set of one today (Hologic ThinPrep) — kept as a
   *  literal union, not a bare string, so a second real instrument
   *  vendor added later is a real, deliberate type change, not a
   *  silent free-text drift. */
  instrumentVendor: 'Hologic';
}

export interface MolecularOrderOutboundQueueEntry {
  id: string;
  /** Undefined for an 'order.instrument' entry — see
   *  InstrumentOrderPayload's own doc comment for why that event has
   *  no real case to attach to. */
  caseId?: string;
  eventType: 'order.molecular' | 'order.instrument';
  payload: MolecularOrderPayload | InstrumentOrderPayload;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  errorCode?: 'DISPATCH_TIMEOUT' | 'DISPATCH_UNREACHABLE' | 'DISPATCH_REJECTED';
  errorMessage?: string;
  retryCount: number;
  maxRetriesExceeded: boolean;
  lastAttemptAt?: string;
}
