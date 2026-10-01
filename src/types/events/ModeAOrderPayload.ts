// src/types/events/ModeAOrderPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for label/order dispatch — "Mode A":
// PathScribe publishes what happened in its own system; local lab middleware
// (Vantage, Cerebro, Mirth, Cloverleaf) owns the physical print. Nothing
// vendor-specific lives in this file — see services/hl7/adapters/ for where
// a receiving system's own quirks get applied, on top of an already-valid
// standard message, never baked in here. Same split ormBuilder.ts/
// segmentBuilders.ts already established for the existing HL7 core, extended
// to cover this event's field values too.
//
// Field values use real id shapes from this codebase, not placeholders:
//   - organisationId: 'ORG-MFT' (Organisation.id), not 'HOSP-MFT'
//   - siteId: 'SITE-MRI' (Site.id, from Organisation.sites[]), not 'MRI'
//   - departmentId: 'cat-surgical-tissue' (Department.id), not
//     an invented uppercase constant like 'SURGICAL'
// ─────────────────────────────────────────────────────────────────────────────

export type ModeAEventType = 'SLIDE_ORDER' | 'BLOCK_ORDER' | 'SPECIMEN_LABEL';

export interface ModeAOrderPayload {
  // 1. Transaction traceability
  messageId: string;                   // UUID v4, idempotency/tracing
  timestamp: string;                   // ISO-8601 UTC
  eventType: ModeAEventType;

  // 2. Tenant & physical location hierarchy — real id shapes, not
  // shortNames. siteId is what local hardware routing actually needs
  // (MRI and WYT are separate physical facilities under one
  // organisationId, ORG-MFT, and can have separate Vantage/Cerebro
  // instances — keying on organisationId alone can't distinguish them).
  organisationId: string;              // e.g. 'ORG-MFT' — Organisation.id
  siteId?: string;                     // e.g. 'SITE-MRI' — Site.id from Organisation.sites[]; optional since not every org has resolved multi-site routing needs
  labelFormattingGroup?: string;       // e.g. 'MFT_STANDARD_HISTOLOGY' — orgs/sites sharing this use identical local middleware templates without duplicating config in PathScribe

  // 3. Canonical domain keys
  internalCaseId: string;              // Stable system PK, e.g. 'O26-0029' — Case.id, NEVER mask-driven
  accessionNumber: string;             // Human-facing, e.g. 'MFT26-0029' — Case.accession.fullAccession
  specimenLetter: string;              // 'A', 'B', 'C' — Specimen.label
  blockNumber?: string;                // HistologyBlock.label — required for BLOCK_ORDER/SLIDE_ORDER
  slideNumber?: string;                // required for SLIDE_ORDER

  // 4. Clinical context — references the real Department record,
  // not an invented constant. See IDepartmentService.ts.
  departmentId: string;          // e.g. 'cat-surgical-tissue' — Department.id
  stainCode?: string;                  // e.g. 'HE', 'PAP' — required for BLOCK_ORDER/SLIDE_ORDER, not SPECIMEN_LABEL
  urgency: 'ROUTINE' | 'RUSH' | 'FROZEN_SECTION';
}
