// src/services/workstationGroups/IWorkstationGroupService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289 ("Batch Management needs a first-class Workstation
// Group / Functional Area structure") and its own extended comment
// thread — full design history lives there, not repeated in full here.
//
// Resolves the real, pre-existing gap: ScanStation.workflowStage
// (services/scanStations/IScanStationService.ts) is guided free text
// on an individual station record, not a first-class entity — no real
// screen or query today answers "show me everything in my lab's
// Embedding group" as one coherent thing.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** Real, per PS-289's own comment thread — an extensible registry,
 *  not a flat, single functionalArea list trying to cover every
 *  domain at once. HISTOLOGY/CYTOLOGY/MOLECULAR ship with real,
 *  populated functional areas below. AUTOPSY is included as a valid
 *  value — reserving the name — but deliberately ships with an EMPTY
 *  functional-area set: PS-261 (Autopsy Pathology Module) says
 *  directly that no autopsy workflow module exists yet and its own
 *  scoping is "intentionally deferred." Per direct follow-up, autopsy
 *  carries genuinely different regulatory concerns (forensic chain-
 *  of-custody, PAD/FAD turnaround tracking) and a meaningfully more
 *  involved grossing procedure than a standard surgical-pathology
 *  bench — so whether Autopsy even belongs inside this same entity,
 *  once scoped, is PS-261's own decision to make, not one inherited
 *  from here. */
export const WORKSTATION_DISCIPLINES = ['HISTOLOGY', 'CYTOLOGY', 'MOLECULAR', 'AUTOPSY'] as const;
export type WorkstationDiscipline = typeof WORKSTATION_DISCIPLINES[number];

/** Real, per PS-289 — Histology reuses the exact, already-established
 *  SCAN_STATION_WORKFLOW_STAGES vocabulary
 *  (services/scanStations/IScanStationService.ts) verbatim, rather
 *  than inventing a second, parallel list for the same real thing.
 *  'Other' is deliberately excluded here — it's a real, valid
 *  free-text escape hatch on an individual ScanStation, not a real,
 *  namable functional area a group of stations organizes around. */
export const HISTOLOGY_FUNCTIONAL_AREAS = [
  'Accessioning', 'Grossing', 'Processing', 'Embedding', 'Microtomy / Sectioning', 'Staining', 'Slide Archival',
] as const;

/** Real, per PS-289's own comment thread — cytology's own, genuinely
 *  different flow (not a smaller version of histology's). */
export const CYTOLOGY_FUNCTIONAL_AREAS = [
  'Specimen Receipt', 'Decant / Prep', 'Screening', 'Cytology Sign-Out',
] as const;

/** Real, per PS-289's own comment thread — checked directly against
 *  services/molecular/ before adding: MolecularMovementRecord.stationId
 *  is already documented as "a real, admin-configured ScanStation
 *  reference," so Molecular already sits on the same real foundation
 *  this whole entity is built on, not a competing concept. */
export const MOLECULAR_FUNCTIONAL_AREAS = [
  'Extraction', 'PCR Setup', 'NGS Library Prep', 'Electrophoresis',
] as const;

/** Real, deliberately empty — see WorkstationDiscipline's own doc
 *  comment above for why. */
export const AUTOPSY_FUNCTIONAL_AREAS = [] as const;

export const FUNCTIONAL_AREAS_BY_DISCIPLINE: Record<WorkstationDiscipline, readonly string[]> = {
  HISTOLOGY: HISTOLOGY_FUNCTIONAL_AREAS,
  CYTOLOGY: CYTOLOGY_FUNCTIONAL_AREAS,
  MOLECULAR: MOLECULAR_FUNCTIONAL_AREAS,
  AUTOPSY: AUTOPSY_FUNCTIONAL_AREAS,
};

/** Real, per PS-289's own comment thread — instrument-level default
 *  for the Stain QC Module's Gating Strategy (PS-292). A StainType-
 *  level field overrides this per-stain; that field does not exist
 *  yet as of this entity's own first pass — see PS-292's own
 *  tracking for that half of the work. */
export type QcEnforcementMode = 'Enforced' | 'Auto-Resolve' | 'Hybrid';

export interface WorkstationGroup {
  id: ID;
  name: string;
  discipline: WorkstationDiscipline;
  /** Real — validated against FUNCTIONAL_AREAS_BY_DISCIPLINE[discipline]
   *  at create/update time, never an arbitrary string. */
  functionalArea: string;
  /** Real, required (unlike the optional performingLabFacilityId on
   *  the Fixative/ProcessingFormat/ContainerType/DeficiencyType
   *  catalogs) — per PS-289's own stated purpose, this entity exists
   *  specifically to close the real, documented facility-scoping gap
   *  (computePendingBatchQueue.ts's own header), not to inherit the
   *  "optional, global-by-default" convention those catalogs use for
   *  a genuinely different reason (shared reference data). */
  performingLabFacilityId: string;
  /** Real, per PS-292's Gating Strategy research — the instrument-
   *  level default enforcement mode. Undefined means no default is
   *  set; a real gating decision (once built) falls back to some
   *  other posture, not silently to 'Enforced' or 'Auto-Resolve'. */
  qcEnforcementMode?: QcEnforcementMode;
  /** Real FK to a future ActionGroup.id (services/actionGroups/ —
   *  not yet built as of this entity's own first pass). Loads
   *  automatically the moment a technician selects a member station —
   *  see PS-289's own comment thread for the full turnaround-time
   *  reasoning. Left as a plain string FK now, rather than waiting for
   *  ActionGroup to exist first, since this field is meaningless
   *  until that entity does and additive either way. */
  defaultActionGroupId?: string;
  allowedActionGroupIds?: string[];
  /** Real FK to a future SystemAction.id — the single action that
   *  fires automatically on the next scan at a member station. */
  defaultActionId?: string;
  /** Real, per PS-289's own follow-up — the future, real in-app route
   *  to this group's own dedicated bench UI (e.g. PS-284/285/286),
   *  once one of those actually gets built. Undefined until then —
   *  never a guess at an existing page that comes closest. */
  dedicatedPageRoute?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  createdBy: string;
}

export interface IWorkstationGroupService {
  getAll(): Promise<ServiceResult<WorkstationGroup[]>>;
  getById(id: ID): Promise<ServiceResult<WorkstationGroup>>;
  /** Real, per direct request ("show me everything in my lab's
   *  Embedding group as one coherent thing") — the actual query this
   *  whole entity exists to make possible. */
  getByFacility(facilityId: string): Promise<ServiceResult<WorkstationGroup[]>>;
  create(draft: Omit<WorkstationGroup, 'id' | 'createdAt' | 'status'>): Promise<ServiceResult<WorkstationGroup>>;
  update(id: ID, changes: Partial<Omit<WorkstationGroup, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<WorkstationGroup>>;
  deactivate(id: ID): Promise<ServiceResult<WorkstationGroup>>;
  reactivate(id: ID): Promise<ServiceResult<WorkstationGroup>>;
}
