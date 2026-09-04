// src/types/events/HpvResultEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING a real
// molecular platform's own hrHPV result — the direct inbound mirror of
// BlockExceptionEventPayload.ts's own, already-established philosophy:
// "PathScribe publishes/ingests its own specification; the real
// interface engine (Mirth Connect, per cerebroAdapter.ts's own
// documented path) owns translating a vendor's raw HL7 ORU message
// into this shape." Real, per direct correction: "for the molecular
// platform they would be sending results through your engine which
// would transform that into a json payload... no one is resulting an
// HPV in the application. Also they would be sending ref ranges and
// abnormal flags." This file is exactly that specification.
//
// Field values use real id shapes from this codebase (accessionNumber,
// specimenLetter), matching ModeAOrderPayload.ts's/BlockExceptionEventPayload.ts's
// own established convention, not placeholders.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, standard HL7 v2 OBX-8 Abnormal Flags (table HL70078),
 *  narrowed to the real values a qualitative hrHPV result actually
 *  uses — 'A' for a real Positive result, 'N' for Negative. */
export type HpvAbnormalFlag = 'A' | 'N';

export interface HpvResultEventPayload {
  // 1. Transaction traceability — same real fields/reasoning as
  // BlockExceptionEventPayload's own messageId/timestamp: a redelivered
  // event with the same messageId is a real no-op, never a duplicate write.
  messageId: string;                // UUID v4, idempotency/tracing
  timestamp: string;                 // ISO-8601 UTC — when the molecular platform's own interface sent this

  // 2. Tenant & physical location hierarchy — identical shape to
  // BlockExceptionEventPayload's own fields.
  organisationId: string;
  siteId?: string;

  // 3. Canonical domain keys — same real id shapes as
  // BlockExceptionEventPayload: internalCaseId is the preferred lookup
  // when the sending system has it; accessionNumber is the required
  // fallback for a molecular platform that only knows the printed/
  // scanned accession.
  internalCaseId?: string;          // Case.id — preferred lookup key when the sending system has it
  accessionNumber: string;          // Case.accession.fullAccession — required fallback lookup key
  specimenLetter: string;           // 'A', 'B', 'C' — Specimen.label

  // 4. The actual real molecular result being reported.
  hrHpvResult: 'Positive' | 'Negative' | 'Invalid';
  /** Real, per direct correction: the real molecular platform's own
   *  standard HL7 OBX-8 abnormal flag, as its interface actually
   *  sends it — not derived/guessed here from hrHpvResult, since a
   *  real sending system's own flag is the authoritative source, and
   *  the two are validated against each other on ingest (see
   *  processInboundHpvResultEvent.ts). */
  abnormalFlag?: HpvAbnormalFlag;
  /** Real, standard HL7 OBX-7 reference range text, exactly as the
   *  real assay's own interface reports it (e.g. "Not Detected" for a
   *  qualitative hrHPV assay). Free text — never PathScribe's own
   *  interpretation of what the range "should" be. */
  referenceRange?: string;
  /** Real, standard co-testing assay genotype reporting — only
   *  meaningful when hrHpvResult is genuinely 'Positive'. Same real
   *  shape as Specimen.cytologyScreening.hpvGenotypeDetail (PS-172). */
  genotypeDetail?: { hpv16: boolean; hpv18Or45: boolean; otherHighRisk: boolean };
  /** Real, per direct guidance's own South Korea information: the real
   *  clinical reason this test was ordered — distinct from the result
   *  itself. Optional; a sending system that only reports the result
   *  is not itself invalid. */
  orderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance';
}
