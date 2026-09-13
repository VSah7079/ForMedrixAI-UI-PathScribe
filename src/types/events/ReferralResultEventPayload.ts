// src/types/events/ReferralResultEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap, Acceptance-Criteria-style ask:
// "Inbound result parsing, pdf attachment mapping, or discrete data
// ingestion from external reference laboratories." Two real, distinct
// real modes, per that same wording — never forced into one shape.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferralResultEventPayload {
  messageId: string;
  timestamp: string;
  /** The real, existing Batch.id this result is FOR — never a second,
   *  parallel referral-result id scheme. */
  batchId: string;
  resultType: 'discrete' | 'pdf_attachment';
  /** Required when resultType === 'discrete'; must be undefined when
   *  'pdf_attachment' — real, structured or free-text result content
   *  the reference lab sent as data, not a document. */
  discreteResult?: string;
  /** Required when resultType === 'pdf_attachment'; must be undefined
   *  when 'discrete' — a real reference to a stored PDF, never the
   *  raw bytes themselves in this event. */
  pdfAttachmentUrl?: string;
}
