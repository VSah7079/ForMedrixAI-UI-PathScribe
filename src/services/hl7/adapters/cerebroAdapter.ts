// src/services/hl7/adapters/cerebroAdapter.ts
// ─────────────────────────────────────────────────────────────
// Deliberately NOT implemented. Real, valuable, directional context now
// exists — Cerebro runs on MS SQL Server, integrations typically route
// through Mirth Connect (NextGen Connect) or a Java/IIS interface broker,
// messaging is HL7 v2.x over MLLP (or direct SQL/web-service triggers),
// and the real, named message shape is documented: inbound ADT/ORM/OML
// to initiate tracking and sync master data (specimen codes, block
// generation, stain orders), outbound ORU for real-time workflow status
// (Accessioning -> Grossing -> Processing -> Embedding -> Microtomy/
// Sectioning -> Staining -> Slide Archival) and chain-of-custody audit
// trails (timestamps, operator IDs, station locations, scan
// verifications). CEREBRO-ID/CEREBRO-ID+ drives cassette/slide printing
// natively on real, named hardware (Leica IP C/IP S, HistoCore
// LIGHTNING, Cognitive Cxi) — real reason to believe PathScribe doesn't
// need its own ZPL/thermal-printer pipeline for cassette/slide labels
// if Cerebro is the confirmed target; sending the right order data here
// is likely the actual job.
//
// But this is still a workflow-level summary, not a field-verified HL7
// integration guide — no real, exact segment/field layouts (which OBR/
// ORC/PID fields, what coding system for stain/specimen codes, exact
// OML vs ORM usage for master data sync). Same real discipline as
// vantageAdapter.ts: this stub keeps the adapter seam ready — the
// moment a genuine Cerebro integration guide exists, the actual
// transformation logic goes here, informed by real, verified
// field-level detail instead of building toward a guess. Until then,
// this throws rather than silently producing a message that looks
// right but might not be.
// ─────────────────────────────────────────────────────────────

import type { IHL7VendorAdapter } from './IHL7VendorAdapter';

export const cerebroAdapter: IHL7VendorAdapter = {
  name: 'CEREBRO (specimen identification, tracking, and chain-of-custody) — NOT YET IMPLEMENTED',
  adapt(_standardMessage, context) {
    throw new Error(
      `cerebroAdapter is a stub — real, directional workflow context exists (HL7 v2.x over MLLP, ` +
      `typically via Mirth Connect; inbound ADT/ORM/OML, outbound ORU for workflow status and ` +
      `chain-of-custody), but no field-verified integration guide (exact OBR/ORC/PID segment ` +
      `usage, coding systems) exists yet ` +
      `(case ${context.caseId}, specimen ${context.specimenLabel}, block ${context.blockLabel}). ` +
      `Use identityAdapter until a real Cerebro integration guide is available.`
    );
  },
};
