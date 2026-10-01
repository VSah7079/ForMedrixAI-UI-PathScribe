// src/types/events/ReferralManifestEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap ("review the Batch operations as
// this is the logical place to host this functionality"). Same real
// "PathScribe builds structured JSON; the real interface engine
// handles actual delivery to the reference lab" split already proven
// throughout this app — this file assembles the real, structured
// content; it does not itself speak any reference lab's own intake
// format.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferralManifestItem {
  displayId: string;
  materialType: string;
  caseAccession: string;
  specimenLabel?: string;
}

export interface ReferralManifestEventPayload {
  messageId: string;
  timestamp: string;
  /** The real, existing Batch.id this manifest was built from — never
   *  a second, parallel referral-specific id. */
  batchId: string;
  masterBarcode: string;
  destinationFacilityId: string;
  testRequested?: string;
  priority: 'STAT' | 'Routine';
  items: ReferralManifestItem[];
}
