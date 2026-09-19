// src/services/containerTypes/IContainerTypeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, structured container type dictionary — replaces the free-text
// `containerType` string that used to live in AccessionPage.tsx /
// SpecimenEditModal.tsx. That field was completely unconstrained: whatever
// got typed in never drove any downstream logic, despite the real HL7 SPM
// segment builder (services/hl7/segmentBuilders.ts, SPM-27) already
// expecting a real container type value.
//
// Seeded with 9 real, standard APLIS container classifications as
// defaults — same pattern as every other dictionary in this app
// (Departments, Stain Dictionary): full create/edit/deactivate,
// not a fixed list with only description editable. A site's real bench
// may use containers or terminology beyond the 9 standard defaults, and
// should be able to add its own rather than being stuck with only what
// shipped.
//
// systemLogicNotes captures the real, intended downstream behavior for
// each container type (STAT routing, fixation timers, reflex testing,
// billing modifiers) as structured documentation on the dictionary
// entry itself. None of that behavior is wired to anything yet — this
// is the data model and the seeded defaults; actually triggering STAT
// pages, fixation-timer countdowns, or ROSE billing modifiers from a
// container selection is real, separate follow-up work, not something
// this pass silently attempts.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult, ID } from '../types';

export type ContainerCategory = 'histology' | 'cytology' | 'special_media';

export interface ContainerType {
  id: ID;
  name: string;
  /** A site's own bench terminology or brand names layered over the
   *  classification, or free description for a fully custom entry. */
  description: string;
  category: ContainerCategory;
  /** What specimen type/category this container is typically used for
   *  — e.g. "Biopsy (Core, Punch, Endoscopic)". */
  aplisMapping: string;
  /** Documented intended behavior — not yet wired to real logic. See
   *  file header. */
  systemLogicNotes: string;
  status: 'Active' | 'Inactive';
  /** Real, per direct guidance's own recommended ProcessingContainer
   *  attributes — numeric capacity in mL. Undefined for a container
   *  whose real capacity genuinely varies or isn't meaningfully fixed
   *  (a biohazard bag, a custom site container) — never a fabricated
   *  number to fill the field. */
  capacityMl?: number;
  /** Real, per direct guidance — references
   *  FixativeDictionaryEntry.id (services/protocols/IPathwayMaterialDictionaryService.ts),
   *  the same real fixative catalog ProtocolPathway.fixativeType now
   *  draws from. Nullable/undefined for a genuinely dry or non-fixing
   *  container (a fresh/dry specimen bag, an RPMI transport tube) —
   *  never defaulted to a fixative that container doesn't actually
   *  contain. */
  defaultFixativeId?: string;
  /** Real, per direct guidance — whether this container ships
   *  pre-filled with its own default fixative (true) or is filled at
   *  the bench/by the collector (false/undefined). Only meaningful
   *  alongside a real defaultFixativeId; a container with no default
   *  fixative at all is neither prefilled nor bench-filled with one. */
  isPrefilled?: boolean;
  /** Real, per direct request: "Each Performing Lab will want their own
   *  types. If Performing Lab not defined, it is available for
   *  everyone." Same field-name convention and same null/undefined =
   *  inherit/global shape as Facility.idleTimeoutMinutesOverride and
   *  the other performing-lab-scoped settings in
   *  services/facilities/IFacilityService.ts — not the separate
   *  scope-discriminator shape ExternalResourcesSection.tsx uses,
   *  since this field being unset (not a separate flag) is what "not
   *  defined" refers to here. A real Facility id, scoped to facilities
   *  with the 'performing_lab' role — see resolvePerformingLabFacilityId()
   *  for the established resolution convention this mirrors. Name and
   *  aplisMapping uniqueness are both scoped by this field: two
   *  different labs' own types may share a name; two entries within
   *  the same lab (including two global entries) may not. */
  performingLabFacilityId?: string;
}

export interface IContainerTypeService {
  getAll(): Promise<ServiceResult<ContainerType[]>>;
  getById(id: ID): Promise<ServiceResult<ContainerType>>;
  create(draft: Omit<ContainerType, 'id'>): Promise<ServiceResult<ContainerType>>;
  update(id: ID, changes: Partial<Omit<ContainerType, 'id'>>): Promise<ServiceResult<ContainerType>>;
  deactivate(id: ID): Promise<ServiceResult<ContainerType>>;
  reactivate(id: ID): Promise<ServiceResult<ContainerType>>;
}
