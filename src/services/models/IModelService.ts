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
  update(id: ID, changes: Partial<Omit<AIModel, 'id'>>): Promise<ServiceResult<AIModel>>;
  retire(id: ID): Promise<ServiceResult<AIModel>>;
  /** Real fix, closing the gap found when first investigating the
   *  Models admin screen: there was previously no way to add a new
   *  model at any layer of the app, not just the UI. This is what the
   *  ForMedrixAI store "download" flow actually calls — adopting a
   *  store model means creating a genuine new local record for it,
   *  not just displaying it differently. Always created with
   *  isDefault: false and casesProcessed: 0 — a newly-adopted model is
   *  never automatically the org default, and hasn't processed any
   *  real cases yet regardless of what the store catalog claims. */
  create(model: Omit<AIModel, 'id' | 'isDefault' | 'casesProcessed'>): Promise<ServiceResult<AIModel>>;
}
