// src/types/events/MaterialLocationEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING material
// location/workflow-stage updates from local lab middleware — the
// direct sibling of BlockExceptionEventPayload.ts, same real reasoning:
// "PathScribe publishes what happened in its own system; local lab
// middleware owns [the vendor-specific part]" (ModeAOrderPayload.ts's
// own header comment). See services/hl7/processMaterialLocationEvent.ts
// for the real ingestion side.
//
// Real, deliberate design choice, per direct follow-up: "Is there any
// reason to block Material location and tracking on PS-49? I thought
// we would just let the engine handle the particular translation."
// Confirmed there wasn't — this is the exact same pattern already
// proven for BlockExceptionEventPayload, applied to a second, real
// event type. Fully definable and buildable today, independent of
// ever having a real vendor's field-level HL7/ORU guide — PS-49
// remains the real, separate track for validating this specification
// against actual vendor capabilities and for the still-open unique-ID
// question, not a prerequisite for building the PathScribe-side half.
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialLocationEventPayload {
  // 1. Transaction traceability — identical shape/reasoning to
  // BlockExceptionEventPayload's own fields.
  messageId: string;               // UUID v4, idempotency/tracing
  timestamp: string;                // ISO-8601 UTC — when the middleware sent this

  // 2. Tenant & physical location hierarchy — identical shape to
  // BlockExceptionEventPayload/ModeAOrderPayload.
  organisationId: string;           // e.g. 'ORG-MFT' — Organisation.id
  siteId?: string;                  // e.g. 'SITE-MRI' — Site.id from Organisation.sites[]

  // 3. Canonical domain keys — same real id shapes and same real
  // internalCaseId/accessionNumber fallback reasoning as
  // BlockExceptionEventPayload.
  internalCaseId?: string;          // Case.id, preferred lookup key when the sending system has it
  accessionNumber: string;          // Case.accession.fullAccession — required fallback lookup key
  /** 'A', 'B', 'C' — Specimen.label. Real, architectural fix, per
   *  direct follow-up: undefined exactly when target.level ===
   *  'matrix_block' — a real matrix block (types/case/MatrixBlock.ts)
   *  doesn't belong to one specimen, so there's no real, single
   *  specimen letter to report. Required for every other target
   *  level, exactly as before. */
  specimenLetter?: string;

  /**
   * Which real material item within the specimen this event is
   * about — deliberately a discriminated union rather than a single
   * generic "item id" string. A real event genuinely differs in what
   * it can address depending on the sending system and how far the
   * physical item has been processed (a specimen may be tracked
   * before any block exists yet); a flat, optional-everything shape
   * would let an ambiguous or self-contradictory event through
   * (block AND decant AND slide fields all set) with no way to catch
   * it at the type level. Exactly one of these applies per event.
   */
  target:
    | { level: 'specimen' }
    | { level: 'block'; blockNumber: string }
    | { level: 'slide'; blockNumber: string; slideLevel: string }
    | { level: 'decant'; decantLabel: string }
    | { level: 'decant_slide'; decantLabel: string; slideLevel: string }
    /** Real feature, per direct follow-up's own concrete example:
     *  "Aliquot A1-1A... Tissue Scraping." Molecular/genetic material
     *  derived FROM a specific slide — see Material.ts's own Aliquot
     *  type for the full reasoning. aliquotLabel is real and required
     *  (e.g. "A") — matching every other target level's own real,
     *  specific identifying field, never inferred. */
    | { level: 'aliquot'; blockNumber: string; slideLevel: string; aliquotLabel: string }
    | { level: 'decant_aliquot'; decantLabel: string; slideLevel: string; aliquotLabel: string }
    /** Real, architectural fix, per direct follow-up: "the matrix
     *  block itself is the tracked asset." A real, single, case-level
     *  target — matrixBlockId references Case.matrixBlocks[].id
     *  directly, never a specimen/block pairing (there isn't one real
     *  specimen to pair it with). See processMaterialLocationEvent.ts
     *  for how this real target level is applied at the case level,
     *  before any specimen lookup happens. */
    | { level: 'matrix_block'; matrixBlockId: string }
    /** Real feature, per direct follow-up: "Would this approach
     *  work? {BlockBarcode}-S{Index}." An individual, real, physical
     *  slide cut from a shared cassette — same real, case-level
     *  addressing as matrix_block above (no specimenLetter), plus the
     *  real slide's own level marker, same "L1"/"L2" convention as
     *  the ordinary 'slide' level above. */
    | { level: 'matrix_slide'; matrixBlockId: string; slideLevel: string };

  // 4. The actual location being reported
  location: string;
  workflowStage?: string;
  /** Real feature, per direct follow-up's own concrete example: "Logged
   *  In", "Grossed & Cut", "Sectioned", "Stained & Coverslipped". See
   *  MaterialLocation's own doc comment (types/case/Material.ts) for
   *  the full reasoning — genuinely distinct from workflowStage and
   *  location. */
  action?: string;
  /** When the location was actually observed at the real, physical
   *  station — distinct from `timestamp` (when the message was sent).
   *  Falls back to `timestamp` if the sending system doesn't track
   *  this separately. */
  observedAt?: string;
  /** Free text — operator/station id from the sending system. Not
   *  stored anywhere on the material record itself (no field for it,
   *  same real scope decision as BlockExceptionEventPayload's own
   *  reportedBy) — logged for traceability only. */
  reportedBy?: string;
  /** Real feature, per direct follow-up's own concrete example: "Tech:
   *  M. Davis", "Pathologist: Dr. E. Reed". A real, specific person's
   *  name, when the sending system provides one — see
   *  MaterialLocation.performedByName's own doc comment
   *  (types/case/Material.ts) for why this one IS stored on the
   *  material record, unlike reportedBy above. */
  performedByName?: string;
  /** Free text, matching BlockExceptionEventPayload's own sourceSystem
   *  field exactly — real, honest provenance without a closed enum of
   *  specific vendor names. */
  sourceSystem: string;
}
