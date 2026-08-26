// src/types/case/Specimen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clinical-grade specimen model.
// Aligned with:
//   • FHIR Specimen
//   • LIS specimen workflows
//   • CAP synoptic reporting
//   • PathScribe flag + reporting workflows
// ─────────────────────────────────────────────────────────────────────────────
import { SpecimenFlag } from "./SpecimenFlag";
import { CaseComment } from "./CaseComment";
import type { CasePriority } from "@/services/cases/ICaseService";
import type { MaterialLocation } from "./Material";

export interface SpecimenCollection {
  collectedAt?: string;
  collectedBy?: string;
  method?: string;
  bodySite?: string;
  laterality?: string;
}
export interface SpecimenProcessing {
  fixative?: string;
  processingDescription?: string;
  /** When fixative was added — the end of the cold ischemia window
   *  (collection → fixation), tracked per CAP/ASCO biomarker guidance. */
  processedAt?: string;
  /**
   * True when processedAt is a professional estimate, not a directly
   * documented time — e.g. the surgical suite failed to record it, and
   * the accessioner/pathologist provided their best estimate rather than
   * leaving it blank. Distinct from simply omitting processedAt: this is
   * a deliberate, permanent flag on the value itself, so anywhere this
   * time is later displayed (report, audit record) it stays visibly
   * marked as approximate rather than silently presented as a verified
   * fact. Must remain attached to the value everywhere it's shown, not
   * just noted once in the deficiency resolution log that led to it.
   */
  processedAtIsEstimated?: boolean;
}
export interface SpecimenContainer {
  type?: string;
  identifier?: string;
  description?: string;
}

// ── Histology Blocks & Stains — minimal demo model ─────────────────────────
// See Specimen.blocks's own doc comment for full scope reasoning. Status
// unions are fixed (not a runtime-configurable dictionary) — deliberate,
// same reasoning as CasePriority: these are settled clinical vocabularies,
// not something that benefits from being database-driven.

/**
 * Real feature, per direct follow-up building a full exception-states
 * matrix for the grossing bench: "Lost or damaged blocks need
 * immediate high-visibility visual warnings... Adding these clear
 * states across your block models gives histology complete
 * visibility." Confirmed directly this type's own header comment
 * ("no full exception-status lifecycle... cut here for time") meant
 * exactly what it said — neither state existed anywhere before this.
 * Real, additive extension to the actual data model, not just new UI
 * badges layered on top of nothing: 'Lost' means the physical
 * cassette can't be located in storage (microtome cutting is
 * impossible until found); 'Damaged' means the paraffin itself is
 * compromised (cracked/melted) and needs re-embedding before any
 * recut is possible — genuinely different physical situations with
 * genuinely different real consequences for what a tech can still do
 * with the block, not two labels for the same thing.
 */
export type BlockStatus = 'Pending' | 'Grossed' | 'Embedded' | 'Exhausted' | 'Cancelled' | 'Lost' | 'Damaged';
export type StainOrderStatus =
  | 'Pending Cut' | 'Cut & Placed' | 'Staining' | 'Coverslipped'
  | 'Ready for Review' | 'Recut Requested' | 'QC Failed' | 'Cancelled';

/**
 * Real feature, per direct confirmation: "we need a stain order called
 * Unstained which is the only stain that can technically be restained
 * on the same label." A real, named value rather than an
 * undefined/optional stainName — every existing piece of code that
 * treats stainName as a plain string keeps working with zero special-
 * casing, and it matches real lab practice directly: only a slide that
 * has never actually been through a stain can be converted in place
 * under its own slide id; anything that already has real dye on it
 * needs a genuinely new slide for a repeat. status 'Cut & Placed' is
 * the correct status for a freshly-created spare — the physical
 * cutting already happened (that's the whole point of a spare); only
 * the stain hasn't. Deliberately excluded from the Stain Dictionary
 * (mockStainTypeService.ts) — never a real, orderable stain type, so
 * it can never appear in StainMultiSelect's normal add-stain search;
 * the only way a slide gets this value is via handleCreateSpareSlide.
 */
export const UNSTAINED_LABEL = 'Unstained';

export interface StainOrder {
  id: string;
  /**
   * Display name only for this pass — e.g. "H&E", "ER" — not yet a real
   * foreign key into the Stain Dictionary (stainTypeId), since resolving
   * that requires the specimen's defaultStains (plain name strings) to
   * be matched back to real StainType records, which the dictionary
   * doesn't yet expose a lookup-by-name helper for. Flagged as real
   * follow-up work, not done here for time.
   *
   * UNSTAINED_LABEL ('Unstained') is the one reserved value meaning "a
   * real, physical spare slide, cut and ready, with no stain decided
   * yet" — see that constant's own doc comment for the full rationale.
   */
  stainName: string;
  status: StainOrderStatus;
  /**
   * Real feature, per direct follow-up on the Hybrid Request-Driven
   * Workflow spec: "Optimistic / 'Pending' State... render it
   * immediately in the Material tree with a clear visual badge."
   * Undefined means this stain was never itself a PathScribe-
   * initiated outbound request (e.g. it arrived with the case from
   * the LIS originally) — only ever set on a stain added via the
   * request-to-LIS flow, and only for as long as that request is in
   * flight or was refused. 'rejected' is kept, not cleared, per the
   * spec's own "flag the item with a clear alert" instruction — a
   * refused order stays visible with its real outcome, it doesn't
   * silently vanish.
   */
  lisRequestStatus?: 'pending' | 'confirmed' | 'rejected';
  /** A whole-slide scan of this specific stain order, if one exists.
   *  See Material.ts's DigitalAsset — left empty everywhere for now. */
  digitalAssets?: import('./Material').DigitalAsset[];
  /** Real feature, per direct follow-up: "Is there any reason to
   *  block Material location and tracking on PS-49?" See
   *  MaterialLocation's own doc comment (Material.ts) for the full
   *  shape. Real fix, per direct follow-up with a concrete mockup in
   *  hand: full, real history now (every event kept), not a single
   *  overwritten cache. */
  locationHistory?: MaterialLocation[];
  /**
   * Real feature, per direct follow-up's own concrete example:
   * "Aliquot A1-1A... Tissue Scraping" / "...RNA Lysate" — molecular/
   * genetic material derived FROM this specific slide. See Material.ts's
   * own Aliquot type for the full reasoning.
   */
  aliquots?: import('./Material').Aliquot[];
  /**
   * Real feature, per direct follow-up on unique material
   * identification. The PathScribe half of "both, linked" — a real,
   * stored, human-readable id (slideIdentifier() from
   * types/labels/LabelData.ts, e.g. "S26-4403-A1-L2"), computed once
   * at real slide/stain creation and stored here, matching
   * HistologyBlock.displayId's own shape exactly. Optional for the
   * same reason — see utils/materialDisplayId.ts's
   * resolveSlideDisplayId for the real, computed fallback for older
   * records.
   */
  displayId?: string;
  /** The other half of "both, linked" — see HistologyBlock.externalId's
   *  own doc comment for the full reasoning; identical shape here. */
  externalId?: string;
  /** Free text naming whatever real system assigned externalId. */
  externalIdSource?: string;
  /**
   * Real feature, per direct confirmation: "Order Restain... Captures
   * reason (e.g., 'Weak stain', 'Artifact', 'Pathologist request').
   * Logs who ordered it." "Never delete restains — they are part of
   * the case's analytic history... They should not be merged with or
   * overwrite the original slide." A restain is always its own,
   * separate StainOrder — restainOfSlideId links it back to the
   * original it repeats without touching that original record at
   * all. All four fields are set together, only when a restain is
   * actually ordered (handleOrderRestain) — never populated
   * individually, and never present on an ordinary, non-restain
   * slide.
   */
  restainReason?: string;
  restainOrderedBy?: string;
  restainOrderedAt?: string;
  restainOfSlideId?: string;
  /** Real feature, per direct follow-up: "stainer rack batch ID...
   *  live directly on the Slide record." Same real meaning as
   *  MatrixBlock.currentBatchId (types/case/MatrixBlock.ts) — which
   *  real Batch (services/batches/) this slide is currently checked
   *  into, if any. Undefined otherwise — most slides, most of the
   *  time, aren't actively inside a real staining batch run. */
  currentBatchId?: string;
  /** Real feature, per direct follow-up: "As the user scans each
   *  specimen container it gets updated to disposed and comes off the
   *  list." A real, durable, permanent fact about this specific
   *  physical item — deliberately a separate, additive field, not a
   *  new StainOrderStatus value (changing that enum risks silently
   *  breaking exhaustive status-switch logic elsewhere in this app;
   *  this field is purely additive and safe). Once set, this item is
   *  permanently excluded from computeDisposalQueue
   *  (services/retentionPolicy/computeDisposalQueue.ts) — never
   *  cleared, matching the same "never silently reversible" posture
   *  as every other real disposal record in this app. */
  disposedAt?: string;
  disposedBy?: string;
  /** Real, per direct guidance's own template-and-override design:
   *  "copy the default probe set onto the individual accession record
   *  upon creation, but allow authorized users... to add, remove, or
   *  swap [targets] dynamically." Only meaningful when this order's
   *  own StainType.category is 'Molecular' - populated from that
   *  StainType's defaultTargets at real order time, then freely
   *  editable here without ever changing the dictionary entry's own
   *  default array. Real target count (selectedTargets.length) is
   *  what calculateMolecularUnits.ts actually bills against - never
   *  the dictionary's own default count once an order exists. */
  selectedTargets?: import('@/types/billing/MolecularBillingRule').MolecularTarget[];
}

/** Real, shared shape for a stain-attributed applied or rejected
 *  ancillary code - mirrors the shape already used by
 *  services/billing/codeMapTable.ts's own unappliedSuggestionSources,
 *  so a pending suggestion and its eventual applied/rejected outcome
 *  carry the exact same real stain reference throughout. */
/** Real, per direct guidance's own detailed spec - explicit, never
 *  inferred from whether microscopicDescription text happens to be
 *  present (that check breaks down for mixed-complexity cases and
 *  misclassifies a complex specimen the pathologist hasn't written up
 *  yet). GROSS_ONLY maps unambiguously to CPT 88300 - the one
 *  universal gross-only code, safe for this app to apply
 *  automatically. GROSS_AND_MICRO covers CPT 88302-88309, which
 *  genuinely vary by specimen type/complexity - this app never
 *  guesses which one, see SpecimenEntry.microUpgradeBaseCptCode's own
 *  doc comment. */
export type SpecimenComplexity = 'GROSS_ONLY' | 'GROSS_AND_MICRO';

export interface AppliedBlockCode {
  code: string;
  /** The real StainOrder.id this code was applied/rejected for.
   *  Optional - a code not tied to any one specific stain (e.g. a
   *  molecular test on the block as a whole) stays a real, valid
   *  block-level entry rather than being forced into an attribution
   *  that doesn't apply. */
  stainOrderId?: string;
}

export interface HistologyBlock {
  id: string;
  /** Block letter — "A", "B", "C"... sequential per specimen. */
  label: string;
  status: BlockStatus;
  stains: StainOrder[];
  /**
   * Real feature, per direct follow-up on the Hybrid Request-Driven
   * Workflow spec: "Optimistic / 'Pending' State... render it
   * immediately in the Material tree with a clear visual badge." Same
   * real meaning as StainOrder.lisRequestStatus (see that field's own
   * doc comment) — undefined for a block that was never itself a
   * PathScribe-initiated recut/block request (e.g. it came with the
   * case from the LIS at accessioning).
   */
  lisRequestStatus?: 'pending' | 'confirmed' | 'rejected';
  /** Real fix, Phase 2 of specimen/block-level CPT association: each
   *  applied/rejected ancillary code now carries the real stain
   *  (StainOrder.id) it belongs to, not just the block - per direct
   *  requirement, since the stain, not the block, is the actual
   *  billable unit for ancillary codes (a block is just a physical
   *  grouping of stains, not itself a billing entity). stainOrderId
   *  is optional: a code genuinely not tied to any one stain (e.g. a
   *  molecular test run on the block as a whole) can still be applied
   *  at the block level as a real, deliberate fallback, not every
   *  code has to be forced into stain attribution.
   *
   *  rejectedCpt: real, per direct requirement - a pathologist must be
   *  able to approve OR reject an AI-suggested ancillary code at
   *  sign-out, not just apply it. Since suggestions are computed live
   *  from the block's current stains (suggestBlockAncillaryCptCodes),
   *  a rejected code would otherwise silently reappear on the very
   *  next recompute with no memory that it was already declined. This
   *  field is that memory - computeNewSuggestionsWithSources excludes
   *  anything listed here from a block's real, remaining
   *  unappliedSuggestions. Now stain-attributed too: rejecting one
   *  stain's suggestion no longer silently suppresses a different,
   *  still-pending stain's suggestion of the same code value - a real
   *  bug the old flat string[] shape had, since there was no way to
   *  tell which specific stain a rejection was actually for. */
  coding?: { cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] };
  /**
   * Which processing pathway this block came from, if generated from a
   * multi-pathway Protocol (services/protocols/IProtocolService.ts) —
   * e.g. "Light Microscopy", "Immunofluorescence". Undefined for
   * blocks generated the old way (single block, defaultStains/H&E
   * fallback) — most specimen types still work exactly that way; this
   * only populates for the specimen types that actually have a
   * multi-pathway protocol configured.
   */
  sourcePathwayName?: string;
  /** Carried over from the pathway for display/downstream use — e.g.
   *  "10% Neutral Buffered Formalin" vs. "Michel's Transport Medium".
   *  Same undefined-unless-protocol-generated reasoning as above. */
  fixativeType?: string;
  processingFormat?: string;
  requiresDecal?: boolean;
  /**
   * Optional per-block priority override. Undefined means "inherit
   * the case's own priority" — this is the default and correct state
   * for the overwhelming majority of blocks. Only set this when
   * someone has deliberately decided one specific block needs
   * different urgency than the rest of the case (e.g. a frozen
   * section or a single EM block needing to move faster than a
   * routine H&E on the same case) — set, it takes precedence over
   * Case.priority for that one block only; nothing else on the case
   * is affected.
   */
  priority?: CasePriority;
  /**
   * Real feature, per direct follow-up: "Subtext: Display the QC
   * status or timestamp ('Reported missing 8/14')" and "Block missing
   * from archive · QC Incident #1042." Free-text context for a Lost
   * or Damaged block specifically — deliberately one shared field
   * rather than separate ones per exception type, since what it needs
   * to say genuinely differs by situation (an incident number for a
   * lost block, a repair note for a damaged one) and a single real
   * pathologist/histotech-facing note covers both without forcing an
   * artificial split. Undefined for a block with no active exception.
   */
  exceptionNote?: string;
  /** When the exception (Lost/Damaged) was reported — real, separate
   *  from any other date on this case, since a block can be reported
   *  lost well after it was originally grossed/embedded. */
  exceptionReportedAt?: string;
  /**
   * Real feature, per direct follow-up: "Is there any reason to block
   * Material location and tracking on PS-49?" See MaterialLocation's
   * own doc comment (types/case/Material.ts) for the full reasoning —
   * a real, received cache, never something PathScribe decides for
   * itself. Real fix, per direct follow-up with a concrete mockup in
   * hand: full, real history now (every event kept), not a single
   * overwritten cache.
   */
  locationHistory?: MaterialLocation[];
  /**
   * Real feature, per direct follow-up on unique material
   * identification: "the ID should at least be understandable to a
   * human... I'm not sure if we should generate this id or expect it
   * from the LIS, or both and link them?" This is the "both, linked"
   * answer's PathScribe half — a real, stored, human-readable id
   * (cassetteIdentifier() from types/labels/LabelData.ts, e.g.
   * "S26-4403-A1"), computed once at real block creation and stored
   * here, matching Specimen.displayId's own established shape and
   * naming exactly rather than inventing a second convention.
   * Previously this same string was only ever computed on demand for
   * printing, never actually stored on the record — real,
   * confirmed inconsistency with Specimen.displayId, fixed here.
   * Optional for the same real reason Specimen.displayId is: older
   * blocks created before this existed don't have one — see
   * utils/materialDisplayId.ts's resolveBlockDisplayId for the real,
   * computed fallback.
   */
  displayId?: string;
  /**
   * The other half of "both, linked" — whatever real id a real,
   * external LIS/middleware assigns to this physical cassette, once
   * that integration exists. Deliberately a real, separate field
   * from displayId, not a value PathScribe would ever overwrite its
   * own id with — the two can genuinely disagree (a barcode printed
   * by Cerebro's own CEREBRO-ID hardware need not match PathScribe's
   * own deterministic string), and keeping both, explicitly linked,
   * is safer than forcing one to win. Undefined until a real,
   * field-verified vendor integration actually populates it (see
   * PS-49) — no real caller sets this yet, on purpose.
   */
  externalId?: string;
  /** Free text naming whatever real system assigned externalId —
   *  same vendor-agnostic shape as MaterialLocation.source and
   *  BlockExceptionEventPayload.sourceSystem, not a closed enum. */
  externalIdSource?: string;
  /** A block-face photo of this specific block, if one exists. See
   *  Material.ts's DigitalAsset — left empty everywhere for now. */
  digitalAssets?: import('./Material').DigitalAsset[];
  /**
   * Real feature, per direct confirmation: Biopsy Array support — "I
   * wanted to be able to assign each core to a specific section of a
   * single block... so the Pathologist can always identify what
   * section of the block the core tissue was embedded into." A
   * grossing activity, not a Materials-tab action: a PA assigns
   * several specimens to the same physical cassette while grossing.
   *
   * Each specimen still gets its OWN HistologyBlock record (slides/
   * stains keep working exactly as they already do, per-specimen,
   * unchanged) — this is purely a shared tag linking multiple,
   * separately-owned block records together. Deliberately not a
   * restructure of the underlying 1-block-belongs-to-1-specimen
   * model; MaterialTreePanel.tsx detects blocks across specimens that
   * share this same id and renders them as one grouped Biopsy Array
   * view instead of separate block icons.
   *
   * undefined = an ordinary, single-specimen block (the overwhelming
   * majority) — no behavior change for any existing block.
   */
  sharedCassetteId?: string;
  /**
   * This specimen's physical position within the shared cassette
   * named by sharedCassetteId (1, 2, 3...) — what actually lets a
   * pathologist look at a specific location on a shared slide and
   * know which specimen's tissue is there. Only meaningful alongside
   * sharedCassetteId; ignored otherwise.
   */
  positionInBlock?: number;
  /**
   * Real feature, per direct confirmation, grounded explicitly in
   * CAP ANP.11600 (documentation of specimen handling), CLIA
   * 493.1105 (test system integrity), and ISO 15189:2012 5.8
   * (traceability of records): "what happens is when the wrong piece
   * gets into the wrong block." Cancellation corrects a genuine
   * mis-assignment error — it is NOT deletion. The block's own `id`
   * is permanent and part of the specimen's chain of custody; status
   * moves to 'Cancelled' (BlockStatus) and these three fields record
   * who, when, and why, matching the real-world requirement that a
   * cancelled item "remain visible in audit logs and QC views" while
   * disappearing from active workflow (see
   * useSpecimenBlockManagement.ts's handleCancelBlock and
   * handleAdvanceFocusedBlockStatus for the workflow-exclusion side).
   * All three are set together, only by handleCancelBlock — never
   * populated individually.
   */
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  /** Real feature, per direct follow-up: "As the user scans each
   *  specimen container it gets updated to disposed and comes off the
   *  list." Same real, additive, never-cleared field as
   *  StainOrder.disposedAt's own doc comment — see that field for the
   *  full reasoning. */
  disposedAt?: string;
  disposedBy?: string;
  /** Real feature, per direct follow-up: "pieces (or tissue fragments)
   *  represent the individual physical fragments of a specimen placed
   *  into a cassette... recorded explicitly in the gross description
   *  and mapped to the cassette/matrix block record." Real, genuine
   *  QA value across the real pipeline: embedding checks this count
   *  against what's actually visible before processing continues,
   *  microtomy checks it against the ribbon, sign-out checks it
   *  against the slide — a real, load-bearing number, not a cosmetic
   *  one. Same real shape as MatrixBlock's own identical fields
   *  (types/case/MatrixBlock.ts) — intentionally identical so
   *  QA/embedding/microtomy tooling can treat an ordinary block and a
   *  matrix block the same way wherever the real distinction doesn't
   *  matter. */
  pieceCount?: number;
  pieceDescription?: string;
  /** Real feature, per direct follow-up: "The embedding technician
   *  relies on the recorded piece count to verify that 100% of the
   *  grossed tissue made it through processing into the paraffin
   *  block. If a cassette is logged with 4 pieces at grossing but
   *  only 3 are visible at embedding, an immediate Tissue Discrepancy
   *  QA Flag is raised before sectioning." Set once, at the real
   *  moment a block transitions to 'Embedded' (see
   *  BlockStainEditorModal.tsx's own status-change handler) — the
   *  real, observed count, independent of pieceCount above (the
   *  count recorded at grossing). A real discrepancy is simply these
   *  two, real numbers disagreeing — MaterialTreePanel.tsx renders
   *  that comparison directly rather than a separately-tracked
   *  boolean flag that could drift from the two real counts it's
   *  supposedly summarizing. */
  pieceCountAtEmbedding?: number;
  /** Real, honest tracking of whether every real, grossed piece
   *  actually made it into this physical cassette, or whether some
   *  remain in wet storage — see pieceCount's own doc comment for the
   *  full reasoning. */
  isEntirelySubmitted?: boolean;
  /** Real feature, per direct follow-up describing the real grossing-
   *  station workflow: cassette media attributes resolved via
   *  evaluateCassetteRouting.ts (resolveBlockCassetteColor.ts) — same
   *  real shape and reasoning as Decant.cassetteColorId/
   *  cassetteColorOverridden (types/case/Material.ts), for an
   *  ordinary tissue block's own real cassette. */
  cassetteColorId?: string;
  cassetteColorOverridden?: boolean;
}

/**
 * LIS synchronisation status — only meaningful for LIS mode (S26-) cases.
 *
 * lis_owned      — received from LIS, no local changes (no badge shown)
 * pending_sync   — added or edited in PathScribe, not yet transmitted to LIS
 * sync_sent      — transmitted to LIS, awaiting ACK
 * sync_rejected  — LIS rejected the update, needs attention
 * local_only     — Orchestration (O26-) case; specimen transmitted as part of
 *                  outbound result message at finalisation — no separate sync
 */
export type SpecimenLisStatus =
  | 'lis_owned'
  | 'pending_sync'
  | 'sync_sent'
  | 'sync_rejected'
  | 'local_only';

export interface Specimen {
  /** Internal UUID */
  id: string;
  /** Real fix, Phase 1 of specimen/block-level CPT association: base
   *  surgical pathology CPT codes (88302-88309) are assigned per
   *  specimen in real practice, not as a flat, undifferentiated
   *  case-level list - a case with a skin biopsy (88305) and a colon
   *  resection (88309) needs each specimen to carry its own real code,
   *  not one shared bucket. Bare code strings (not full MedicalCode
   *  objects), matching what
   *  services/billing/codeMapTable.ts's computeWorkRvuForCodes already
   *  expects.
   *
   *  Real, per direct guidance's own follow-up on structured linkage:
   *  the referring clinician's order-level Order.icd10Codes captures
   *  the real, original, pre-examination clinical indication for the
   *  whole order - genuinely case-wide by its own nature (one order,
   *  one clinical request). But the real, final, post-examination
   *  diagnosis a pathologist actually confirms often differs per
   *  specimen (a 5-polyp colonoscopy case can have one specimen read
   *  as a tubular adenoma and another as hyperplastic, each needing
   *  its own real ICD-10 for accurate billing) - the same real
   *  reasoning as CPT above, applied to diagnosis codes. coding.icd10
   *  is that same real, per-specimen linkage - optional, additive;
   *  every real charge-building path falls back to the existing,
   *  case-wide Order.icd10Codes when a specimen has none of its own,
   *  so nothing already working changes unless a real,
   *  specimen-specific code is actually assigned. */
  coding?: { cpt?: string[]; icd10?: { code: string; description: string }[] };
  /** Specimen letter or number (A, B, C…) */
  label: string;
  /** Human-readable description ("Left breast biopsy") */
  description: string;
  /** Full display label ("Specimen A — Left breast biopsy") */
  displayName?: string;
  /** Cassette/slide/report label derived from the case's human-facing
   *  accession.fullAccession (e.g. "MFT-2026-000029-A"), NOT from `id`
   *  (internal UUID) or Case.id (internal routing key). What a
   *  pathologist dictates and what a cassette printer actually prints —
   *  see AccessionPage.tsx's handleSubmit for where this is set at
   *  specimen creation. Optional because it's only populated for
   *  specimens created after the accession-mask registry existed —
   *  older seed specimens don't have one and fall back to id/label in
   *  any UI that reads this field. */
  displayId?: string;
  /** Real, architectural fix, per direct follow-up: "Each Specimen
   *  maintains a lightweight pointer... for relational lookup without
   *  duplicating physical status properties." References
   *  Case.matrixBlocks[].id — a specimen with any tissue in a real,
   *  shared cassette holds the real matrix block's own id here, never
   *  a competing copy of its status/location. Most specimens have no
   *  shared tissue at all and this stays undefined, exactly as it
   *  always has. */
  matrixBlockIds?: string[];
  /** Collection metadata (FHIR Specimen.collection) */
  collection?: SpecimenCollection;
  /** Processing metadata (fixative, processing steps) */
  processing?: SpecimenProcessing;
  /** Container metadata (jar, slide, block) */
  container?: SpecimenContainer;
  /** When the lab received the specimen */
  receivedAt?: string;
  /** When the specimen was collected (if known) */
  collectedAt?: string;
  /** Flags applied to this specimen */
  specimenFlags?: SpecimenFlag[];
  /**
   * Specimen-level comment thread — distinct from `description`. Changed
   * from a single overwritable string to a real append-only thread, same
   * reasoning and same shape as Case.caseComments (types/case/Case.ts) —
   * each entry has a real author and timestamp, nothing here is ever
   * edited or deleted once posted.
   */
  comments?: CaseComment[];
  /**
   * Confirmation that a specimen's protocol triage checklist
   * (services/protocols/IProtocolService.ts Protocol.triageChecklist)
   * was actually followed at the bench — e.g. "split the core into
   * LM/IF/EM portions." Deliberately retrospective, not a gate before
   * block creation: blocks are already auto-generated from the
   * protocol at accession time, so this confirms the physical work
   * matched what was expected, rather than blocking anything.
   */
  triageConfirmedAt?: string;
  triageConfirmedBy?: string;
  /**
   * Specimen Dictionary entry this specimen was populated from
   * (useSpecimenDictionary's SpecimenEntry.id), if any — lets later code
   * trace back to the dictionary's structured type/site/laterality/
   * procedure without re-matching on description text. Undefined for
   * specimens entered manually (no dictionary match) or seeded before
   * this field existed.
   */
  specimenDictionaryEntryId?: string;
  /** Real, per direct guidance's own detailed spec - explicit
   *  declaration, not inferred. Defaulted from the linked
   *  SpecimenEntry.defaultComplexity when a dictionary entry is first
   *  selected (SpecimenEditModal.tsx), then freely overridable per
   *  specimen (a mixed-complexity case - e.g. a colon resection
   *  needing full micro alongside an incidental gallbladder handled
   *  gross-only - genuinely needs this at the specimen level, not the
   *  case level). Undefined for a specimen with no dictionary link
   *  and no manual declaration yet - callers should not assume
   *  GROSS_ONLY from absence. */
  complexity?: SpecimenComplexity;
  /** Real feature, per direct follow-up: "Is there any reason to
   *  block Material location and tracking on PS-49?" See
   *  MaterialLocation's own doc comment (Material.ts) for the full
   *  shape. Real fix, per direct follow-up with a concrete mockup in
   *  hand: full, real history now (every event kept), not a single
   *  overwritten cache. */
  locationHistory?: MaterialLocation[];
  /**
   * Real feature, per direct follow-up on unique material
   * identification: "I'm not sure if we should generate this id or
   * expect it from the LIS, or both and link them?" Specimen already
   * has the PathScribe half (displayId, above) — this is the other
   * half of "both, linked": whatever real id an external LIS/
   * middleware assigns, once that integration exists. Same real
   * shape and reasoning as HistologyBlock.externalId/
   * externalIdSource — see that field's own doc comment.
   */
  externalId?: string;
  externalIdSource?: string;
  /**
   * Histology blocks generated for this specimen — minimal model built
   * for a same-week end-to-end demo (Accession → Grossing Template →
   * Blocks/Stains → Worklist → Synoptic → sign-out). Deliberately
   * narrow: no block-level priority, no full exception-status lifecycle,
   * no export/Vantage anything — all real follow-up work, cut here for
   * time. Auto-generated at Accession submit from the matched dictionary
   * entry's defaultStains (falling back to H&E if unset, which is most
   * entries today — defaultStains was added to the type but never
   * backfilled onto real seed data). No editing UI yet at the grossing
   * bench; this pass is read-through visibility, not editing.
   */
  blocks?: HistologyBlock[];
  /** Cytology material — residual fluid / cell block prep, with its own
   *  slides. A specimen populates either blocks (surgical) or decants
   *  (cytology), never both — see Material.ts's file header. */
  decants?: import('./Material').Decant[];
  /** A gross photo of this specimen/container itself, if one exists.
   *  See Material.ts's DigitalAsset — left empty everywhere for now. */
  digitalAssets?: import('./Material').DigitalAsset[];
  /** Optional SNOMED specimen type code */
  snomedTypeCode?: string;
  /** Optional SNOMED anatomic site code */
  snomedSiteCode?: string;
  /** Whether this specimen is active (not deleted/retired) */
  active?: boolean;
  /**
   * LIS synchronisation status.
   * Undefined or 'lis_owned' = normal LIS specimen, no badge.
   * Set to 'pending_sync' when PathScribe adds or edits a specimen on an S26- case.
   * Set to 'local_only' for O26- orchestration cases (no LIS sync required).
   * Updated to 'sync_sent' / 'sync_rejected' by the LIS write-back service.
   */
  lisStatus?: SpecimenLisStatus;
  /** Real feature, per direct follow-up: "does disposal queue include
   *  container id so specimens can be disposed?" Same real shape as
   *  HistologyBlock.disposedAt/disposedBy — a specimen's own wet
   *  tissue, held in its own real, printed container
   *  (barcodePayloadForContainer — types/labels/LabelData.ts), is a
   *  real, separately disposable object with its own retention clock
   *  (RetentionPolicy.ts's own 'wet_tissue' RetainableMaterialType —
   *  real, seeded governing-body windows already existed for this;
   *  the real, missing piece was the queue/scan-dispose wiring, not
   *  the retention math itself). */
  disposedAt?: string;
  disposedBy?: string;
  /** Audit metadata */
  createdAt?: string;
  updatedAt?: string;
}
