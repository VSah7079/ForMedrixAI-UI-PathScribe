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
import type { MolecularTarget, CptMappingRule, MolecularMethodology } from '@/types/billing/MolecularBillingRule';
import type { QcEnforcementMode } from '../workstationGroups/IWorkstationGroupService';

export type StainCategory = 'Routine' | 'Special Stain' | 'IHC' | 'Immunofluorescence' | 'Molecular' | 'Cytology' | 'Other';

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
  /**
   * Real fix, per direct follow-up: resolves the one real question
   * defaultBillingCode's own doc comment above left open. A stain with
   * its own configured billing code covers two genuinely different real
   * cases, and they need different sequence-counting behavior:
   *   1. A standalone, self-contained billing unit — e.g. "PIN-4," a
   *      multiplex panel (p63/AMACR/CK on one slide) billed as its own
   *      distinct code, not as three separate IHC stains. This was
   *      never really "an IHC stain" in the countable sense — set this
   *      true so it neither gets assigned 88342/88341 itself NOR
   *      consumes a slot in the running count for a later, unconfigured
   *      IHC stain on the same specimen.
   *   2. A single antibody stain billed at its own specific rate for
   *      some other real reason (e.g. a vendor/payer-specific override)
   *      but still, clinically, one real IHC stain — leave this false
   *      (the default) so it still occupies a real position in the
   *      specimen's own IHC sequence for whatever comes after it.
   * Only meaningful when defaultBillingCode is set; ignored otherwise.
   * Default false/undefined preserves the exact behavior this app
   * shipped with before this flag existed — nothing changes for an
   * existing entry unless explicitly opted in. Consumed by
   * suggestAncillaryCodesForStains (services/billing/codeMapTable.ts).
   */
  excludeFromIhcSequenceCounting?: boolean;
  /** Real, per PS-289/PS-292's own Gating Strategy research — the
   *  per-stain override for the post-run QC gate. When set, this
   *  overrides the WorkstationGroup's own instrument-level default
   *  (services/workstationGroups/IWorkstationGroupService.ts) for any
   *  batch running this specific stain — some stains may genuinely
   *  need PathScribe-enforced visual gating regardless of what a
   *  given bench's own default posture is, while others can safely
   *  rely on external verification. Undefined means "no override,
   *  defer entirely to the workstation's own default" — never a
   *  silently-assumed 'Enforced' or 'Auto-Resolve'. Reuses the same
   *  QcEnforcementMode type WorkstationGroup already defines, not a
   *  second, parallel enum for the same real concept. */
  qcEnforcementMode?: QcEnforcementMode;
  /** Real, per PS-289/PS-292's own "batch-manifest scanning with
   *  automatic control-slide appending" piece (original Stain QC
   *  Module spec's own \u00a72.3), per direct clinical guidance: IHC,
   *  target-specific special stains (PAS, GMS, AFB/Ziehl-Neelsen,
   *  Gram, Congo Red, Alcian Blue, Trichrome, Reticulin, silver
   *  stains), and ISH genuinely require a positive control to confirm
   *  target detection/reaction integrity. Routine H&E does not — it
   *  relies on general process QC (instrument/reagent/tech), not a
   *  target-specific control. ISH-category stains in this app's own
   *  real seed data are classified 'Molecular' (e.g. st-her2-fish),
   *  not a separate category — Molecular already runs through its own,
   *  separate MolecularBatch/control-requirement mechanism
   *  (resolveMolecularControlRequirementValidation.ts), never the
   *  generic 'Staining' batch node this field's own consumer
   *  (shouldAutoAppendControl.ts) operates on, so this stays false/
   *  undefined for Molecular-category entries by construction, not by
   *  a separate exclusion rule.
   *
   *  A real, stored, per-stain field rather than a computed category
   *  default, since real exceptions exist within "Special Stain" too
   *  (some connective-tissue stains carry their own real, internal
   *  tissue control and genuinely don't need a separate one) — an
   *  admin sets this explicitly per stain, including those real
   *  exceptions, rather than inheriting a category-wide assumption
   *  that would misfire on them. Governs whether this stain's own
   *  post-run sign-out gate applies at all (resolveStainQcGate.ts's
   *  own 'not-applicable' outcome when unset) — genuinely separate
   *  from allowControlAutoAppend below, which governs a different,
   *  earlier-stage question (whether the system creates the control
   *  ITEM automatically). Undefined means false — never a silently-
   *  assumed control requirement for an unconfigured stain. */
  requiresTargetControl?: boolean;
  /** Real, per direct follow-up refining the above into two real,
   *  independent toggles rather than one: a stain can genuinely
   *  require a target control (requiresTargetControl: true) while the
   *  lab still wants to suppress automatic slide generation for it —
   *  a custom/lab-developed stain relying on a real, internal tissue
   *  control, or one the lab's own SOP allocates manually rather than
   *  through this system. Only meaningful when requiresTargetControl
   *  is true; shouldAutoAppendControl.ts checks both together
   *  (requiresTargetControl && allowControlAutoAppend), never either
   *  alone. Undefined means false — never a silently-assumed
   *  auto-append for a stain that hasn't explicitly opted in. */
  allowControlAutoAppend?: boolean;
  /** Real, optional — the real tissue type a lab typically uses as
   *  this stain's own positive control (e.g. "Tonsil", "Appendix",
   *  "Placenta"), pre-filled on the synthetic control case
   *  shouldAutoAppendControl.ts creates. A real, informational default
   *  only — never validated or enforced; a lab's own real control
   *  tissue choice for a specific run can differ. */
  defaultControlTissueType?: string;
  /** Real, per direct guidance ("the stain dictionary could also store
   *  process requests like FISH... build for general molecular
   *  pathology out of the box") - only meaningful when category is
   *  'Molecular'. The real, default target set this test starts with
   *  when ordered (e.g. HER2 FISH defaults to [ERBB2, CEP17]) - copied
   *  onto the real order at order time (StainOrder.selectedTargets),
   *  then freely editable there; this dictionary entry's own array
   *  never changes when an individual order's targets are adjusted. */
  defaultTargets?: MolecularTarget[];
  /** Real, per direct guidance's own worked CPT logic - only
   *  meaningful when category is 'Molecular'. How StainOrder.
   *  selectedTargets.length resolves to real billingCode(s)+units -
   *  see calculateMolecularUnits.ts. */
  billingRule?: CptMappingRule;
  methodology?: MolecularMethodology;
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
