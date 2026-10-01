// src/types/events/MolecularBatchResultEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "I want a separate Batch Management as it
// will need to associate QA to the specimens in their test run
// locations. Using the engine to translate." Same real "publish/ingest
// our own specification; the real interface engine (Mirth Connect)
// owns translating a vendor's raw HL7 message into this shape"
// philosophy HpvResultEventPayload.ts already establishes — this is
// the batch-level sibling of that per-specimen event: one real
// molecular platform run/batch, reporting every real specimen that
// ran in it together with the real, shared instrument/lot/control
// data for that run (MOL-QA-02/04's own MolecularQcRunRecord shape,
// IMolecularQcRunRecordService.ts).
//
// Real, deliberate design: a batch and a per-specimen HPV result are
// two real, separate events in practice (a molecular platform reports
// its own run-level QC once per batch, and each specimen's own result
// separately/subsequently) — this file does not fold hrHpvResult
// itself into the batch event; HpvResultEventPayload remains the real,
// single source for that. This event's own real job is establishing
// which specimens belong to which batch, and that batch's own real QC
// context — the association direct guidance asked for.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularControlLevel } from '@/services/cytology/IMolecularQcRunRecordService';

export interface MolecularBatchResultEventPayload {
  // 1. Transaction traceability — same real fields/reasoning as
  // HpvResultEventPayload's own messageId/timestamp: a redelivered
  // event with the same messageId is a real no-op, never a duplicate
  // write.
  messageId: string;                // UUID v4, idempotency/tracing
  timestamp: string;                 // ISO-8601 UTC — when the molecular platform's own interface sent this

  // 2. Tenant & physical location hierarchy — identical shape to
  // HpvResultEventPayload's own fields.
  organisationId: string;
  siteId?: string;

  // 3. The real batch/run itself.
  runDate: string;                   // ISO-8601 UTC — when this real run was performed
  instrumentId: string;
  assayName: string;
  reagentLotNumber: string;
  invalidControlCount: number;
  inhibitorCount: number;
  controlResults: { controlLevel: MolecularControlLevel; meanCt: number }[];

  // 4. Every real specimen included in this real batch/run — same real
  // id shapes as HpvResultEventPayload (accessionNumber + specimenLetter,
  // since a molecular platform that only knows the printed/scanned
  // accession is the real, common case, same reasoning as that file's
  // own header).
  specimens: { accessionNumber: string; specimenLetter: string }[];
}
