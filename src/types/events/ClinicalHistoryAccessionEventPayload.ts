// src/types/events/ClinicalHistoryAccessionEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a validated
// accession order with its own structured clinical history array —
// per the uploaded "Structured Clinical History Dictionary &
// Accessioning Integration" spec's own User Story 2: "the external
// Interface Engine [parses] inbound EHR messages (HL7 OBR-13, OBX,
// FHIR) and transform[s] them into PathScribe's native JSON schema...
// so that PathScribe only consumes validated JSON payloads and
// remains decoupled from external EHR message formats." Same real
// "PathScribe publishes/ingests its own specification; the real
// interface engine (Mirth/Rhapsody/Cloverleaf) owns the actual HL7/
// FHIR parsing and crosswalk" split already proven for HPV results,
// molecular batch results, and PT results.
//
// Real, direct mapping to the spec's own given example JSON (User
// Story 2, Acceptance Criteria 2) — field names below translate the
// spec's own snake_case wire shape (order_id, history_code,
// category_code, unmapped_text_fallback) into this app's own
// camelCase convention 1:1, not a redesign.
// ─────────────────────────────────────────────────────────────────────────────

import type { RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

export interface ClinicalHistoryAccessionEventPayload {
  messageId: string;
  timestamp: string;
  orderId: string;
  clinicalHistory: RecordedClinicalHistoryEntry[];
}
