// src/types/case/Specimen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clinical-grade specimen model.
// Aligned with:
//   • FHIR Specimen
//   • LIS specimen workflows
//   • CAP synoptic reporting
//   • PathScribe flag + reporting workflows
// ─────────────────────────────────────────────────────────────────────────────
import type { FlagInstance } from "../flagsRuntime";
import { CaseComment } from "./CaseComment";
import { MaterialComment } from "./MaterialComment";
import type { CasePriority } from "@/services/cases/ICaseService";
import type { MaterialLocation } from "./Material";
import type { AutopsyOrganCode } from "@/types/autopsy/AutopsyOrganCode";
import type { CytologyCategorySelection } from "@/types/cytology/CytologyReviewRecord";
import type { RecordedClinicalHistoryEntry } from "@/types/clinicalHistory/RecordedClinicalHistoryEntry";
import type { CytologyRoseEvaluation } from "@/types/cytology/CytologyRoseEvaluation";

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
  /** Real, per direct request (ISO 15189 traceability — "duration of
   *  fixation... from specimen collection to grossing") — when tissue
   *  was actually removed from fixative, typically at grossing when
   *  the specimen is trimmed into cassettes. Record only, per direct
   *  decision — no gating/warning on this yet if grossing happens
   *  before a real, expected minimum fixation duration has elapsed
   *  (unlike processedAt's own real, existing hard gate at sign-out —
   *  FixativeTimeGateModal.tsx — which enforces that the fixation
   *  START time is documented, not how long fixation actually
   *  lasted). Undefined until grossing actually records it. */
  fixationEndedAt?: string;
  /** Real, per direct guidance's own follow-up ("timestamp and user
   *  ID associated with the... check to satisfy laboratory
   *  accreditation traceability requirements") — a real audit object,
   *  not a bare boolean, mirroring this codebase's own established
   *  {userId, userName} + timestamp shape (e.g.
   *  QaActivityRecord.recordedBy). Presence of this object IS the
   *  confirmation — there's no real, separate "confirmed: false"
   *  state to represent; undefined means not yet confirmed. Records a
   *  grossing tech's own direct visual/professional judgment that the
   *  real fixative volume used (SpecimenContainer.fixativeVolumeMl)
   *  was adequate for this specimen's own real size — the practical,
   *  CAP-recognized standard being roughly 10:1 fixative-to-tissue by
   *  volume. No real, structured tissue volume/weight field exists
   *  anywhere in this codebase to compute an actual ratio against
   *  (confirmed directly before building this), which is why this is
   *  a real, qualitative confirmation rather than a computed number. */
  fixativeToTissueRatioConfirmation?: { userId: string; userName: string; confirmedAt: string };
}
export interface SpecimenContainer {
  type?: string;
  identifier?: string;
  description?: string;
  /** Real, per direct request (ISO 15189 traceability — "volume
   *  ratio, typically 10:1 fixative-to-tissue... from specimen
   *  collection to grossing") — the real, actual fixative volume used
   *  for this specific specimen, in mL. Defaults from the selected
   *  ContainerType's own capacityMl when a prefilled container is
   *  chosen, but stays editable — a tech may add more fixative for a
   *  larger-than-typical specimen, or this may be a dry container
   *  filled at the bench with a volume that has nothing to do with
   *  any catalog default. Undefined for a genuinely dry container or
   *  whenever this wasn't recorded — never a fabricated number. */
  fixativeVolumeMl?: number;
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
  /** Real, per the Protocol-Driven Workflow Infrastructure story's
   *  Part 3 Grossing Screen: "Stains (default vs user-added flagged
   *  visually)." Undefined/false — the common case — means this stain
   *  came from the protocol's own pathway defaults at accession
   *  (generateDefaultMaterial.ts); true means a grossing tech added it
   *  at the Grossing Screen, from the allowedAdditionalStainTypeIds-
   *  filtered dropdown. Drives both the visual flag and Remove Stain's
   *  own confirmation-required-for-a-default-only rule. */
  userAdded?: boolean;
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
  /**
   * Real, per direct billing-expert guidance (PS-93): which of this
   * shared MatrixBlock stain's participating specimens the order was
   * actually targeted at — captured at real order time (the Array
   * Mapper's own "Order Ancillary Stain" action, per direct spec) or,
   * for an older stain predating that flow, whatever the best
   * available record is. Only ever meaningful when this StainOrder
   * lives inside MatrixBlock.slides[] (types/case/MatrixBlock.ts) —
   * an ordinary specimen-owned HistologyBlock's own stains already
   * have unambiguous attribution via nesting, this field stays
   * undefined there, always.
   *
   * Deliberately NOT what billing is computed from — see
   * evaluatedSpecimenIds below for that. Which cores were physically
   * targeted when the stain was ordered and which cores a pathologist
   * actually diagnostically evaluated on the resulting slide are two
   * real, genuinely different facts (a targeted core's tissue can
   * turn out non-diagnostic, artifactual, or simply not what the
   * final read relied on) — billing on intent-to-evaluate rather than
   * confirmed-evaluation is exactly the kind of automatic split-
   * billing without clinical intent this whole feature exists to
   * prevent.
   */
  targetSpecimenIds?: string[];
  /**
   * Real, per direct billing-expert guidance (PS-93): the actual
   * billing trigger — which of this shared MatrixBlock stain's
   * participating specimens the pathologist has explicitly confirmed
   * as "Evaluated / Reviewed for Diagnosis" at the slide viewer /
   * diagnostic sign-out stage (BillingReviewPanel.tsx's own Evaluated
   * Cores Checklist). Only ever meaningful alongside targetSpecimenIds
   * above, same MatrixBlock-only scope.
   *
   * Deliberately separate from, and never defaulted from,
   * targetSpecimenIds — a core can be targeted at order time and
   * genuinely not end up evaluated (non-diagnostic tissue, artifact,
   * simply not what the read relied on), and never automatically
   * bills. Deliberately undefined/empty by default: "ensuring zero
   * risk of unbundled or improper claims" — see
   * computeMatrixStainBillingUnits (services/billing/codeMapTable.ts)
   * for the real calculation this drives: empty/undefined yields zero
   * billing units, not a guess.
   */
  evaluatedSpecimenIds?: string[];
  /** Real, per direct follow-up on comment-field parity across
   *  material types — see HistologyBlock.comments's own doc comment
   *  for the full reasoning, including why this deliberately uses
   *  plain-text MaterialComment, not rich-text CaseComment. Real,
   *  genuine use: a note specific to this one stain order (e.g. a
   *  repeat requested due to a technical artifact), distinct from
   *  the block-level or specimen-level threads. */
  comments?: MaterialComment[];
  /** Real, per PS-284 (Microtomy Workstation) — "toggle for whether a
   *  comment prints on the human-readable label area or stays
   *  LIS-only." Governs the most recent entry in `comments` above;
   *  undefined/false means LIS-only (the safe default — a slide label
   *  has almost no room for free text, and printing an unreviewed
   *  comment onto a physical label by default risks real, unintended
   *  disclosure on a specimen that leaves the bench). */
  commentPrintsOnLabel?: boolean;

  // ── PS-284 Microtomy Workstation: real print-tracking fields ─────────
  // Deliberately additive, never a new StainOrderStatus value — same
  // "purely additive, safe" reasoning as disposedAt/disposedBy above.
  // A slide's clinical status (Pending Cut/Cut & Placed/etc.) and its
  // print/etch job status are two genuinely different real facts: a
  // slide can be 'Cut & Placed' while its label printed, failed to
  // print, or hasn't been sent to a printer yet at all.
  /** Real, per PS-284's own "Per-slide status: Pending, Etching/
   *  Printing, Printed, Failed, Canceled." Undefined means never
   *  attempted — the common case for a slide that predates this
   *  field, or was cut before ever reaching the Microtomy Workstation
   *  page. */
  printStatus?: 'Pending' | 'Printing' | 'Printed' | 'Failed' | 'Canceled';
  printedAt?: string;
  printedBy?: string;
  /** Real, human-readable reason a print attempt failed (e.g. a
   *  printCassetteSlideLabel error message) — shown on the slide row
   *  so a tech can see why without re-attempting blind. */
  printFailureReason?: string;
  /** Real, per PS-284's own Add Stain Quick-Picker: "level depth/
   *  microtome step distance." Free-form microns value — real cutting
   *  depth conventions (4µm routine vs. thicker for some specials)
   *  vary enough by stain/lab that this stays a plain number, not a
   *  closed enum. */
  levelDepthMicrons?: number;
  /** Real, per PS-284's own "control-slide pairing checkbox
   *  (auto-creates paired Stain + Control slide)." Set on BOTH the
   *  clinical slide and its auto-created control slide, each pointing
   *  at the other's `id` — a real, symmetric pairing link, distinct
   *  from the existing restainOfSlideId's one-directional "repeats
   *  this original" relationship. */
  pairedControlSlideId?: string;
  /** True only on the auto-created control member of a pairing above
   *  — drives the control-slide badge in the slide grid. Undefined/
   *  false for an ordinary clinical slide, including one that has a
   *  paired control (pairedControlSlideId set, isControlSlide false/
   *  undefined on the clinical slide itself). */
  isControlSlide?: boolean;
  /** Real, per PS-284's own Cytology & Decanting panel: "Preparation
   *  Method Selector per slide." Only meaningful for a decant's own
   *  slides (types/case/Material.ts's Decant.stains) — undefined for
   *  an ordinary tissue block slide, which has no preparation-method
   *  concept at all. */
  preparationMethod?: 'Direct Smear (Air-Dried)' | 'Direct Smear (Fixed)' | 'Cytospin' | 'ThinPrep/Liquid-Based' | 'Cell Block';
  /** Real, per PS-284's own "dedicated Reprint button requiring
   *  single-tap reason selection (Jam, Scratched Glass, Misprint)."
   *  Always set together, only on an explicit reprint action — same
   *  "all set together, never individually" convention as
   *  restainReason/restainOrderedBy/restainOrderedAt above. A reprint
   *  is a duplicate of the SAME slide record (unlike a restain, which
   *  is deliberately a new, separate StainOrder) — see
   *  reprintCount below for the real, cumulative audit count this
   *  keeps instead. */
  lastReprintReason?: 'Jam' | 'Scratched Glass' | 'Misprint' | 'Other';
  lastReprintOrderedBy?: string;
  lastReprintOrderedAt?: string;
  /** Real, cumulative count of reprint actions against this exact
   *  slide record — "duplicate-label auditing" per the spec's own
   *  language. Undefined/0 means never reprinted. */
  reprintCount?: number;

  // ── PS-286 (Slide Distribution Station) — post-staining routing ──
  // Real, per PS-286's own "Chain-of-Custody Logging" requirement:
  // this is a genuinely new real-world stage this app didn't track at
  // all before — where a finished, stained physical slide actually
  // GOES (a pathologist's desk, a courier bag, a specific scanner
  // rack slot), as opposed to WsiScanBatch/WsiScanSlide (services/
  // digitalPathology/), which already tracks the digital SCAN outcome
  // once a slide reaches a scanner, but has no concept of the
  // physical routing step before that, and no slide-level pathologist/
  // subspecialty assignment at all (only Case.assignedTo/
  // Case.subspecialtyId exist, at case granularity). Confirmed by
  // direct investigation before building — see
  // pages/SlideDistributionStationPage/README.md's own account.
  /** Which real half of the post-staining workflow this slide was
   *  routed through. Undefined until a distribution tech actually
   *  scans and routes this slide — never defaulted. */
  distributionDestination?: 'physical' | 'digital';
  /** Real, per the spec's own "sets status to Checked Out/Assigned"
   *  (physical) and "In Scanning Queue/Loaded on Scanner" (digital) —
   *  one shared real status field covering both real destinations,
   *  since a slide is only ever routed one way at a time. */
  distributionStatus?: 'Assigned' | 'Checked Out' | 'In Scanning Queue' | 'Loaded on Scanner';
  /** Real FK to services/users/ IUserService's own StaffUser.id — the
   *  real attending pathologist this slide was routed to for physical
   *  checkout. assignedPathologistName is cached for display, same
   *  "FK + cached display name" convention as
   *  SynopticReportInstance.pathologistId/pathologistName. */
  assignedPathologistId?: string;
  assignedPathologistName?: string;
  /** Real FK to services/subspecialties/ ISubspecialtyService's own
   *  Subspecialty.id — for routing to a subspecialty worklist/pool
   *  (Dermpath, GI, Cytopathology) rather than one named individual.
   *  Mutually exclusive with assignedPathologistId in practice (a
   *  slide goes to a named person OR a pool, never validated as
   *  exclusive here — the UI's own quick-picker enforces the real
   *  choice, same posture as every other soft-exclusive pair in this
   *  file, e.g. pairedControlSlideId/isControlSlide). */
  assignedSubspecialtyId?: string;
  /** Real, per the spec's own "Physical Location & Carrier Tracking:
   *  input/scan for Slide Folder IDs, Tray Numbers, Courier Transit
   *  Bags." All optional/independent — a tech may only ever fill in
   *  whichever of these a given lab's own real workflow actually uses. */
  physicalLocation?: {
    slideFolderId?: string;
    trayNumber?: string;
    courierBagId?: string;
  };
  /** Real, per the spec's own "Equipment & Rack Mapping: target
   *  specific instruments... map slot positions within scanner racks
   *  (e.g. Rack ID 102, Slots 1-30)." scannerInstrumentId is a real,
   *  free-text value — same honest, un-registried convention
   *  WsiScanBatch.scannerInstrumentId already uses (confirmed by
   *  direct check of mockWsiScanBatchService.ts's own seed data,
   *  e.g. "Leica Aperio GT450 #2") — no formal instrument registry
   *  exists in this app, so this doesn't invent one either. */
  scannerAssignment?: {
    scannerInstrumentId?: string;
    rackId?: string;
    slotPosition?: string;
  };
  /** Real, per the spec's own "Scan Exception Log" — set while a
   *  flagged exception (unreadable barcode / unassigned accession /
   *  missing glass) is still open on an already-queued slide;
   *  undefined once resolved (cleared, not merely left stale — same
   *  real convention as HardwareContainer.currentBatchId's own
   *  "cleared the moment released" note). A brand-new, still-
   *  unresolved scan that never even reached a real slide record
   *  (an unreadable barcode with nothing to attach it to) is NOT
   *  stored here — it stays a client-side, session-scoped entry in
   *  the workstation's own exception log; see that hook's own header. */
  activeExceptionReason?: 'Unreadable Barcode' | 'Unassigned Accession' | 'Missing Glass';
  /** Real, append-only chain-of-custody log for this one real slide's
   *  post-staining routing — same "append-only thread, never edited
   *  or overwritten" reasoning as Case.caseComments's own doc comment,
   *  applied here because the spec's own "Chain-of-Custody Logging"
   *  requirement is explicitly an audit trail, not just a latest-
   *  status field. */
  distributionEvents?: SlideDistributionEvent[];

  // ── PS-287 (Pathologist-Initiated Add-On Orders) ──────────────────────
  // Real, per the spec's own "Add-On Order Builder" — a pathologist
  // ordering a recut/special stain/IHC/molecular test against an
  // EXISTING block, as opposed to a tech's own routine cutting plan
  // (addMicrotomyStain, PS-284). Deliberately additive fields on the
  // same real StainOrder record this app already uses for every other
  // slide — an add-on order genuinely IS a StainOrder the moment it's
  // submitted (same status lifecycle, same printing/distribution
  // pipeline downstream), not a second, parallel order concept that
  // would have to be reconciled with this one later. See
  // utils/addOnOrderOperations.ts for the real creation/routing/
  // exception logic and pages/AddOnOrderPage/README.md for the full
  // investigation this was built against.
  /** Undefined for a tech-driven routine slide (the common case up to
   *  now) — set only when this StainOrder originated from a
   *  pathologist's own add-on order, per the spec's own priority
   *  selector (STAT/Urgent bypasses the routine queue the same real
   *  way Case.order.priority's own 'STAT' already does elsewhere in
   *  this app; Research/Protocol is explicitly lower, non-clinical
   *  priority). */
  addOnPriority?: 'STAT/Urgent' | 'Routine Sign-Out' | 'Research/Protocol';
  /** Real FK to services/users/ IUserService's own StaffUser.id — which
   *  pathologist actually placed this add-on order. orderedByName is
   *  cached for display, same FK+cached-name convention as
   *  assignedPathologistId/assignedPathologistName (PS-286) above.
   *  Deliberately distinct from restainOrderedBy — a restain repeats a
   *  slide that already existed; this is a genuinely new order against
   *  a block, with its own real priority/routing/media selections a
   *  restain never carries. */
  orderedByPathologistId?: string;
  orderedByPathologistName?: string;
  orderedAt?: string;
  /** Real, per the spec's own "IHC panel picker — single-stain or
   *  panel search (e.g., Breast Panel: ER/PR/HER2/Ki-67)." Set on
   *  every real StainOrder created as part of the same panel pick, so
   *  the Order Builder/Tracking views can group and label them
   *  together; undefined for a single-stain add-on order. See
   *  utils/addOnOrderOperations.ts's own IHC_PANEL_PRESETS — a real,
   *  small starter set built from this app's actual Stain Dictionary
   *  seed data, not a fabricated external catalog; a full,
   *  admin-manageable panel dictionary is real, separate follow-up
   *  work (see that file's own header for the honest scope note). */
  addOnPanelId?: string;
  addOnPanelName?: string;
  /** Real, per the spec's own "Slide Media & Charge Selector: Standard
   *  Charged / Uncharged / Plus Glass." Genuinely missing anywhere in
   *  this app before this pass (confirmed by direct investigation) —
   *  a real, physical choice the cutting bench needs to know before
   *  spooling labels, so it lives on the order itself, same as
   *  levelDepthMicrons already does. */
  slideMediaType?: 'Standard Charged' | 'Uncharged' | 'Plus Glass';
  /** Real, per the spec's own "Microtome Bench Instructions: editable
   *  notes field for special handling." Free text, plain (not rich-
   *  text CaseComment) — same "genuinely different in kind" reasoning
   *  MaterialComment.text/SlideDistributionEvent.detail already use
   *  for a short, bench-facing operational note rather than a
   *  clinical discussion thread. */
  cuttingInstructions?: string;
  /** Real, per the spec's own "Auto-Control Pairing: On-Slide Control
   *  vs. Separate Control Slide." When a pathologist chooses On-Slide
   *  (the control tissue rides on the SAME physical slide as the
   *  clinical tissue — no second StainOrder), this records what
   *  control tissue was used, pre-filled from the ordered
   *  StainType.defaultControlTissueType and freely editable. The
   *  Separate-Control choice reuses the real, existing same-block
   *  sibling-slide mechanism instead (pairedControlSlideId/
   *  isControlSlide, built for PS-284's own Add Stain Quick-Picker) —
   *  deliberately NOT a second, parallel pairing mechanism. */
  onSlideControlTissue?: string;
  /** Real, per the spec's own "Automatic Order Splitting" — which real
   *  lab bench queue this order resolved to at creation time
   *  (Histology Cutting / Special Stains Bench / IHC & Special
   *  Histochemistry / Reference-Send-Out), computed from the ordered
   *  StainType.category. Stored, not merely re-derived on every
   *  render, so the Order Tracking dashboard shows a stable value
   *  even if a stain's own dictionary category is edited later. See
   *  resolveAddOnRouting in utils/addOnOrderOperations.ts. */
  routedQueueLabel?: 'Histology Cutting Queue' | 'Special Stains Bench Queue' | 'IHC/Special Histochemistry Queue' | 'Reference/Send-Out Lab Queue';
  /** Real, per direct follow-up on this ticket's own Jira comment:
   *  "everything it creates should ultimately land in the same real
   *  vocabulary PS-284/285/286 are tying into" — SCAN_STATION_WORKFLOW_STAGES
   *  (services/scanStations/IScanStationService.ts), not a second,
   *  parallel queue-name vocabulary. Undefined for a Reference/
   *  Send-Out order, which resolves to an external facility instead
   *  (see sendOutReferenceLabFacilityId below), never a real internal
   *  ScanStation. */
  routedWorkflowStage?: string;
  /** Real, per this ticket's own direct Jira comment: "a pathologist
   *  ordering an add-on is ordering against a specific case, which
   *  belongs to a specific performing lab... must route to that
   *  case's own performing lab's queues — never a single,
   *  enterprise-wide queue." Resolved once at real order time via
   *  resolveCasePerformingLab (services/cases/casePoolAssignmentService.ts)
   *  and stored here, same "stable at order time" reasoning as
   *  routedQueueLabel above — a later change to the case's own
   *  facility/performing-lab configuration must never silently
   *  reroute an order that's already in flight. */
  performingLabFacilityId?: string;
  /** Real FK to services/facilities/ IFacilityService's own Facility.id
   *  — only ever meaningful when routedQueueLabel is 'Reference/
   *  Send-Out Lab Queue'. Deliberately a real, existing Facility with
   *  roles.includes('reference_lab') (confirmed real, existing role —
   *  "Somewhere your lab sends specimens TO for outsourced,
   *  specialized testing"), not a fabricated destination list.
   *  sendOutReferenceLabName cached for display, same convention as
   *  every other FK+cached-name pair in this file. Real, honest scope
   *  note: no per-performing-lab "preferred reference lab" mapping
   *  exists anywhere in this app yet, so the ordering pathologist
   *  picks explicitly from active reference_lab facilities each time,
   *  rather than this system silently defaulting one — see
   *  pages/AddOnOrderPage/README.md. */
  sendOutReferenceLabFacilityId?: string;
  sendOutReferenceLabName?: string;
  /** Real, per the spec's own Real-Time Pathologist Order Tracking
   *  dashboard ("Requested → Block Retrieved → Cut/Pending Stain →
   *  Stained/QC → Checked Out/Scanned"). Deliberately NOT a new
   *  StainOrderStatus value — same "purely additive, never touch the
   *  exhaustive status enum" posture disposedAt/printStatus/PS-286's
   *  own distribution fields already established. The dashboard's
   *  own five display stages are derived fresh from this field plus
   *  the existing status/distributionStatus fields by
   *  computeAddOnTrackingStage (utils/addOnOrderOperations.ts) —
   *  never a separately stored, driftable "current stage" value. Set
   *  once, when a tech actually pulls the physical block to fulfill
   *  this specific pending order. */
  blockRetrievedAt?: string;
  blockRetrievedBy?: string;
  /** Real, per the spec's own §5 "Exception Handling & Block
   *  Exhaustion" — set while a tech-flagged exhaustion/insufficiency
   *  exception is open on this specific pending order; undefined once
   *  resolved (same "cleared, not left stale" convention as
   *  activeExceptionReason above). Deliberately one, single, current
   *  exception per order — a second exception can't be flagged while
   *  one is still open (see flagBlockExhaustion's own guard). The
   *  full history of how it was raised/resolved lives in
   *  exceptionEvents below, append-only, same reasoning
   *  distributionEvents already established for this same file. */
  exception?: AddOnOrderException;
  /** Real, append-only audit log for every flag/approve/cancel/modify
   *  transition this order's own exception has gone through — see
   *  exception's own doc comment. */
  exceptionEvents?: AddOnOrderExceptionEvent[];
}

/** See StainOrder.distributionEvents's own doc comment. */
export interface SlideDistributionEvent {
  id: string;
  action: 'assigned' | 'checked_out' | 'loaded_on_scanner' | 'exception_flagged' | 'exception_resolved' | 'label_reprint_requested';
  timestamp: string;
  techUserId: string;
  /** Real, human-readable summary of what this event recorded (target
   *  pathologist/pool, physical location, scanner/rack/slot, or
   *  exception reason) — plain text, same "genuinely different in
   *  kind from CaseComment, never needing rich text" reasoning as
   *  MaterialComment.text's own doc comment. */
  detail: string;
}

/** See StainOrder.exception's own doc comment (PS-287). */
export interface AddOnOrderException {
  reason: 'Block exhausted' | 'Insufficient tissue for panel' | 'Requires re-grossing';
  note?: string;
  flaggedBy: string;
  flaggedByName: string;
  flaggedAt: string;
  /** 'pending_pathologist_review' the moment a tech flags it — the
   *  real trigger for the spec's own "Pathologist Notification Loop."
   *  The other three are the loop's own real, closed set of responses
   *  ("cancel/modify/approve-destructive-cutting options"). */
  status: 'pending_pathologist_review' | 'approved_destructive_cut' | 'modified' | 'cancelled';
  pathologistResponseBy?: string;
  pathologistResponseByName?: string;
  pathologistResponseAt?: string;
  responseNote?: string;
}

/** See StainOrder.exceptionEvents's own doc comment (PS-287). */
export interface AddOnOrderExceptionEvent {
  id: string;
  action: 'flagged' | 'approved_destructive_cut' | 'cancelled' | 'modified';
  timestamp: string;
  actorId: string;
  actorName: string;
  detail: string;
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
  /** Real, per direct follow-up: "add tissue descriptions on
   *  cassettes as that would be good for any block." Free text
   *  naming what's actually in this specific cassette (e.g. "Heart —
   *  LAD", "Cerebral Cortex", "Left Ventricle") — genuinely distinct
   *  from `label` (the block's own sequential letter/number) and
   *  from `sourcePathwayName` (which processing pathway generated
   *  it, not what tissue is inside it). Deliberately general, not
   *  Autopsy-specific — any block benefits from naming its own
   *  contents, especially once a specimen has more than a couple.
   *  Undefined for the overwhelming majority of blocks today (a
   *  single-block specimen rarely needs one); editable the same way
   *  `comments` is, never auto-derived from anything. */
  tissueDescription?: string;
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
  /** Real, per direct follow-up: "we should support comment fields
   *  associated to the assets. We have them for specimen, but not
   *  sure for block, stain, decants etc." Confirmed directly before
   *  adding this: no such field existed on HistologyBlock, StainOrder,
   *  Decant, or MatrixBlock — only Specimen and Case had a real
   *  comment thread. Real, per a direct follow-up correction: this
   *  deliberately uses MaterialComment (plain text), NOT CaseComment
   *  (rich text/HTML) — see MaterialComment.ts's own header for the
   *  full reasoning on why case/specimen-level rich text is genuine
   *  overkill for a short, operational block-level note. Real,
   *  genuine use: a grossing-assistant or embedding-tech note
   *  specific to this one block (e.g. an unusual finding at
   *  embedding), distinct from the specimen-wide comment thread. */
  comments?: MaterialComment[];
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
  /** Real, per the Protocol-Driven Workflow Infrastructure story's
   *  Part 3 Grossing Screen — set true the moment this block's own
   *  stains diverge from the protocol's own pathway defaults (a
   *  userAdded stain added, or a protocol-default stain removed).
   *  Drives the block table's own visual flag; the specimen-level
   *  "Protocol Modified" indicator (protocol header) is simply
   *  "any block on this specimen has userModified: true." Undefined —
   *  the common case — means every stain on this block still matches
   *  exactly what generateDefaultMaterial.ts originally generated. */
  userModified?: boolean;
  /** Real, per PS-284 (Microtomy Workstation) — "high-contrast alert
   *  badges for Tiny Tissue, Decal Required, Fragile." Decal Required
   *  already exists as requiresDecal above; these two are the real,
   *  genuinely missing pair — greenfield, additive booleans, same
   *  undefined-means-false posture as every other flag on this type. */
  tinyTissue?: boolean;
  fragile?: boolean;
  /** Real, per PS-285 (Embedding Station) — "Base Mold Size Picker:
   *  quick-select for standard sizes." A closed set — free text would
   *  defeat the point of a quick-select picker, and these five are the
   *  ticket's own real, named options. Undefined means no mold size has
   *  been recorded yet (every block embedded before this feature
   *  existed, and any block not yet embedded). */
  moldSize?: EmbeddingMoldSize;
  /** Real, per PS-285 — "Orientation Instructions: grossing notes or
   *  diagram flags for special orientations." Free text, same posture
   *  as every other clinical narrative field in this app the real
   *  vocabulary is too open to close (e.g. tissueDescription above) —
   *  the ticket's own examples ("Embed on edge", "Epithelial surface
   *  down", "Cross-section up") are illustrative quick-fill suggestions
   *  the UI offers, not a closed enum this field is restricted to. */
  orientationInstructions?: string;
  /** Real, per PS-285 — "Multi-Cassette / Split-Block Tracking: visual
   *  indicators when a specimen was split across multiple cassettes
   *  (A1, A2, A3) to ensure all related cassettes are embedded
   *  together." Genuinely different real concept from sharedCassetteId
   *  above (multiple SPECIMENS sharing ONE physical cassette) — this is
   *  the opposite: ONE specimen's tissue split ACROSS several separate
   *  physical cassettes because it didn't fit in one. Blocks sharing
   *  this id are cassette-split siblings of the same original tissue;
   *  each still carries its own real, distinct label ("A1"/"A2"/"A3")
   *  and its own independent embedding/staining lifecycle — this field
   *  only groups them for the Embedding Station's own "were all of
   *  these embedded together yet" check. Undefined = an ordinary block
   *  that was never split (the overwhelming majority). */
  splitBlockGroupId?: string;
  /** Real, per PS-285 — "Discrepancy Reporting: one-touch buttons for
   *  Missing Tissue/Empty Cassette, Extra Tissue Found, Unopened
   *  Cassette/Unprocessed Tissue, Damaged Cassette/Broken Hinge." The
   *  real sub-reason recorded alongside the same def-tissue-discrepancy
   *  deficiency this event raises through the existing, shared
   *  deficiency engine (mockDeficiencyTypeService.ts,
   *  specimenDeficiencyService) — that deficiency's own free-text
   *  comment already carries the raw piece-count numbers; this closed
   *  set is what the Embedding Station's own one-touch buttons record,
   *  for real analytics ("how many discrepancies were genuinely missing
   *  tissue vs. a damaged cassette") free text alone can't support. */
  lastDiscrepancyReason?: EmbeddingDiscrepancyReason;
  lastDiscrepancyReportedBy?: string;
  lastDiscrepancyReportedAt?: string;
  /** Real, per PS-285 — "Reason Log: mandatory reason prompt for any
   *  reprint (Wax Buildup, Faded Barcode, Mechanical Jam) for
   *  compliance auditing." Same real "required reason, cumulative
   *  count, never cleared" shape as StainOrder.lastReprintReason/
   *  reprintCount (PS-284) — this is that same real pattern for a
   *  cassette label instead of a slide label. */
  lastCassetteReprintReason?: CassetteReprintReason;
  lastCassetteReprintOrderedBy?: string;
  lastCassetteReprintOrderedAt?: string;
  cassetteReprintCount?: number;
}

/** Real, per PS-285 (Embedding Station) — the ticket's own five named
 *  standard embedding mold sizes. */
export type EmbeddingMoldSize = '7x7mm' | '15x15mm' | '24x24mm' | '24x30mm' | 'Mega Mold';

/** Real, per PS-285 — the ticket's own four named one-touch discrepancy
 *  reasons. */
export type EmbeddingDiscrepancyReason =
  | 'Missing Tissue/Empty Cassette'
  | 'Extra Tissue Found'
  | 'Unopened Cassette/Unprocessed Tissue'
  | 'Damaged Cassette/Broken Hinge';

/** Real, per PS-285 — the ticket's own three named cassette-reprint
 *  reasons, plus 'Other' matching this app's own established pattern
 *  for a required-reason field (e.g. StainOrder.lastReprintReason). */
export type CassetteReprintReason = 'Wax Buildup' | 'Faded Barcode' | 'Mechanical Jam' | 'Other';

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

/** Real, per the Protocol-Driven Workflow Infrastructure story's Part
 *  2c — one real, checkable line item from Protocol.triageChecklist
 *  (services/protocols/IProtocolService.ts), e.g. "Split the core into
 *  LM/IF/EM portions." `item` is copied from the Protocol at the exact
 *  moment SpecimenTriage is initialized (accession) — same real
 *  "snapshot, not live reference" reasoning as Specimen.protocolSnapshot
 *  — so a later edit to the master Protocol's own checklist wording
 *  never retroactively changes what an already-accessioned specimen's
 *  checklist reads. */
export interface SpecimenTriageChecklistItem {
  item: string;
  confirmed: boolean;
}

/** Real, per the Protocol-Driven Workflow Infrastructure story's Part
 *  2c. Initialized once, at accession (generateDefaultMaterial.ts),
 *  only when the resolved Protocol has requiresTriage: true — every
 *  other specimen has no SpecimenTriage at all and is never gated.
 *  Real, hard gate (per direct instruction): handleReleaseGrossingBlocks
 *  (useSpecimenBlockManagement.ts) refuses to release a block on this
 *  specimen until either every checklistItems entry is confirmed, or
 *  overrideReason is set. */
export interface SpecimenTriage {
  /** When triage became required — set once, at accession, to
   *  Specimen.protocolSnapshot's own timestamp-equivalent moment.
   *  Never changes after that. */
  requiredAt: string;
  /** Set once every checklistItems entry is confirmed (normal path)
   *  or once overrideReason is recorded (override path) — whichever
   *  happens first. Undefined the whole time triage is genuinely still
   *  pending; its presence alone is what the release gate checks. */
  completedAt?: string;
  completedBy?: string;
  checklistItems: SpecimenTriageChecklistItem[];
  /** Real, per direct instruction's own override workflow: a
   *  supervisor's real, required reason for releasing despite an
   *  incomplete checklist — e.g. a genuine bench emergency. Set
   *  together with completedAt/completedBy on the override path;
   *  undefined on the normal, checklist-completed path. Never a silent
   *  bypass — always a real, recorded reason. */
  overrideReason?: string;
}

/** Real, per the Protocol-Driven Workflow Infrastructure story's Part
 *  3 Grossing Screen audit panel: "every override logged with field,
 *  original value, new value, actor, timestamp." One real, append-
 *  only entry per real override — piece count changed, a protocol
 *  default stain removed, a stain added beyond defaults. Never
 *  edited or deleted once logged, same real "append-only" discipline
 *  as Specimen.comments/CaseComment elsewhere in this app. */
export interface SpecimenGrossingOverride {
  /** Real, closed set — a specific field name (not free text), so the
   *  audit panel can group/label overrides consistently rather than
   *  displaying whatever string a caller happened to pass. */
  field: 'pieceCount' | 'stainAdded' | 'stainRemoved';
  /** Which real block this override happened on — e.g. "A1" — always
   *  present, since every real override this story defines happens at
   *  the block level, never the specimen level. */
  blockLabel: string;
  originalValue: string;
  newValue: string;
  actor: string;
  timestamp: string;
}

export interface Specimen {
  /** Internal UUID */
  id: string;
  /** Real, per direct guidance's own confirmed two-tier
   *  specimen-to-organ mapping strategy: a real, structured,
   *  enumerated organ classification — genuinely distinct from this
   *  specimen's own free-text `description` (e.g. "Left lobe of
   *  liver," "Formalin container A: Brain"), which stays honest about
   *  external-system vocabulary variance and is never parsed for
   *  this. An array (not a single code) to honestly handle real,
   *  combined resections (e.g. a real liver+gallbladder specimen).
   *  Drives real, derived Autopsy Grossing Synoptic section
   *  visibility (types/autopsy/AutopsyOrganCode.ts,
   *  services/autopsy/resolveActiveAutopsyGrossingSections.ts) —
   *  "Whole Body" vs. "Head & Neck Only" etc. are no longer real,
   *  separate presets, just what naturally falls out of which organs
   *  are actually present. Optional and additive: a real specimen
   *  with none set (legacy data, or a real, unmapped specimen) falls
   *  back to the real, separate site-text classifier — see that
   *  file's own doc comment — never blocks accessioning on this being
   *  populated. Real, confirmed intake path per HL7/FHIR SPM-8 /
   *  Specimen.collection.bodySite, not invented here. */
  organCodes?: AutopsyOrganCode[];
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
   *  specimen-specific code is actually assigned.
   *
   *  coding.snomed follows this exact same reasoning - real, per
   *  direct guidance (PS-105/Code Manager work): distinct SNOMED
   *  codes should never be assumed to equal distinct diagnoses, and
   *  the same real concept can legitimately appear more than once
   *  (multiple observations producing the same concept, the same
   *  concept genuinely attached to different components of one
   *  specimen, a repeated/updated observation over the case's
   *  lifecycle). This array is deliberately never deduplicated on
   *  write - every real, individual association is retained for
   *  traceability, exactly as this file's own icd10 array already
   *  does. A distinct, deduplicated concept SET for analytics/billing
   *  is a real, separate DERIVATION over this raw data
   *  (deriveUniqueConcepts, services/terminologySearch/), never baked
   *  into storage itself.
   *
   *  coding.icdO follows this exact same per-specimen linkage
   *  reasoning, added per direct research while scoping the
   *  RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports gap.
   *  Genuinely distinct from coding.icd10 above: an ICD-10 code is a
   *  diagnosis code; an ICD-O-3 code carries a real, standard combined
   *  morphology/behavior form (e.g. "8500/3") whose own behavior digit
   *  (in situ vs. malignant) is what a real cancer-registry
   *  reportability determination depends on — see
   *  services/cancerRegistry/resolveIcdOBehaviorCode.ts. Confirmed
   *  directly before adding this field: no such structure existed
   *  anywhere in this app before now (FHIR_DISPATCH_ARCHITECTURE_PLAN.md's
   *  own flagged, previously-unconfirmed question) — an ICD-O code
   *  selected via AddCodeModal.tsx's own 'ICDO' tab had nowhere honest
   *  to land except this same icd10 array, indistinguishable from a
   *  plain diagnosis code. Real, honest remaining gap, not fixed here:
   *  AddCodeModal.tsx's own live ICD-O search is itself a "coming
   *  soon" placeholder (no backend proxy exists yet, same real
   *  category as its neighboring ICD-11 placeholder) — this field
   *  exists so a real capture path (that search, once built, or a
   *  future manual-entry UI) has somewhere honest to persist to; nothing
   *  populates it yet. */
  coding?: { cpt?: string[]; icd10?: { code: string; description: string }[]; snomed?: { code: string; description: string }[]; icdO?: { code: string; description: string }[] };
  /**
   * Real, per direct billing-expert guidance (PS-93): this specimen's
   * own applied/rejected ancillary codes for stains it was explicitly
   * attributed on (StainOrder.evaluatedSpecimenIds) sourced
   * from a shared MatrixBlock (Case.matrixBlocks[]) it participates
   * in — keyed by matrixBlockId since a specimen could in principle
   * participate in more than one. Deliberately separate from this
   * specimen's own blocks[].coding (HistologyBlock.coding, same file)
   * rather than reusing it: the exact same physical stain can
   * correctly bill differently to different specimens sharing it (a
   * shared block's first IHC can be 88342 for Specimen A but the
   * correct, NCCI-sequenced code for Specimen B's own first IHC on
   * that identical physical slide is 88341), so this can never be a
   * single, shared value stored once on the MatrixBlock itself — see
   * services/billing/README.md's own PS-93 disclosure for the full
   * reasoning. Same AppliedBlockCode shape as HistologyBlock.coding,
   * for consistency.
   */
  matrixBlockCoding?: { matrixBlockId: string; cpt?: AppliedBlockCode[]; rejectedCpt?: AppliedBlockCode[] }[];
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
  /**
   * Real, per direct guidance's own cross-jurisdiction pre-analytic
   * compliance research (resolvePreAnalyticDateGateConfig.ts) - true
   * only when receivedAt was never genuinely recoverable and a real,
   * audited administrative override (e.g. "Date Not Provided" — the
   * exact label is jurisdiction-specific, see that file) was applied
   * via PreAnalyticDateGateModal at sign-out, instead of receivedAt
   * itself. Deliberately a separate flag rather than writing a
   * sentinel string into receivedAt - receivedAt stays a real
   * ISO-date-or-undefined field everywhere else in this app; a
   * consumer must check this flag to render the real, localized
   * override label instead of treating an empty receivedAt as a
   * plain data gap. Same "companion flag, never fabricate the value
   * itself" posture as SpecimenProcessing.processedAtIsEstimated.
   */
  receivedAtAdministrativeOverride?: boolean;
  /** Same real override posture as receivedAtAdministrativeOverride
   *  above, for collectedAt specifically - both dates are
   *  independently required per direct guidance's own UKAS ISO 15189
   *  Clause 7.2 research ("date and time of collection AND laboratory
   *  receipt"), so either one can be missing and separately overridden. */
  collectedAtAdministrativeOverride?: boolean;
  /** Required free-text reason captured at the moment either override
   *  above was applied (PreAnalyticDateGateModal) - the real, audited
   *  justification for why neither a documented nor estimated date
   *  was possible. Shared between both override flags since a
   *  specimen missing both dates at once still only needs one real
   *  explanation, not two duplicate comments. */
  preAnalyticDateOverrideComment?: string;
  /** Real, confirmed fix (Jira PS-57) — see Case.ts's own, fuller
   *  comment on caseFlags/specimenFlags: was SpecimenFlag[], the
   *  wrong, inline-definition shape; the real, live flag-application
   *  workflow has always written FlagInstance[] here. */
  specimenFlags?: FlagInstance[];
  /**
   * Specimen-level comment thread — distinct from `description`. Changed
   * from a single overwritable string to a real append-only thread, same
   * reasoning and same shape as Case.caseComments (types/case/Case.ts) —
   * each entry has a real author and timestamp, nothing here is ever
   * edited or deleted once posted.
   */
  comments?: CaseComment[];
  /**
   * Real, per direct guidance's own real LIS/cytology data-modeling
   * principle: "case-level history forms the diagnostic baseline...
   * always allow overriding or appending specimen-specific history
   * onto individual specimens so distinct anatomic sites maintain
   * their individual clinical context." Real, deliberately ADDITIVE
   * to Case.order.clinicalHistory — never a replacement — for genuine
   * multi-specimen cytology cases (e.g. Part A: Right Pleural Fluid,
   * Part B: Left Pleural Fluid) where a real history item (a prior
   * result, a targeted radiologic finding) belongs to one specific
   * specimen's own anatomic site, not the whole case. Real, explicit
   * scope boundary: combining this with Case.order.clinicalHistory
   * into one, real "inherited" view during cytotechnologist/
   * pathologist review is separate, later work — not built here.
   */
  clinicalHistory?: RecordedClinicalHistoryEntry[];
  /**
   * Real, per the Protocol-Driven Workflow Infrastructure story's Part
   * 2c — supersedes the earlier triageConfirmedAt/triageConfirmedBy
   * pair (a real, simple, retrospective-only confirmation with no
   * per-item detail and no gating power: "blocks are already auto-
   * generated from the protocol at accession time, so this confirms
   * the physical work matched what was expected, rather than blocking
   * anything"). Per direct instruction, this is now a real, hard gate:
   * handleReleaseGrossingBlocks (useSpecimenBlockManagement.ts) refuses
   * to release a block on a specimen with an incomplete, non-
   * overridden triage record. Initialized at accession
   * (generateDefaultMaterial.ts) only when the resolved Protocol has
   * requiresTriage: true — undefined for every specimen whose protocol
   * doesn't require triage at all, which never sees any gate.
   */
  triage?: SpecimenTriage;
  /** Real, per the Protocol-Driven Workflow Infrastructure story's
   *  Part 3 Grossing Screen audit panel — see SpecimenGrossingOverride's
   *  own doc comment. Undefined/empty for a specimen with no real
   *  overrides yet, which is the common case — most blocks keep their
   *  protocol defaults untouched. */
  grossingOverrides?: SpecimenGrossingOverride[];
  /**
   * Real, additive — per the Protocol-Driven Workflow Infrastructure
   * story. Locks the exact Protocol identity/version resolved at
   * accession (generateDefaultMaterial.ts), so a later edit to the
   * master Protocol (services/protocols/IProtocolService.ts) never
   * retroactively changes what an already-accessioned specimen shows
   * on the Grossing Screen — same real "snapshot, not live reference"
   * reasoning as ProtocolHistoryEntry.snapshot on Protocol itself.
   * Undefined for specimens generated before this field existed, or
   * whose SpecimenEntry has no protocolId configured at all (the
   * single-block fallback path in generateDefaultMaterial.ts).
   */
  protocolSnapshot?: { id: string; version: number; name: string };
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
  /**
   * Real, per direct guidance: any configuration for the Cytology &
   * Cervical Screening module lives as a new System subtab
   * (services/cytology/), and a real GYN cytology specimen is just a
   * regular Specimen — SpecimenEntry.type: 'Cytology'/'FNA' already
   * distinguishes it, same as any other specimen type — not a
   * separate, parallel case system. This is that specimen's own real
   * screening state once one exists; undefined for every non-cytology
   * specimen and for a cytology specimen not yet screened. Real,
   * deliberately SLIM: every actual review (the primary screen, each
   * secondary screening event, the pathologist's own review) is its
   * own, separate, immutable CytologyReviewRecord
   * (types/cytology/CytologyReviewRecord.ts,
   * services/cytology/mockCytologyReviewRecordService.ts) — per direct
   * correction, "Each review is distinct and persists as part of the
   * Case's auditable History," not mutable fields here. What
   * genuinely IS specimen-level state, not review-level history,
   * stays here: which review is authoritative, and the real, minimal
   * HPV/educational-notes fields below.
   */
  cytologyScreening?: CytologyScreeningRecord;
  /** Audit metadata */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A GYN cytology specimen's real screening state — deliberately slim.
 * See this field's own doc comment above for why every actual review
 * lives in the separate CytologyReviewRecord collection instead of
 * here.
 */
export interface CytologyScreeningRecord {
  /**
   * Real, per direct guidance ("the ability to select one of the
   * reviews on record and select that review to be the Final
   * Diagnosis for the report... used in discordance reporting against
   * the Primary Cytotechs initial review"): explicit selection of
   * which one, real, already-recorded CytologyReviewRecord is
   * authoritative for the report. Undefined until someone with real,
   * sufficient authority actually makes this selection — never
   * defaulted or inferred.
   */
  finalDiagnosis?: CytologyFinalDiagnosisSelection;
  /**
   * Real, per direct follow-up: a "QC" tile/pool needs somewhere real
   * to draw from. Real, honest scoping: the actual automatic
   * SELECTION algorithm (random 10% sample per PS-157's own rate
   * settings, or high-risk targeting per PS-164's own algorithm) is
   * still separate, not-yet-built work — neither one is wired to real
   * cases yet. This field is the real, minimal, explicit, MANUAL
   * interim mechanism: a specimen can be flagged for mandatory QC
   * directly, by a real, attributed action, so the QC pool has real
   * data to show right now rather than staying permanently empty
   * until the full automatic algorithm exists. Cleared (not merely
   * left stale) the moment a real, matching CytologyReviewRecord
   * clears it — see resolveCytologyQcPoolMembership
   * (services/cytology/).
   */
  qcFlag?: {
    reason: 'random_selection' | 'targeted_high_risk';
    flaggedBy: string;
    flaggedByName: string;
    flaggedAt: string;
  };
  /** Real, minimal HPV co-testing placeholder — full reflex/cotesting
   *  rule automation (HPV Test Integration, a genuinely separate,
   *  later module phase) is explicitly NOT built here; this only
   *  records the real, current status a screener/pathologist can see
   *  and manually enter. */
  hpvCoTestOrdered?: boolean;
  hpvResult?: 'Positive' | 'Negative' | 'Pending' | 'Not Performed';
  /** Real, per direct guidance's own international workflow roadmap
   *  (Phase 1: US/CA — "Dual-result views that show cytological slide
   *  data and molecular HPV status side-by-side"): real, standard
   *  co-testing assay genotype reporting — only meaningful when
   *  hpvResult === 'Positive'. Mirrors PS-164's own existing
   *  CytologyHighRiskFactors.hpvHighRiskGenotype grouping ("HPV 16 or
   *  HPV 18/45") exactly, so this real, newly-captured data can
   *  finally feed that real, previously-input-less factor — see
   *  resolveHpvHighRiskFactors.ts (services/cytology/). */
  hpvGenotypeDetail?: {
    hpv16: boolean;
    hpv18Or45: boolean;
    otherHighRisk: boolean;
  };
  /** Real, per direct correction: the real molecular platform's own
   *  HL7 OBX-8 abnormal flag and OBX-7 reference range, persisted
   *  exactly as received — see HpvResultEventPayload
   *  (types/events/) and processInboundHpvResultEvent.ts
   *  (services/hl7/) for the real, inbound ingestion path that sets
   *  these. Never set by manual UI entry — a real, inbound-only pair. */
  hpvAbnormalFlag?: 'A' | 'N';
  hpvReferenceRange?: string;
  /** Real, per direct guidance's own South Korea information: HPV
   *  testing outside KNCSP's own free public program (which offers
   *  conventional Pap only, no HPV) genuinely serves distinct clinical
   *  purposes — co-testing, real ASC-US reflex/secondary triage, and
   *  post-treatment surveillance — that the system should represent
   *  as real clinical context, not leave indistinguishable from one
   *  another. Optional, per direct guidance — the triage logic
   *  (resolveCytologyTriageState.ts) does not depend on this field;
   *  it exists purely for real clinical accuracy and reporting. */
  hpvOrderReason?: 'co_test' | 'ascus_reflex' | 'post_treatment_surveillance';
  /** Real, per direct guidance: "a separate Batch Management [for
   *  molecular testing]... it will need to associate QA to the
   *  specimens in their test run locations. Using the engine to
   *  translate." Real FK to MolecularQcRunRecord.id
   *  (IMolecularQcRunRecordService.ts) — which real batch/instrument
   *  run this specimen's own HPV result came from, so a specimen's
   *  own QC context (instrument, reagent lot, control performance) is
   *  traceable, not just its final interpreted result. Set only by
   *  the real, inbound molecular batch event
   *  (processInboundMolecularBatchEvent.ts, services/hl7/) — same
   *  "never set by manual UI entry" posture as hpvAbnormalFlag/
   *  hpvReferenceRange above, since a batch assignment is a real fact
   *  the sending molecular platform's own interface reports, not
   *  something a user selects. */
  molecularRunId?: string;
  /** Real, per direct follow-up closing PS-211's own, precisely-named
   *  remaining gap: CytologyHighRiskFactors.abnormalExamFindings
   *  bundles a real structural finding (a visible lesion/mass — see
   *  resolveAbnormalExamFindingsFactorFromEncounters.ts, which
   *  resolves that half from real inbound ICD-10 encounter data) with
   *  a real, genuinely different thing — "persistent contact bleeding
   *  during specimen collection." That second half is, by definition,
   *  a real-time observation made DURING the current collection —
   *  there is no prior encounter that could ever have coded it, since
   *  it hadn't happened yet. This is the real, honest, only-possible
   *  source for that specific half: the collecting clinician's own,
   *  manual observation, recorded at accessioning — same "Cytology —
   *  Clinical History & Accessioning Detail" pattern this app's other
   *  collection-time cytology fields already use (Phase 41). Optional
   *  and undefined by default — never inferred, never defaulted to
   *  false as if the question had genuinely been asked and answered
   *  "no." */
  persistentContactBleedingAtCollection?: boolean;
  /** Real, per CAP's own mandatory "5-Year Retrospective Lookback"
   *  requirement (CYT-QA-03, per direct guidance's own supplied QA
   *  report specification): whenever a patient is newly diagnosed
   *  HSIL+/AIS/malignant, every one of their own real, prior
   *  NEGATIVE/benign GYN cytology results from the preceding 5 years
   *  must be pulled and re-reviewed, to catch a real, possibly missed
   *  early finding. Genuinely different from `qcFlag` above — that
   *  field gates an UPCOMING sign-out; this flags an
   *  ALREADY-SIGNED-OUT specimen for a real, separate, later
   *  retrospective re-review, never a pre-release gate on a specimen
   *  whose report has already been finalized and released. See
   *  resolveCytologyFiveYearRetrospectiveLookback.ts
   *  (services/cytology/) for the real trigger/selection logic. */
  retrospectiveReviewFlag?: {
    reason: 'five_year_lookback_on_new_high_grade_diagnosis';
    triggeredByCaseId: string;
    triggeredBySpecimenId: string;
    triggeredAt: string;
    /** Real, per direct guidance's own required outcome categories —
     *  undefined until a real reviewer actually performs the
     *  retrospective re-review and records a real, completed outcome. */
    outcome?: 'confirmed_negative' | 'screening_error' | 'interpretation_error' | 'sampling_error';
    /** Real, per direct guidance's own requirement: "Mandatory
     *  documentation of CT retraining or amended report issued" —
     *  free text, since the specific corrective action taken is not a
     *  closed, enumerable set. */
    correctiveAction?: string;
    reviewedBy?: string;
    reviewedByName?: string;
    reviewedAt?: string;
  };
  /** Real, per direct guidance: post-sign-out peer review mirrors the
   *  pre-sign-out QC split exactly — "using both mechanisms...
   *  is the standard industry practice," combining random baseline
   *  sampling (CLIA's own documented-QA-program requirement) with
   *  targeted review of high-risk categories (CAP's own mandate for
   *  "initial cancer diagnoses"). Real, deliberate shape reuse: same
   *  `reason` field and same two values as `qcFlag` above, per direct
   *  guidance's own "reusing your existing qc_random_selection and
   *  qc_targeted_high_risk logic keeps the system architecture
   *  consistent" — this is the real, distinguishing `sampling_type`
   *  direct guidance asked for, named the same way the existing,
   *  established field already is rather than introducing a second,
   *  differently-named field for the identical real concept. Cleared
   *  by a matching real `post_signout_peer_review_random` or
   *  `post_signout_peer_review_targeted` CytologyReviewRecord — see
   *  resolveCytologyPostSignOutPeerReviewPoolMembership.ts. Genuinely
   *  different real event from `retrospectiveReviewFlag` above: this
   *  is a routine, ongoing QA sample of signed-out cases in general;
   *  that one is a one-time, triggered lookback specifically prompted
   *  by a new high-grade diagnosis on the same patient. */
  postSignOutPeerReviewFlag?: {
    reason: 'random_selection' | 'targeted_high_risk';
    flaggedBy: string;
    flaggedByName: string;
    flaggedAt: string;
  };
  /** Real, per direct guidance: CYT-QA-04 (Cyto-Histologic Correlation
   *  and Discrepancy Matrix). Real, honest scope, found by direct
   *  investigation before building anything: surgical pathology's own
   *  diagnosis (Case.diagnostic.primaryDiagnosis) is free text, not a
   *  structured, ranked category the way cytology's own
   *  diagnosticRank is — there is no honest way to compute this
   *  correlation automatically. What real, mechanical case-selection
   *  CAN do — find which of this patient's other real cases are
   *  plausible candidates to correlate against — is what this field
   *  records; see resolveCytologyHistologyCorrelationCandidates.ts.
   *  A real human reviewer confirms relevance and records the actual
   *  comparison via the existing, already-seeded "Cytology-Histology
   *  Correlation" QaActivityType (qa-activity-cyto-histo) — this field
   *  only tracks that a real candidate was found and whether that has
   *  happened yet. */
  histologyCorrelationCandidates?: {
    candidateCaseId: string;
    detectedAt: string;
    /** Real FK to the QaActivityRecord a human reviewer created once
     *  they confirmed and recorded the actual correlation for this
     *  specific candidate — undefined until that happens. */
    recordedActivityRecordId?: string;
    /** Real, per direct follow-up wiring the recording UI: this app's
     *  own candidate detection is deliberately approximate (any
     *  subsequent case with a non-cytology specimen — see
     *  resolveCytologyHistologyCorrelationCandidates.ts's own header)
     *  — a real human reviewer may confirm a given candidate was never
     *  the relevant biopsy at all. A real, separate, honest field for
     *  that outcome, never a fabricated recordedActivityRecordId value
     *  standing in for "dismissed" — that field is a real FK and
     *  nothing else. */
    dismissedAsNotRelevant?: boolean;
  }[];
  /** Real, per direct guidance's own Step 4 ask ("ROSE / Bedside
   *  Evaluations Queue") — zero or more real Rapid On-Site
   *  Evaluations performed for this specimen. Undefined for a real
   *  specimen with no ROSE ever performed — genuinely different from
   *  an empty array. See types/cytology/CytologyRoseEvaluation.ts for
   *  the full, real shape. */
  roseEvaluations?: CytologyRoseEvaluation[];
  /** Bethesda's own real, optional "Educational Notes and Suggestions"
   *  report component — free text, not a structured category. */
  educationalNotes?: string;
  /** Real, per direct guidance's own standard report structure (§2,
   *  Specimen Type): "State whether the specimen is a Liquid-Based
   *  Cytology (LBC) preparation... or a Conventional Pap Smear." */
  preparationMethod?: 'Liquid-Based' | 'Conventional';
  /** Real, per direct guidance's own standard report structure (§6,
   *  Adjunctive Testing): "If an automated imaging system... was used
   *  in screening, this must be explicitly documented." */
  computerAssistedScreening?: { used: boolean; system?: string };
}

/**
 * Real, per direct guidance: the explicit Final Diagnosis selection —
 * which CytologyReviewRecord is authoritative for the report, and a
 * SNAPSHOT of what it found. Real, deliberate simplification once
 * every review shares one common, real record type with its own
 * stable id (CytologyReviewRecord.id) — this no longer needs the
 * earlier, more awkward discriminated-union source (a bespoke
 * 'primary'/'pathologist_review' marker alongside a
 * secondaryScreenings-event-id case), since a "primary screen" and a
 * "pathologist review" are now just CytologyReviewRecord entries like
 * any other, identified the same, simple way. Deliberately a snapshot
 * (not a live reference) — the same "snapshot, don't re-derive live"
 * reasoning CytologyReviewRecord.requiresPathologistReview already
 * uses: editing or re-querying the source review after the fact can
 * never silently change what a report already used as its Final
 * Diagnosis. See resolveCytologyFinalDiagnosisSnapshot
 * (services/cytology/) for the real, shared logic that builds this
 * snapshot from a given CytologyReviewRecord.
 */
export interface CytologyFinalDiagnosisSelection {
  /** References the real, immutable CytologyReviewRecord.id this
   *  selection was made from. */
  reviewRecordId: string;
  primaryInterpretationId: string;
  primaryInterpretationComment?: string;
  additionalInterpretations?: CytologyCategorySelection[];
  recommendations?: CytologyCategorySelection[];
  adequacySelections?: CytologyCategorySelection[];
  generalCategorizationId?: string;
  /** Who made this selection, and when — real, per direct guidance's
   *  own framing ("As the System Architect, there needs the
   *  ability..."): this is a real, deliberate, attributable act, not
   *  an automatic default. */
  selectedBy?: string;
  selectedByName?: string;
  selectedAt?: string;
}
