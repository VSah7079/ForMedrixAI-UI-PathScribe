// src/types/events/BlockExceptionEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING block exception
// status (Lost/Damaged) from local lab middleware — the direct inbound
// mirror of ModeAOrderPayload.ts's own, already-established outbound
// philosophy: "PathScribe publishes what happened in its own system;
// local lab middleware (Vantage, Cerebro, Mirth, Cloverleaf) owns the
// physical print. Nothing vendor-specific lives in this file."
//
// Real, deliberate design choice, per direct follow-up: "can we just
// ingest our own specification (best practice) then let the engine
// handle the translation?" This file is exactly that specification —
// fully definable and buildable today, independent of ever having
// Cerebro or Vantage's own field-level HL7 guide. The actual
// translation from a vendor's real ORU message into THIS shape is a
// real interface-engine (Mirth Connect, per cerebroAdapter.ts's own
// documented integration path) or thin-adapter concern, kept entirely
// outside this file on purpose — same real split
// services/hl7/adapters/ already established for the outbound side.
//
// Field values use real id shapes from this codebase, matching
// ModeAOrderPayload.ts's own established convention, not placeholders.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches the real, existing BlockStatus values this event is allowed
 *  to set — deliberately narrower than the full BlockStatus union
 *  (Specimen.ts). An inbound middleware event reporting a physical
 *  exception should only ever be able to say "this block is now Lost"
 *  or "now Damaged" — it has no business setting a block to Pending,
 *  Grossed, Embedded, Exhausted, or Cancelled, all of which are real,
 *  PathScribe-side workflow states with their own, separate triggers. */
export type BlockExceptionStatus = 'Lost' | 'Damaged';

export interface BlockExceptionEventPayload {
  // 1. Transaction traceability — same real fields/reasoning as
  // ModeAOrderPayload's own messageId/timestamp, so an inbound event
  // gets the identical idempotency/tracing guarantees an outbound one
  // already has.
  messageId: string;               // UUID v4, idempotency/tracing — a redelivered event with the same messageId is a no-op, not a duplicate update
  timestamp: string;                // ISO-8601 UTC — when the middleware sent this, not necessarily when reportedAt happened at the bench

  // 2. Tenant & physical location hierarchy — identical shape to
  // ModeAOrderPayload's own fields, for the same real reason: siteId
  // is what actually distinguishes two physical facilities under one
  // organisationId when routing/validating an inbound event.
  organisationId: string;           // e.g. 'ORG-MFT' — Organisation.id
  siteId?: string;                  // e.g. 'SITE-MRI' — Site.id from Organisation.sites[]

  // 3. Canonical domain keys — same real id shapes as
  // ModeAOrderPayload (internalCaseId is the stable system PK, never
  // mask-driven; accessionNumber is the human-facing fallback for a
  // middleware that only knows the printed/scanned accession, not
  // PathScribe's own internal Case.id).
  internalCaseId?: string;          // Case.id, e.g. 'O26-0029' — preferred lookup key when the sending system has it
  accessionNumber: string;          // Case.accession.fullAccession, e.g. 'MFT26-0029' — required fallback lookup key
  specimenLetter: string;           // 'A', 'B', 'C' — Specimen.label
  blockNumber: string;              // HistologyBlock.label

  // 4. The actual exception being reported
  status: BlockExceptionStatus;
  /** Free text — the real QC incident number, the re-embed reason,
   *  whatever the reporting system or user actually typed. Maps
   *  directly onto HistologyBlock.exceptionNote — same field a
   *  PathScribe user's own manual entry (BlockStainEditorModal.tsx)
   *  writes to, so an inbound event and a manual one are visually and
   *  structurally indistinguishable once applied. */
  note?: string;
  /** When the exception was actually identified at the bench —
   *  distinct from `timestamp` (when the message was sent). Falls
   *  back to `timestamp` if the sending system doesn't track this
   *  separately. */
  reportedAt?: string;
  /** Free text — operator/station id from the sending system, kept
   *  entirely separate from PathScribe's own user accounts. Not
   *  stored on HistologyBlock today (no field for it) — logged for
   *  traceability only; real follow-up work if audit-level tracking
   *  of the reporting station is ever needed. */
  reportedBy?: string;
  /** Real, honest provenance — every real HistologyBlock exception
   *  today either comes from this event or from a direct PathScribe
   *  UI edit; this field is how a later reader (audit log, support
   *  ticket) can tell which one happened without guessing. */
  sourceSystem: 'CEREBRO' | 'VANTAGE' | 'OTHER';
}
