// src/services/clinicalHistory/IClinicalHistoryDictionaryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Structured Clinical History Dictionary &
// Accessioning Integration" specification's own User Story 1: "a
// unified Master Clinical History dictionary stored within PathScribe
// and accessible via REST API endpoints." Real, deliberate scope
// decision for this app: no literal REST endpoint exists or is built
// here — this app's own, already-proven architecture is a typed
// service interface + mock implementation the UI calls directly,
// carrying the exact same JSON shape a real backend would use later
// (matching this file's own history_code/category_code/etc. naming
// 1:1 with the spec's own schema) — not a departure from the spec's
// own intent, just this app's own established translation of "REST
// API" into "real, typed service contract."
//
// Real, deliberate placement: services/clinicalHistory/, not
// services/cytology/ — the spec's own title ("Accessioning
// Integration") and its own PRIOR_PATH example (a prior cytology
// result) both confirm this is captured at accessioning for any
// specimen type, not a cytology-only concept, the same real reasoning
// already applied to the DP-vendor dictionary and AI screening
// results.
//
// Real, per direct follow-up ("why is LMP a dictionary?"): a
// dictionary entry is a real, admin-configurable DEFINITION of a
// selectable history item — never a simple, standalone fact like a
// date. Last Menstrual Period stays exactly where it already is
// (Patient.ts), untouched by this file.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { ClinicalHistoryCategoryCode } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

// Real, re-exported for every existing importer of this file — the
// real, canonical definition now lives in
// types/clinicalHistory/RecordedClinicalHistoryEntry.ts (so
// Case.ts/RecordedClinicalHistoryEntry can both use it without a
// types→services dependency), not duplicated here.
export type { ClinicalHistoryCategoryCode };

/** Real, per the spec's own required_metadata_schema concept — the
 *  real, structured field(s) a specific dictionary entry needs
 *  captured when an accessioner selects it (e.g. PRIOR_PATH's own
 *  prior_accession_no/prior_date/prior_diagnosis). Deliberately a
 *  small, closed set of real field types the accession UI can render
 *  generically from — not a full, arbitrary JSON Schema, which this
 *  app has no real use for beyond what these three types cover. */
export type ClinicalHistoryMetadataFieldType = 'text' | 'date' | 'number';

export interface ClinicalHistoryMetadataFieldDef {
  /** Real, per the spec's own example JSON payload — the exact key
   *  this field's value is stored under in a case's own recorded
   *  metadata (e.g. 'prior_accession_number', 'prior_date'). */
  key: string;
  label: string;
  type: ClinicalHistoryMetadataFieldType;
  required: boolean;
}

export interface ClinicalHistoryDictionaryEntry {
  /** Real FK-style identifier — matches the spec's own history_code
   *  exactly (e.g. 'HX_ABNL_CYTO_01'), not a generated UUID, since
   *  this is the real, stable code an interface engine crosswalk
   *  target and an outbound JSON payload both need to reference. */
  id: string;
  displayText: string;
  categoryCode: ClinicalHistoryCategoryCode;
  active: boolean;
  /** Real, per the spec's own specimen_family_filter — which real
   *  specimen families this entry is offered for at accessioning
   *  (User Story 3's own "Selecting a Specimen Type filters available
   *  Categories"). Undefined means "offered for every specimen
   *  family" — never an empty array standing in for that, which would
   *  read as "offered for none." */
  specimenFamilyFilter?: string[];
  /** Real, per the spec's own required_metadata_schema — empty array
   *  for an entry needing no further detail beyond the selection
   *  itself. */
  requiredMetadataSchema: ClinicalHistoryMetadataFieldDef[];
  isSystem: boolean;
  sortOrder: number;
}

export type NewClinicalHistoryDictionaryEntry = Omit<ClinicalHistoryDictionaryEntry, 'id' | 'isSystem' | 'sortOrder'> & { id: string };

export interface IClinicalHistoryDictionaryService {
  getAll(): Promise<ServiceResult<ClinicalHistoryDictionaryEntry[]>>;
  getActive(): Promise<ServiceResult<ClinicalHistoryDictionaryEntry[]>>;
  /** Real, per the spec's own GET query parameters — filters by
   *  category, matching the spec's own "category" param. */
  getByCategory(categoryCode: ClinicalHistoryCategoryCode): Promise<ServiceResult<ClinicalHistoryDictionaryEntry[]>>;
  /** Real, per the spec's own "specimen_type" query param — returns
   *  every active entry whose specimenFamilyFilter either includes
   *  this family or is undefined (applies to all families). */
  getBySpecimenFamily(specimenFamily: string): Promise<ServiceResult<ClinicalHistoryDictionaryEntry[]>>;
  getById(id: ID): Promise<ServiceResult<ClinicalHistoryDictionaryEntry>>;
  add(entry: NewClinicalHistoryDictionaryEntry): Promise<ServiceResult<ClinicalHistoryDictionaryEntry>>;
  update(id: ID, changes: Partial<ClinicalHistoryDictionaryEntry>): Promise<ServiceResult<ClinicalHistoryDictionaryEntry>>;
  deactivate(id: ID): Promise<ServiceResult<ClinicalHistoryDictionaryEntry>>;
  reactivate(id: ID): Promise<ServiceResult<ClinicalHistoryDictionaryEntry>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
