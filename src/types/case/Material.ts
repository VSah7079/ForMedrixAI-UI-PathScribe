// src/types/case/Material.ts
// ─────────────────────────────────────────────────────────────────────────────
// Only the genuinely new pieces of the material tree — everything else
// already existed in Specimen.ts (HistologyBlock, StainOrder) and is
// extended there directly rather than duplicated here. See this file's
// own history: the first version of this file rebuilt Block and Slide
// from scratch, parallel to HistologyBlock/StainOrder, before that
// duplication was caught and removed.
//
// DigitalAsset — a photo or scan attached to a specimen, block, or stain
// order. A second, parallel relationship to material children, not a
// variant of them: a block can have a block-face photo AND slides
// underneath it, and those are two different kinds of "belongs to this
// block." Deliberately left with nothing populating it anywhere in this
// pass — no upload or scan pipeline exists in the app yet (checked
// directly). The type is real; the data isn't, on purpose.
//
// Decant — HistologyBlock's real, working lifecycle doesn't fit cytology
// material, which was never embedded in wax. A specimen's material sits
// under either blocks (surgical) or decants (cytology), never both.
// ─────────────────────────────────────────────────────────────────────────────

export type DigitalAssetKind = 'gross_photo' | 'block_face_photo' | 'wsi_scan';

export interface DigitalAsset {
  id: string;
  kind: DigitalAssetKind;
  /** Left optional/absent deliberately — see file header. */
  url?: string;
  capturedAt: string;
  capturedBy?: string;
}

/**
 * Real feature, per direct follow-up: "Is there any reason to block
 * Material location and tracking on PS-49?" — confirmed there wasn't;
 * this is the exact same "ingest our own specification" pattern
 * already proven for block exceptions (BlockExceptionEventPayload),
 * applied here. One, shared, real shape for "where is this material
 * item right now, as of when, according to whom" — reused across
 * every material type below rather than each getting its own,
 * slightly-different copy.
 *
 * Real fix, per direct follow-up with a concrete, detailed mockup in
 * hand: this used to be a single lastKnownLocation CACHE (only ever
 * the most recent event, every prior one silently overwritten and
 * gone) — confirmed directly as a real, honest gap when asked "are we
 * storing just the last entry, or all the entries?" A real,
 * hierarchical, per-item scan history (the actual ask) needs every
 * real event kept, not just the latest — see MaterialLocation[]
 * below, on every material type, replacing the old single-value
 * field everywhere. Still deliberately a CACHE of real, received
 * events, never a field PathScribe itself decides or infers — the
 * real, external LIS/middleware remains the actual source of truth
 * for physical location; this is only ever what it told us, in full,
 * not just the newest line.
 */
export interface MaterialLocation {
  /** Free text — "Grossing Station 3", "Histology — Embedding",
   *  "Archive Shelf 12B". Real, external systems' own location/station
   *  vocabulary varies enough (confirmed directly — no shared standard
   *  found) that a closed enum here would either be wrong for most
   *  real deployments or need constant editing; free text is honest
   *  about that rather than pretending a universal list exists. */
  location: string;
  /** Real, optional structured stage, when the sending system
   *  provides one — the same real workflow stages cerebroAdapter.ts's
   *  own header comment already documents (Accessioning → Grossing →
   *  Processing → Embedding → Microtomy/Sectioning → Staining →
   *  Slide Archival). Kept separate from `location` (a station name)
   *  since the two are genuinely different axes — a slide can be at
   *  "Staining Station 2" while its workflow stage is "Staining," or
   *  a system may report only one of the two. */
  workflowStage?: string;
  /**
   * Real feature, per direct follow-up's own concrete example: "Logged
   * In", "Grossed & Cut", "Embedded", "Sectioned", "Stained &
   * Coverslipped", "Out for Review", "Digitized WSI", "Extracted", "In
   * Transit". The real, specific verb describing what happened at
   * this location — genuinely distinct from workflowStage (the
   * broader phase, e.g. "Staining") and from location (the station
   * name, e.g. "Auto-Stainer 1"): a single workflowStage can cover
   * several different real actions over time (staining, then
   * coverslipping, both still "Staining"), and this is where that
   * finer, real detail lives. Optional — a sending system that only
   * ever reports location/stage, never a specific action, is still
   * handled honestly (this simply stays unset, never guessed).
   */
  action?: string;
  /** When this location was actually observed/reported at the real,
   *  physical station — distinct from when PathScribe received the
   *  event. */
  at: string;
  /** Free text — whatever real system sent this, matching
   *  BlockExceptionEventPayload's own sourceSystem field exactly
   *  (same vendor-agnostic reasoning: free text, not a closed enum of
   *  specific vendor names). */
  source: string;
  /**
   * Real feature, per direct follow-up's own concrete example: "Tech:
   * M. Davis", "Pathologist: Dr. E. Reed". A real, specific person's
   * name, when the sending system provides one — genuinely distinct
   * from `source` (which system sent this) and from the
   * MaterialLocationEventPayload's own reportedBy (an operator/station
   * ID, logged only for traceability, deliberately never stored on
   * the material record itself, per that field's own doc comment).
   * This one IS stored, on purpose — a real, human-readable
   * attribution the hierarchical scan-history view is built to
   * display directly, not just log.
   */
  performedByName?: string;
}

export type DecantType = 'residual_fluid' | 'cell_block';

/** Real, single, shared source for this display mapping — found
 *  duplicated as an inline ternary in three separate places
 *  (BlockStainEditorModal.tsx, MaterialTrackingHistoryModal.tsx, and
 *  a real, new decant-container-label builder) before this existed;
 *  same real "spread definition over multiple types of maintenance"
 *  problem this app avoids everywhere else. */
export const DECANT_TYPE_LABEL: Record<DecantType, string> = {
  cell_block: 'Cell Block',
  residual_fluid: 'Residual Fluid',
};

/**
 * Real feature, per direct follow-up's own concrete example: "Aliquot
 * A1-1A: `AP-2026-08912-A1-1A` — Tissue Scraping" / "Aliquot A1-2A:
 * ... — RNA Lysate". A genuinely new material type — confirmed
 * directly, nothing in this app's material tree modeled molecular/
 * genetic material derived FROM a slide before this (a tissue
 * scraping, an RNA lysate — sent onward to a molecular lab, or a
 * courier). Lives under a Slide (StainOrder), not a Block or Decant
 * directly — the real hierarchy the concrete mockup itself showed
 * (Slide A1-1 -> Aliquot A1-1A), distinct from a Slide's own sibling
 * relationship to its parent Block.
 */
export interface Aliquot {
  id: string;
  /** e.g. "A" — appended directly to its parent slide's own real
   *  identifier with no separator (aliquotIdentifier() in
   *  types/labels/LabelData.ts), matching the concrete example
   *  exactly: slide "...A1-1" + aliquot label "A" = "...A1-1A". */
  label: string;
  /** Free text — "Tissue Scraping", "RNA Lysate", "DNA Extract" — real
   *  molecular-material vocabulary varies by lab and by what a
   *  specific downstream test needs; same honest reasoning as
   *  MaterialLocation.location above, not a closed enum. */
  aliquotType: string;
  /** Full, real scan/tracking history — see MaterialLocation's own
   *  doc comment for why this is an array, not a single cache. */
  locationHistory?: MaterialLocation[];
  displayId?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Decant {
  id: string;
  /** e.g. "D1" — decant's own label sequence, parallel to a block's. */
  label: string;
  decantType: DecantType;
  /** Reuses StainOrder from Specimen.ts directly — a decant's slides
   *  need the exact same real lifecycle a block's slides already have,
   *  not a second, competing status enum. */
  stains: import('./Specimen').StainOrder[];
  createdAt: string;
  createdBy?: string;
  digitalAssets?: DigitalAsset[];
  /** Full, real scan/tracking history — see MaterialLocation's own
   *  doc comment above for why this replaced the old, single-value
   *  lastKnownLocation cache. */
  locationHistory?: MaterialLocation[];
  /**
   * Real, per PS-284 (Microtomy Workstation)'s own "Specimen Fluid/
   * Decant Panel: Total Volume (mL), Appearance (Clear/Bloody/
   * Turbid), Decant Yield/Pellet Size (Low/Moderate/High)." 100%
   * greenfield — confirmed directly before adding these that Decant
   * had no volume/appearance/yield concept anywhere in this app.
   * Drives computeCytologyPrepSuggestions.ts's own dynamic
   * preparation-rule logic; all three stay optional since an older
   * decant, or one from a lab that doesn't track this level of detail,
   * genuinely may not have them recorded.
   */
  totalVolumeMl?: number;
  appearance?: 'Clear' | 'Bloody' | 'Turbid';
  yieldPelletSize?: 'Low' | 'Moderate' | 'High';
  /**
   * Real feature, per direct follow-up on unique material
   * identification, which explicitly named "decant, fluid" as
   * material needing this: decantIdentifier() from
   * types/labels/LabelData.ts (e.g. "S26-4403-AD1"), the same real
   * shape as HistologyBlock.displayId. Real correction to this
   * comment's own earlier claim — found and fixed while wiring
   * "decant-level linking UI": a real Decant creation flow DOES exist
   * (handleAddDecant, MaterialTreePanel.tsx's own "+ Add decant/fluid"
   * menu) and always has; the real gap was that nothing could ever
   * UPDATE a decant afterward (no handleUpdateDecant existed) and
   * accessioning's own pathway-driven material generation
   * (AccessionPage.tsx) never produced one regardless of
   * ProtocolPathway.materialKind. Both are now real and wired.
   */
  displayId?: string;
  /** The other half of "both, linked" — see HistologyBlock.externalId's
   *  own doc comment; identical shape and same real caveat above. */
  externalId?: string;
  externalIdSource?: string;
  /** Real feature, per direct follow-up: cell blocks "frequently use
   *  distinct cassette colors... to signal fragile cytopreparations
   *  to histotechnologists." References
   *  cassetteColors/ICassetteColorService.ts's own
   *  CassetteColorDefinition.id — the real, resolved (or manually
   *  overridden) color for THIS decant's own cassette. Undefined
   *  means never resolved yet (e.g. this decant predates the routing
   *  engine being wired in, or the engine found no matching rule) —
   *  never assume a default color silently. */
  cassetteColorId?: string;
  /** True once a real cytotech/grossing-assistant override has
   *  replaced the auto-resolved value above — per direct follow-up:
   *  "the hopper control widget lets them manually override
   *  Auto-Route [Hopper 3] to Hopper 1 with a single click." Real,
   *  deliberate scope: PathScribe resolves and lets a real person
   *  override which LOGICAL COLOR this cassette uses — it never
   *  models hopper numbers (see evaluateCassetteRouting.ts's own
   *  header for the confirmed two-layer boundary this respects). */
  cassetteColorOverridden?: boolean;
  /** Real feature, per direct follow-up: "please wire decants for
   *  disposal." Same real shape as Specimen.disposedAt/disposedBy —
   *  a decant's own wet tissue/fluid, held in its own real container
   *  (DecantContainerLabelData — types/labels/LabelData.ts), is a
   *  real, separately disposable object on the same real 'wet_tissue'
   *  RetainableMaterialType window as an ordinary specimen container. */
  disposedAt?: string;
  disposedBy?: string;
  /** Real, per direct follow-up on comment-field parity across
   *  material types — see HistologyBlock.comments's own doc comment
   *  (types/case/Specimen.ts) for the full reasoning, including why
   *  this deliberately uses plain-text MaterialComment, not rich-text
   *  CaseComment. */
  comments?: import('./MaterialComment').MaterialComment[];
}
