// src/services/protocols/IProtocolService.ts
// ─────────────────────────────────────────────────────────────
// Protocols as their own standalone, referenceable dictionary —
// deliberately NOT embedded on SpecimenEntry. Real lab reality: wildly
// different specimen types (gallbladder, appendix, a benign skin
// shave, an antral gastric biopsy) frequently share the exact same
// processing workflow ("Standard Small Biopsy — 1 block, 1 H&E").
// Embedding a protocol per specimen type means updating a shared
// routine requires editing every specimen type that happens to use it,
// with zero connection between the copies once they exist — this
// dictionary exists specifically so a lab manager updates the one
// master Protocol and it cascades everywhere that references it.
//
// SpecimenEntry now only carries an optional protocolId reference
// (Config/System/specimenTypes.ts) — "what the tissue is" stays
// separate from "how the lab processes it," per the actual reasoning
// this migration was built from.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface ProtocolPathway {
  id: string;
  /** e.g. "Light Microscopy", "Immunofluorescence", "Electron Microscopy" —
   *  shown to users as "Track" (Track 1, Track 2...), per the naming
   *  clarified when this was still embedded: "Protocol" is reserved for
   *  the outer container, "Track" for each branch inside it. */
  pathwayName: string;
  /**
   * Real, architectural fix, per direct follow-up's own Hybrid Model:
   * "ProtocolPathway drives execution: The pathway definition always
   * dictates whether a block or decant entity is instantiated." A real,
   * genuine gap found while wiring "decant-level linking UI" —
   * accessioning's own pathway-driven material generation
   * (AccessionPage.tsx) previously ALWAYS produced a real
   * HistologyBlock, regardless of specimen type, completely bypassing
   * Decant even for a real, configured fluid/cytology protocol. Real
   * confirmed reasoning for why this lives per-pathway, not per-
   * protocol: "fluid processing often diverges within the same
   * protocol... a pleural fluid specimen protocol might require a
   * cell block pathway... alongside a direct smear or cytospin
   * pathway" — a single protocol can genuinely need both kinds of
   * track. Required, not optional/defaulted — the pathway must always
   * make this real, explicit choice (see the other half of the Hybrid
   * Model — Department only pre-selects a sensible default in
   * the admin UI at configuration time; it never substitutes for this
   * field at runtime).
   */
  materialKind: 'block' | 'decant';
  /** Free text, deliberately not a rigid enum — real fixative naming
   *  varies (e.g. "Michel's Transport Medium" vs. "Michel's medium"),
   *  and a closed enum would just force awkward mapping later. */
  fixativeType: string;
  requiresDecal: boolean;
  decalDefaultDurationMins?: number;
  /** e.g. "Standard", "Megablock", "Frozen Block", "Resin Grid" — same
   *  free-text reasoning as fixativeType. */
  processingFormat: string;
  tasks: PathwayTask[];
  /** Real, additive — per the Protocol-Driven Workflow Infrastructure
   *  story. How many blocks (materialKind: 'block') or decants
   *  (materialKind: 'decant') generateDefaultMaterial.ts should
   *  instantiate for this pathway at accession. Undefined behaves
   *  exactly as today — one block/decant per pathway — so no existing
   *  protocol needs this field to keep working unchanged. */
  defaultCount?: number;
  /** Real, additive — pre-populates HistologyBlock.pieceCount on each
   *  block this pathway generates, so the Grossing Screen shows an
   *  expected piece count instead of blank. Undefined leaves
   *  pieceCount unset, same as today. Only meaningful for
   *  materialKind: 'block' pathways. */
  defaultPieceCount?: number;
  /** Real, additive — restricts the Grossing Screen's "Add Stain"
   *  dropdown (per-block) to this real subset of the Stain Dictionary
   *  (StainType.id), so a tech can't add an arbitrary stain outside
   *  what this pathway's protocol actually allows. Undefined means no
   *  restriction — every StainType remains selectable, same as today. */
  allowedAdditionalStainTypeIds?: string[];
}

export interface PathwayTask {
  id: string;
  stepOrder: number;
  /** e.g. "Cut Level 1", "Frozen Section", "Ultra-thin Sectioning" */
  action: string;
  /** References into the real Stain Dictionary (StainType.id) — not
   *  stain name strings. */
  stainTypeIds: string[];
  slideCount?: number;
  /** Explicit held/reserved level — e.g. "Level 5 (Hold)" with nothing
   *  ordered on it yet. Was previously implicit (an empty stainTypeIds
   *  array with no other signal); made explicit so a genuinely-held
   *  step is never confused with a step someone just forgot to fill in. */
  isHold?: boolean;
  /** Real, additive — per the Protocol-Driven Workflow Infrastructure
   *  story's outbound molecular order queue (services/molecularOrders/
   *  IMolecularOrderOutboundQueueService.ts). When true, this task's
   *  assay (from stainTypeIds) automatically fires an 'order.molecular'
   *  outbound queue entry at accession — e.g. the HPV co-test firing
   *  automatically for a ThinPrep specimen whose protocol has
   *  st-hpv-reflex configured on this task. Undefined/false: no
   *  outbound order fires for this task, same as today. */
  sendOutboundOrder?: boolean;
}

export interface ProtocolHistoryEntry {
  version: number;
  /** Full snapshot of the protocol as it existed at this version,
   *  before the edit that superseded it. */
  snapshot: Omit<Protocol, 'history'>;
  savedBy: string;
  savedAt: string;
}

export interface Protocol {
  id: ID;
  name: string;
  description?: string;
  /** Real, per direct follow-up (PS-73/PS-75): "Performing Lab is going
   *  to be a fixture" for how enterprise customers scope their own
   *  dictionary items — same field, same convention, as
   *  ContainerTypesSection.tsx/ISubspecialtyService.ts/etc.
   *  (utils/performingLabs.ts). Undefined means global — available to
   *  every performing lab, same as every protocol before this field
   *  existed. Set means this protocol only applies to (and is only
   *  offered to) that one Facility — real reasoning: processing
   *  protocols (fixation, embedding, track structure) genuinely vary
   *  by performing lab in a real multi-site enterprise, not just by
   *  specimen type. Name-uniqueness (validateUnique.ts's
   *  findDuplicate()) is scoped by this field + name together, so
   *  "Medical Renal Protocol" can exist once globally and once more
   *  per lab without colliding. */
  performingLabFacilityId?: string;
  /** Whether specimens using this protocol need a triage decision at
   *  the grossing bench before processing can proceed — e.g. "split
   *  the core into LM/IF/EM portions" for renal. */
  requiresTriage: boolean;
  /** Real, discrete checklist items — not one free-text block. Each
   *  item is something a bench tech could eventually check off one at
   *  a time (connects to the Grossing "confirm triage" voice command
   *  built earlier). */
  triageChecklist?: string[];
  pathways: ProtocolPathway[];
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
  /** Snapshots of every prior version, most recent last. Populated by
   *  update() just before applying a change — a protocol only
   *  accumulates history once it's actually been edited at least
   *  once, so this stays empty/undefined for anything untouched
   *  since history tracking was added. */
  history?: ProtocolHistoryEntry[];
}

export interface IProtocolService {
  getAll(): Promise<ServiceResult<Protocol[]>>;
  add(entry: Omit<Protocol, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<Protocol>>;
  update(id: ID, changes: Partial<Omit<Protocol, 'id'>>): Promise<ServiceResult<Protocol>>;
  /** Restores a protocol to an earlier version's snapshot — itself
   *  recorded as a new version (with its own history entry), not a
   *  destructive rewrite, so restoring is always itself undoable. */
  restoreVersion(id: ID, version: number): Promise<ServiceResult<Protocol>>;
}
