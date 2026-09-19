// src/services/protocols/IPathwayMaterialDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct challenge ("why is processingFormat free text when
// they are all known commodities?") and its own direct follow-up
// ("I'm just not a huge fan of using free text that may ultimately be
// used to determine workflow... fixativeType has the same underlying
// problem") — two real, closed, catalog-backed dictionaries,
// mirroring services/stains/IStainService.ts's own established
// {id, name, ..., active, version, updatedBy, updatedAt} shape and
// getAll/add/update contract exactly, rather than inventing a new
// pattern. Real, deliberate: ProtocolPathway.fixativeType/processingFormat
// keep their existing field names and string type — this is a data-
// quality fix (validated at entry time, against a real, admin-managed
// catalog, never freely typed) rather than an ID-reference migration
// across every consumer of those fields.
//
// Real, direct reasoning for the split into two catalogs rather than
// one shared "pathway reference data" list: fixatives and processing
// formats answer genuinely different real questions (what chemical
// preserves the tissue, vs. what physical cassette format holds it),
// have different real cardinality (a wide, genuinely varied
// commercial catalog vs. four known formats), and different real
// per-entry attributes (a fixative's own hazard/default-selection
// flags have no equivalent for a processing format).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type FixativeCategory = 'Surgical' | 'Cytology' | 'Transport Media' | 'EM';
export type FixativeRegulatoryStatus = 'Active' | 'Restricted' | 'Phased Out';

export interface FixativeDictionaryEntry {
  id: ID;
  /** Short, stable code (e.g. "NBF10", "CYTOLYT", "MICHEL") — never
   *  shown to a pathologist/tech directly; exists for integration/
   *  export contexts that want a stable short key rather than the
   *  full display name. */
  code: string;
  name: string;
  category: FixativeCategory;
  description?: string;
  /** Real, per direct refinement ("OCT... is_fixative = false...
   *  water-soluble glycols/resins matrix used solely to support
   *  specimen freezing, not chemical cross-linking") — defaults to
   *  true (every entry before this field existed was a genuine
   *  fixative); explicitly false only for a real, non-fixing entry
   *  like OCT compound that belongs in this same catalog for
   *  workflow purposes but chemically does something different. */
  isFixative?: boolean;
  /** Real, per direct refinement ("a regulatory_status... Active,
   *  Restricted, Phased_Out... will cleanly handle these distinct
   *  entries") — undefined/omitted means 'Active' (every entry before
   *  this field existed remains fully usable); only ever set to
   *  'Restricted'/'Phased Out' for a real, named case like B-5's own
   *  mercuric-disposal restriction. Deliberately does NOT hide or
   *  block selection of a Restricted/Phased Out entry — a lab that
   *  still legitimately uses B-5 under local rules can still select
   *  it; this is a real, visible flag for the picker, not an enforced
   *  gate this dictionary itself has any authority to impose. */
  regulatoryStatus?: FixativeRegulatoryStatus;
  /** Real, direct use: replaces the old hardcoded '10% Neutral
   *  Buffered Formalin' literal in ProtocolDictionarySection.tsx's own
   *  emptyPathway() — a new pathway's own default fixative is now
   *  whichever real entry has this set, resolved dynamically against
   *  the live catalog rather than a string baked into the UI. At most
   *  one entry should genuinely have this set per category in
   *  practice, though nothing in this type mechanically enforces
   *  that. */
  isDefault?: boolean;
  /** Real, direct use: a real, visible hazard indicator in the
   *  fixative picker for genuinely toxic/mercuric/carcinogenic
   *  reagents (B-5's mercuric chloride, Bouin's picric acid,
   *  glutaraldehyde, Carnoy's chloroform) — never inferred from the
   *  fixative's own name or category, since plenty of real Surgical-
   *  category fixatives (NBF) carry no such warning at all. */
  requiresWarningLabel?: boolean;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface IFixativeDictionaryService {
  getAll(): Promise<ServiceResult<FixativeDictionaryEntry[]>>;
  add(entry: Omit<FixativeDictionaryEntry, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<FixativeDictionaryEntry>>;
  update(id: ID, changes: Partial<Omit<FixativeDictionaryEntry, 'id'>>): Promise<ServiceResult<FixativeDictionaryEntry>>;
}

export interface ProcessingFormatDictionaryEntry {
  id: ID;
  name: string;
  description?: string;
  /** Real, direct use — same reasoning as
   *  FixativeDictionaryEntry.isDefault: replaces the old hardcoded
   *  'Standard' literal in ProtocolDictionarySection.tsx's own
   *  emptyPathway(). */
  isDefault?: boolean;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface IProcessingFormatDictionaryService {
  getAll(): Promise<ServiceResult<ProcessingFormatDictionaryEntry[]>>;
  add(entry: Omit<ProcessingFormatDictionaryEntry, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<ProcessingFormatDictionaryEntry>>;
  update(id: ID, changes: Partial<Omit<ProcessingFormatDictionaryEntry, 'id'>>): Promise<ServiceResult<ProcessingFormatDictionaryEntry>>;
}
