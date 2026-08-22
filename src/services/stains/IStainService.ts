// src/services/stains/IStainService.ts
// ─────────────────────────────────────────────────────────────
// Three related but orthogonal concepts, per the design discussion this
// was built from:
//   - StainType: what stain (H&E, PAS, GMS, Ki-67, p63/CK5/6 Dual Stain...)
//   - SectioningProtocol: how the block is cut (Single Level, Level x 3,
//     Serial Sections, Deep Cuts...)
//   - StainOrderMacro: a quick-order preset composing ONE of each into a
//     single one-click intent ("H&E x 3") for the ordering UX — without
//     merging the two dimensions in the underlying data. A macro is a
//     convenience pointer, not a third independent concept; deleting one
//     never deletes the StainType/SectioningProtocol it points to.
//
// This is the stain CATALOG only — not the Block/Slide structural model
// (Block as a first-class entity attached to a Specimen) that was
// explicitly paused pending a verified Vantage integration spec. This
// catalog is a genuine prerequisite for that model regardless of what
// that spec eventually says, which is why it's being built now instead
// of waiting.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type StainCategory = 'Routine' | 'Special Stain' | 'IHC' | 'Immunofluorescence' | 'Molecular' | 'Other';

export interface StainType {
  id: ID;
  name: string;
  category: StainCategory;
  description?: string;
  /** Only meaningful for IHC — the specific antibody clone used, e.g.
   *  "30-9" for Ki-67, "SP142" for PD-L1. Distinct stains targeting the
   *  same antigen can use different clones with different clinical
   *  performance characteristics, so this isn't optional metadata for
   *  IHC entries — it's part of what makes the order specific. */
  antibodyClone?: string;
  vendor?: string;
  /**
   * Real fix, per direct guidance (Charge Capture work): PathScribe does
   * not store raw CPT codes on StainType — CPT codes/RVUs/payer rules/
   * country rules all change over time and vary by jurisdiction, and the
   * Billing Dictionary (services/billing — see BillingDictionaryEntry)
   * is the one authoritative source of that data, not this catalog.
   * What a StainType genuinely needs to express is narrower: "this stain
   * has its own special billing behavior, distinct from the generic
   * IHC first/additional rule." References a BillingDictionaryEntry.billingCode
   * (e.g. 'PIN4-PANEL'), never a bare CPT string directly — a real
   * multiplex panel (e.g. "PIN-4", three antibodies on one slide,
   * billed 88344 as its own thing, not as three separate IHC stains
   * under the generic rule) is the real case this exists for, but it's
   * general: any stain whose own dictionary-configured billing code
   * should win over the generic per-specimen IHC counting sequence in
   * suggestAncillaryCodesForStains (services/billing/codeMapTable.ts).
   * Renamed from the old defaultCptCode (which stored a raw CPT string
   * directly) for exactly the reason above — not a coexisting field,
   * a straight replacement; every real call site updated accordingly.
   */
  defaultBillingCode?: string;
  /** Rough turnaround estimate — informational only, not a hard TAT rule
   *  (that's TATConfigSection's job, a separate, already-built system;
   *  this is just a per-stain default hint shown at order time). */
  defaultTurnaroundHours?: number;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface SectioningProtocol {
  id: ID;
  name: string;
  description?: string;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface StainOrderMacro {
  id: ID;
  label: string;
  stainTypeId: ID;
  sectioningProtocolId: ID;
  sortOrder: number;
  active: boolean;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface IStainTypeService {
  getAll(): Promise<ServiceResult<StainType[]>>;
  add(entry: Omit<StainType, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<StainType>>;
  update(id: ID, changes: Partial<Omit<StainType, 'id'>>): Promise<ServiceResult<StainType>>;
}

export interface ISectioningProtocolService {
  getAll(): Promise<ServiceResult<SectioningProtocol[]>>;
  add(entry: Omit<SectioningProtocol, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<SectioningProtocol>>;
  update(id: ID, changes: Partial<Omit<SectioningProtocol, 'id'>>): Promise<ServiceResult<SectioningProtocol>>;
}

export interface IStainOrderMacroService {
  getAll(): Promise<ServiceResult<StainOrderMacro[]>>;
  add(entry: Omit<StainOrderMacro, 'id' | 'version' | 'updatedBy' | 'updatedAt'>): Promise<ServiceResult<StainOrderMacro>>;
  update(id: ID, changes: Partial<Omit<StainOrderMacro, 'id'>>): Promise<ServiceResult<StainOrderMacro>>;
}
