// src/services/reagentLots/IReagentLotService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct requirements ("PathScribe Stain & Quality Control Module")
// §2.1 "Reagent, Kit, and Solution Lot Tracking": "The system shall maintain
// a backend Reagent and Solution Lot Registry capturing details for IHC
// antibodies, special stain kits, and routine H&E stainer line reagents
// (Lot Numbers, Expiration Dates, and Active Status)."
//
// Real, deliberate architecture decision, made after directly comparing this
// against services/molecular/'s own MolecularReagentLot (see that module's
// own header) and the given requirements' own explicit wording: molecular
// treats a reagent lot as a lightweight record RE-DECLARED per batch, with
// no independent identity of its own. The given spec explicitly asks for a
// "Registry" — a real, standalone dictionary with its own lifecycle,
// created once and referenced by many later runs, matching this app's own
// established dictionary pattern (DeficiencyType, ContainerType, the
// Fixative/ProcessingFormat catalogs) far more closely than molecular's own
// embedded-per-batch shape. Built as its own new service rather than
// generalizing MolecularReagentLot, or bolting onto StainType itself (a lot
// is a real, physical inventory instance with its own expiration and QC
// history — StainType is the catalog DEFINITION of what can be ordered,
// never the physical reagent stock behind it).
//
// Real, direct comparison against StainType's own real vendor/antibodyClone
// fields (services/stains/IStainService.ts) before designing this: IHC
// antibodies and special stain kits are already real, orderable StainType
// entries (category 'IHC'/'Special Stain') — a lot for either of those
// genuinely IS "the physical stock of that catalog stain," so stainTypeId
// below is the real FK for both. Routine H&E stainer LINE reagents
// (hematoxylin, eosin, bluing reagent, differentiator, graded alcohols,
// clearant) are a real, different case: H&E itself is one orderable
// StainType (category 'Routine'), but the automated line runs many
// separate physical reagent stations to produce it, none of which is its
// own orderable catalog entry — same real distinction molecular's own
// MOLECULAR_REAGENT_COMPONENT_TYPES draws for its own line components
// (EXTRACTION_BUFFER, MASTER_MIX, etc., none of which is an "assay" a
// caller orders). routineComponentType below is the equivalent, closed set
// for this domain. A lot is one or the other, never honestly both — same
// discriminated-union posture MolecularWell already established for
// controlInfo vs. specimen fields.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** Real, closed set for the real, physical reagent stations an
 *  automated H&E line runs that are not themselves an orderable
 *  StainType — see this file's own header for the full reasoning.
 *  Not exhaustive of every real vendor's own line configuration, but
 *  the standard, real stations shared across the automated H&E
 *  platforms this app's own stain/processing docs already reference. */
export const ROUTINE_STAIN_COMPONENT_TYPES = [
  'HEMATOXYLIN', 'EOSIN', 'BLUING_REAGENT', 'DIFFERENTIATOR', 'DEHYDRANT_ALCOHOL', 'CLEARANT_XYLENE', 'MOUNTING_MEDIUM',
] as const;
export type RoutineStainComponentType = typeof ROUTINE_STAIN_COMPONENT_TYPES[number];

/** Real, per the given requirements' own explicit "current QC status
 *  (Pending, Passed, Failed)" wording — a real, standalone status on
 *  the lot itself (this registry entry), distinct from
 *  ContainerType/DeficiencyType's own separate 'Active'/'Inactive'
 *  status below: a lot can be QC-Passed yet still Inactive (used up,
 *  superseded by a newer lot), or newly received and Pending while
 *  still Active (available, awaiting its own initial verification).
 *  Neither status implies the other. */
export type ReagentLotQcStatus = 'Pending' | 'Passed' | 'Failed';

export interface ReagentLot {
  id: ID;
  /** Real FK to StainType.id — set for an IHC antibody or special
   *  stain kit lot. Exactly one of this and routineComponentType is
   *  set, never both, never neither. */
  stainTypeId?: string;
  /** Set for a routine H&E stainer LINE reagent with no orderable
   *  StainType of its own. See this file's own header. */
  routineComponentType?: RoutineStainComponentType;
  lotNumber: string;
  expirationDate: string;
  vendor?: string;
  qcStatus: ReagentLotQcStatus;
  /** Real, per the given requirements' own explicit "Active Status" —
   *  whether this lot is currently in use / offered for selection at
   *  the bench. See qcStatus's own doc comment above for why this is
   *  a genuinely separate concept, not a derived/mirrored value. */
  status: 'Active' | 'Inactive';
  /** Same Global/scoped convention as ContainerType/DeficiencyType's
   *  own performingLabFacilityId — undefined means available to every
   *  performing lab; set means this lot is this one lab's own real,
   *  physical stock, not a shared catalog entry. Reagent inventory is
   *  a genuinely per-site concern — one lab's Ki-67 lot says nothing
   *  useful about another lab's own stock on hand. */
  performingLabFacilityId?: string;
  receivedDate?: string;
  createdAt: string;
  createdBy: string;
}

export interface IReagentLotService {
  getAll(): Promise<ServiceResult<ReagentLot[]>>;
  getById(id: ID): Promise<ServiceResult<ReagentLot>>;
  create(draft: Omit<ReagentLot, 'id' | 'createdAt'>): Promise<ServiceResult<ReagentLot>>;
  update(id: ID, changes: Partial<Omit<ReagentLot, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<ReagentLot>>;
  deactivate(id: ID): Promise<ServiceResult<ReagentLot>>;
  reactivate(id: ID): Promise<ServiceResult<ReagentLot>>;
}
