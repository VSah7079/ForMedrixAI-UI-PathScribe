// @vitest-environment happy-dom
// src/services/models/mockModelService.test.ts — PS-58 tenant isolation.
import { describe, it, expect, beforeEach } from 'vitest';
import type { AIModel } from './IModelService';
import type { ServiceResult } from '../types';
import { GLOBAL_MODEL_CATALOG } from './modelCatalog';
import { type AdoptionStore, starterAdoptions } from './modelAdoption';
import {
  createModelService, loadOrInitAdoptionStore, DEMO_ORGANISATION_IDS,
  ADOPTIONS_STORAGE_KEY, LEGACY_MODELS_STORAGE_KEY,
} from './mockModelService';
import { createModelStoreService } from './mockModelStoreService';
import { mockModelCatalogService } from './modelCatalog';

function harness(initial: AdoptionStore) {
  let store: AdoptionStore = structuredClone(initial);
  let org: string | null = 'ORG-A';
  const service = createModelService({
    catalog: GLOBAL_MODEL_CATALOG,
    getOrganisationId: () => org,
    getUserId: () => 'user-1',
    loadStore: () => structuredClone(store),
    saveStore: s => { store = structuredClone(s); },
    today: () => '2026-09-24',
  });
  return { service, setOrg: (o: string | null) => { org = o; }, store: () => store };
}

const seeded = (): AdoptionStore => ({ 'ORG-A': starterAdoptions('ORG-A'), 'ORG-B': starterAdoptions('ORG-B') });
const ids = (r: ServiceResult<AIModel[]>) => (r.ok ? r.data : []).map(m => m.id);
/** The model a result carries, or null on failure. */
const model = (r: ServiceResult<AIModel | null>) => (r.ok ? r.data : null);

describe('mock model service: tenant isolation', () => {
  it('an adoption in one organisation is invisible to another', async () => {
    const h = harness(seeded());
    const res = await h.service.adopt('psv40');
    expect(res).toMatchObject({ ok: true, data: { id: 'psv40', status: 'Beta', isDefault: false, casesProcessed: 0 } });
    expect(ids(await h.service.getAll())).toContain('psv40');
    h.setOrg('ORG-B');
    expect(ids(await h.service.getAll())).not.toContain('psv40');
    expect(h.store()['ORG-A'].find(a => a.modelId === 'psv40')).toMatchObject({ organisationId: 'ORG-A', adoptedBy: 'user-1', adoptedAt: '2026-09-24' });
  });

  it('a default set in one organisation leaves the other alone', async () => {
    const h = harness(seeded());
    await h.service.setDefault('psv33');
    expect(model(await h.service.getDefault())?.id).toBe('psv33');
    h.setOrg('ORG-B');
    expect(model(await h.service.getDefault())?.id).toBe('psv32');
  });

  it('a retirement in one organisation leaves the other alone', async () => {
    const h = harness(seeded());
    await h.service.retire('psv33');
    expect(model(await h.service.getById('psv33'))?.status).toBe('Retired');
    h.setOrg('ORG-B');
    expect(model(await h.service.getById('psv33'))?.status).toBe('Beta');
  });

  it('a new organisation starts with nothing adopted', async () => {
    const h = harness(seeded());
    h.setOrg('ORG-NEW');
    expect(ids(await h.service.getAll())).toEqual([]);
    expect(model(await h.service.getDefault())).toBeNull();
    expect((await h.service.adopt('psv32')).ok).toBe(true);
    expect(Object.keys(h.store())).toContain('ORG-NEW');
  });
});

describe('mock model service: fail closed without an organisation', () => {
  it('reads return nothing and writes are refused', async () => {
    const h = harness(seeded());
    h.setOrg(null);
    expect(await h.service.getAll()).toEqual({ ok: true, data: [] });
    expect(await h.service.getDefault()).toEqual({ ok: true, data: null });
    expect(await h.service.getDefaultVoiceModel()).toEqual({ ok: true, data: null });
    expect(await h.service.getById('psv32')).toEqual({ ok: false, error: 'MODEL_NOT_FOUND' });
    expect(await h.service.adopt('psv40')).toEqual({ ok: false, error: 'NO_ORGANISATION' });
    expect(await h.service.setDefault('psv33')).toEqual({ ok: false, error: 'NO_ORGANISATION' });
    expect(await h.service.update('psv33', { notes: 'x' })).toEqual({ ok: false, error: 'NO_ORGANISATION' });
    expect(await h.service.retire('psv33')).toEqual({ ok: false, error: 'NO_ORGANISATION' });
  });
});

describe('mock model service: rules', () => {
  it('keeps separate report and voice defaults', async () => {
    const h = harness(seeded());
    expect(model(await h.service.getDefault())?.id).toBe('psv32');
    expect(model(await h.service.getDefaultVoiceModel())?.id).toBe('psv-voice-gemini-flash-lite');
  });

  it('refuses to retire the default and to change catalog fields', async () => {
    const h = harness(seeded());
    expect(await h.service.retire('psv32')).toEqual({ ok: false, error: 'CANNOT_RETIRE_DEFAULT' });
    expect(await h.service.update('psv33', { apiModelId: 'gpt-5' })).toEqual({ ok: false, error: 'CATALOG_FIELDS_READ_ONLY' });
  });

  it('getActive excludes retired adoptions', async () => {
    const h = harness(seeded());
    const active = ids(await h.service.getActive());
    expect(active).not.toContain('psv30');
    expect(active).toContain('psv33');
  });

  it('resolves a legacy id to the canonical model', async () => {
    const store = seeded();
    store['ORG-A'].push({ ...starterAdoptions('ORG-A')[1], modelId: 'psv40', legacyModelIds: ['psv-store-old'] });
    const h = harness(store);
    expect(model(await h.service.getById('psv-store-old'))).toMatchObject({ id: 'psv40', apiModelId: 'claude-opus-5' });
  });
});

describe('store service over the adoption model', () => {
  it('offers only what the organisation in session has not adopted, and adopting is per organisation', async () => {
    const h = harness(seeded());
    const store = createModelStoreService({ catalog: mockModelCatalogService, models: h.service, hasLicense: () => true });
    const before = await store.getAvailable();
    expect(before.ok && before.data.map(l => l.id)).toEqual(['psv40', 'psv-voice-gemini-2-5-flash-lite']);
    expect((await store.download('psv40')).ok).toBe(true);
    const after = await store.getAvailable();
    expect(after.ok && after.data.map(l => l.id)).toEqual(['psv-voice-gemini-2-5-flash-lite']);
    h.setOrg('ORG-B');
    const other = await store.getAvailable();
    expect(other.ok && other.data.map(l => l.id)).toEqual(['psv40', 'psv-voice-gemini-2-5-flash-lite']);
  });

  it('returns STORE_NOT_LICENSED when the organisation has no licence', async () => {
    const h = harness(seeded());
    const store = createModelStoreService({ catalog: mockModelCatalogService, models: h.service, hasLicense: () => false });
    expect(await store.getAvailable()).toEqual({ ok: false, error: 'STORE_NOT_LICENSED' });
    expect(await store.download('psv40')).toEqual({ ok: false, error: 'STORE_NOT_LICENSED' });
  });
});

describe('loadOrInitAdoptionStore', () => {
  const PREFIX = 'pathscribe_mock_';
  beforeEach(() => localStorage.clear());

  it('seeds every demo organisation on first run', () => {
    const store = loadOrInitAdoptionStore();
    expect(Object.keys(store).sort()).toEqual([...DEMO_ORGANISATION_IDS].sort());
    expect(localStorage.getItem(PREFIX + ADOPTIONS_STORAGE_KEY)).not.toBeNull();
  });

  it('migrates the legacy unscoped list into every demo organisation, then removes it', () => {
    const legacy: AIModel[] = [{
      id: 'psv-store-abc', name: 'pathscribe', version: 'v4.0', type: 'Gross + Micro', accuracy: 97.8, casesProcessed: 3,
      releaseDate: '2026-07-24', status: 'Active', subspecialtyIds: [], notes: 'kept', isDefault: true,
      vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-opus-5',
    }];
    localStorage.setItem(PREFIX + LEGACY_MODELS_STORAGE_KEY, JSON.stringify(legacy));
    const store = loadOrInitAdoptionStore();
    for (const org of DEMO_ORGANISATION_IDS) {
      expect(store[org]).toEqual([expect.objectContaining({ organisationId: org, modelId: 'psv40', casesProcessed: 3, notes: 'kept', legacyModelIds: ['psv-store-abc'] })]);
    }
    expect(localStorage.getItem(PREFIX + LEGACY_MODELS_STORAGE_KEY)).toBeNull();
  });

  it('leaves an existing adoption store alone', () => {
    localStorage.setItem(PREFIX + ADOPTIONS_STORAGE_KEY, JSON.stringify({ 'ORG-X': [] }));
    expect(loadOrInitAdoptionStore()).toEqual({ 'ORG-X': [] });
  });
});
