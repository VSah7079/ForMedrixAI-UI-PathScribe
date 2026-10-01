// src/services/models/modelCatalog.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-58 (Option 2): the global ForMedrixAI model catalog.
//
// Platform data, published centrally by ForMedrixAI and identical for every
// organisation. No tenant can write to it: in Firestore it is the top-level
// /modelCatalog collection (read for any signed-in user, write for vendor
// staff only; see firestore.rules). What an organisation decides about a
// model lives on its adoption record instead (modelAdoption.ts,
// mockModelService.ts).
//
// Merged from the two pre-PS-58 lists: mockModelService's seed models and
// mockModelStoreService's STORE_CATALOG. Both lists described
// gemini-2.5-pro (as "v3.3-alt" locally and "v4.0-alt" in the store); a
// real model appears once in a global catalog, so it is one entry here
// under the id tenants had already adopted (psv-alt-gemini). The catalog
// test enforces one entry per (vendor, apiModelId).
//
// Release notes are platform data shown as published, not UI text.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { ModelCatalogEntry } from './IModelService';

export const GLOBAL_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'psv32', name: 'pathscribe', version: 'v3.2', type: 'Gross + Micro',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-sonnet-4-6',
    releaseDate: '2025-06-01', benchmarkAccuracy: 94.2, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'Current production model.',
  },
  {
    id: 'psv33', name: 'pathscribe', version: 'v3.3', type: 'Gross + Micro',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-sonnet-5',
    releaseDate: '2026-01-15', benchmarkAccuracy: 96.1, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'Enhanced microscopic suggestion accuracy.',
  },
  {
    id: 'psv31', name: 'pathscribe', version: 'v3.1', type: 'Gross Only',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-sonnet-4-5-20250929',
    releaseDate: '2024-11-01', benchmarkAccuracy: 91.8, subspecialtyIds: [], storeListed: false,
    releaseNotes: 'Gross-only model. Superseded by v3.2.',
  },
  {
    id: 'psv30', name: 'pathscribe', version: 'v3.0', type: 'Gross Only',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-3-5-sonnet-20241022',
    releaseDate: '2024-04-01', benchmarkAccuracy: 88.4, subspecialtyIds: [], storeListed: false,
    releaseNotes: 'First production release.',
  },
  {
    id: 'psv-alt-gemini', name: 'pathscribe', version: 'v3.3-alt', type: 'Gross + Micro',
    vendor: 'google', requestFormat: 'structured_content', apiModelId: 'gemini-2.5-pro',
    releaseDate: '2026-06-01', benchmarkAccuracy: 94.1, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'Cross-vendor candidate: same ForMedrixAI regression suite, alternate provider. Useful if you want vendor diversity for a specific subspecialty rather than switching your default entirely.',
  },
  {
    id: 'psv-voice-gemini-flash-lite', name: 'pathscribe-voice', version: '2.0-flash-lite', type: 'Voice Dictation',
    vendor: 'google', requestFormat: 'structured_content', apiModelId: 'gemini-2.0-flash-lite',
    releaseDate: '2026-01-01', benchmarkAccuracy: 92.0, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'Voice-dictation refinement model: corrects phonetic transcription errors, formats measurements, fixes capitalization.',
  },
  {
    id: 'psv40', name: 'pathscribe', version: 'v4.0', type: 'Gross + Micro',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-opus-5',
    releaseDate: '2026-07-24', benchmarkAccuracy: 97.8, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'ForMedrixAI internal benchmark: improved microscopic-description reasoning and fewer low-confidence flags on borderline Gleason grading. Published following ForMedrixAI’s own regression-suite pass. Still requires your own Validation Study before adoption.',
  },
  {
    id: 'psv-voice-gemini-2-5-flash-lite', name: 'pathscribe-voice', version: '2.5-flash-lite', type: 'Voice Dictation',
    vendor: 'google', requestFormat: 'structured_content', apiModelId: 'gemini-2.5-flash-lite',
    releaseDate: '2026-07-10', benchmarkAccuracy: 95.4, subspecialtyIds: [], storeListed: true,
    releaseNotes: 'Newer voice-dictation refinement model. ForMedrixAI benchmark shows improved handling of multi-accent phonetic correction and fewer dropped words on long dictation runs. Adopting it does not make it the active voice model; that still needs your own Validation Study.',
  },
];

export interface IModelCatalogService {
  getAll(): Promise<ServiceResult<ModelCatalogEntry[]>>;
  getById(id: ID): Promise<ServiceResult<ModelCatalogEntry>>;
}

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

/** Read-only by construction: there is no write method, matching the
 *  Firestore rule that only vendor staff write /modelCatalog. */
export const mockModelCatalogService: IModelCatalogService = {
  async getAll() {
    return ok(GLOBAL_MODEL_CATALOG.map(e => ({ ...e, subspecialtyIds: [...e.subspecialtyIds] })));
  },
  async getById(id) {
    const e = GLOBAL_MODEL_CATALOG.find(x => x.id === id);
    return e ? ok({ ...e, subspecialtyIds: [...e.subspecialtyIds] }) : err('MODEL_NOT_FOUND');
  },
};
