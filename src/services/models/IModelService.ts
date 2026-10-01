import { ServiceResult, ID } from '../types';
import type { AiProviderId } from '../../components/Config/AI/aiProviderConfig';

export type ModelStatus = 'Active' | 'Beta' | 'Retired';
/** Real fix, per direct decision: 'Voice Dictation' added alongside
 *  the existing report-section types. Voice dictation refinement
 *  (correcting phonetic transcription errors, formatting
 *  measurements, capitalization) is a genuinely different task from
 *  generating a structured report section — grouping it under an
 *  existing type like 'Gross Only' would misrepresent what the model
 *  is actually validated for. */
export type ModelType   = 'Gross Only' | 'Micro Only' | 'Gross + Micro' | 'Diagnosis Only' | 'Voice Dictation';
/** Real, honest vendor tracking — 'other' covers anything not worth a
 *  dedicated case yet (local/self-hosted, a new entrant, etc.) without
 *  forcing every future vendor into this union immediately. */
export type ModelVendor = 'anthropic' | 'openai' | 'google' | 'other';

// ─── PS-58: global catalog + per-tenant adoption (Option 2) ──────────────────
// A model is a platform asset ForMedrixAI publishes once
// (ModelCatalogEntry, read-only to every tenant). An organisation
// *adopts* a catalog model (ModelAdoption, stored under its own
// organisationId: /organisations/{orgId}/adoptedModels/{modelId}) and
// everything it decides about that model lives on the adoption, never on
// the shared catalog entry. AIModel below is the joined view the rest of
// the app reads: catalog fields + this organisation's adoption fields.
// See services/models/README.md and STORE_INTEGRATION_NOTES.md.

/** Platform-owned. One entry per real model, identified by
 *  (vendor, apiModelId); a tenant can read these but never write them. */
export interface ModelCatalogEntry {
  id: ID;
  name: string;
  version: string;
  type: ModelType;
  vendor: ModelVendor;
  requestFormat: AiProviderId;
  apiModelId: string;
  releaseDate: string;       // ISO date string
  /** ForMedrixAI's own benchmark figure: a vendor claim, not a result on
   *  any customer's data. Seeds a new adoption's `accuracy`. */
  benchmarkAccuracy: number;
  /** Platform release notes (data, shown as published; not translated). */
  releaseNotes: string;
  subspecialtyIds: string[]; // empty = all subspecialties
  /** Offered in the ForMedrixAI store to organisations that haven't
   *  adopted it yet. Superseded platform versions stay in the catalog
   *  (adoptions still point at them) but are no longer offered. */
  storeListed: boolean;
}

/** Tenant-owned: one organisation's relationship with one catalog model. */
export interface ModelAdoption {
  organisationId: string;
  /** → ModelCatalogEntry.id */
  modelId: ID;
  status: ModelStatus;
  /** Default within its group (report generation vs voice dictation),
   *  for this organisation only. */
  isDefault: boolean;
  /** This organisation's figure. Starts at the catalog benchmark and is
   *  the value validation work updates. */
  accuracy: number;
  casesProcessed: number;
  /** This organisation's own notes; empty falls back to the catalog's
   *  release notes in the joined view. */
  notes: string;
  adoptedAt: string;         // ISO date string
  /** User id of whoever adopted it, when known. */
  adoptedBy?: string;
  retiredDate?: string;
  /** Tenant configuration parameters and threshold overrides for this
   *  model (PS-58 design note). Nothing reads these yet; they are here so
   *  the schema has a tenant-side home for them from the start. */
  configOverrides?: Record<string, string | number | boolean>;
  thresholdOverrides?: Record<string, number>;
  /** Ids this model had under the pre-PS-58 unscoped store (a store
   *  download used to get a random `psv-store-…` id). getById() resolves
   *  them so records still pointing at an old id keep working. */
  legacyModelIds?: string[];
}

/** The joined view: catalog entry + this organisation's adoption. */
export interface AIModel {
  id: ID;
  name: string;
  version: string;
  type: ModelType;
  accuracy: number;          // 0-100 percent
  casesProcessed: number;
  releaseDate: string;       // ISO date string
  retiredDate?: string;
  status: ModelStatus;
  subspecialtyIds: string[]; // empty = all subspecialties
  notes: string;
  isDefault: boolean;        // the model used for new cases
  /** Real fix, per direct product decision: previously this record was
   *  a pure display label with no actual connection to what gets
   *  called — the AI-call path read a single, global .env value
   *  regardless of what was tracked here. These three fields make an
   *  AIModel record a complete, self-sufficient description of how to
   *  actually call it, and are what make multi-vendor support genuine
   *  rather than theoretical: two AIModel entries can point at
   *  completely different vendors, and the app will actually call the
   *  right one per facility. */
  vendor:        ModelVendor;
  /** Which request shape this vendor's API needs — reuses the same
   *  AiProviderId already used for the org-wide .env-configured
   *  default, so a per-facility override is built from the exact same
   *  vocabulary as the fallback it can override. */
  requestFormat: AiProviderId;
  /** The literal model string sent to that vendor's API —
   *  'claude-opus-5', 'gpt-5', etc. Distinct from `version` above,
   *  which is PathScribe's own branded version label shown to users;
   *  this is what actually goes in the request body. */
  apiModelId:    string;
}

/** Error strings the model service returns, so screens can translate
 *  them (ServiceResult.error is otherwise free text). */
export type ModelServiceError =
  | 'NO_ORGANISATION'        // no organisationId in session: fail closed
  | 'MODEL_NOT_FOUND'
  | 'NOT_IN_CATALOG'
  | 'ALREADY_ADOPTED'
  | 'CANNOT_DEFAULT_RETIRED'
  | 'CANNOT_RETIRE_DEFAULT'
  | 'CATALOG_FIELDS_READ_ONLY'; // update() tried to change a platform-owned field

/** Every read and write is scoped to the organisation in session. */
export interface IModelService {
  getAll(): Promise<ServiceResult<AIModel[]>>;
  getById(id: ID): Promise<ServiceResult<AIModel>>;
  getActive(): Promise<ServiceResult<AIModel[]>>;
  getDefault(): Promise<ServiceResult<AIModel | null>>;
  /** Real fix, added with voice model support: the report-generation
   *  default and the voice-refinement default are independent slots —
   *  see setDefault()'s own implementation comment for why they can't
   *  share a single isDefault flag semantics. */
  getDefaultVoiceModel(): Promise<ServiceResult<AIModel | null>>;
  setDefault(id: ID): Promise<ServiceResult<AIModel>>;
  /** Changes this organisation's adoption. Catalog-owned fields (name,
   *  vendor, apiModelId, …) are rejected with CATALOG_FIELDS_READ_ONLY. */
  update(id: ID, changes: Partial<Omit<AIModel, 'id'>>): Promise<ServiceResult<AIModel>>;
  retire(id: ID): Promise<ServiceResult<AIModel>>;
  /** Adopts a catalog model into the current organisation (PS-58; this
   *  replaced create(), since a tenant can no longer mint model records of
   *  its own). The new adoption is always Beta, never the default, with
   *  zero cases processed, whatever the catalog's benchmark says. Fails
   *  with a ModelServiceError code when there is no organisation in
   *  session, the catalog id is unknown, or it is already adopted. */
  adopt(modelId: ID): Promise<ServiceResult<AIModel>>;
}
