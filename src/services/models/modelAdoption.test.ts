// src/services/models/modelAdoption.test.ts — PS-58 adoption rules.
import { describe, it, expect } from 'vitest';
import type { AIModel, ModelAdoption } from './IModelService';
import { GLOBAL_MODEL_CATALOG } from './modelCatalog';
import {
  joinModel, joinAdoptedModels, findAdoption, availableForAdoption, buildAdoption,
  adoptModel, applyDefault, applyModelChanges, starterAdoptions, migrateLegacyModels,
  facilitiesPinnedToModel,
} from './modelAdoption';

const catalog = GLOBAL_MODEL_CATALOG;
const entry = (id: string) => catalog.find(e => e.id === id)!;
const ORG = 'ORG-A';

describe('joinModel / joinAdoptedModels', () => {
  it('takes catalog fields from the catalog and tenant fields from the adoption', () => {
    const a: ModelAdoption = { ...buildAdoption(entry('psv40'), ORG, { today: '2026-09-01' }), accuracy: 90, status: 'Active', casesProcessed: 5, notes: 'ours' };
    const m = joinModel(entry('psv40'), a);
    expect(m).toMatchObject({ id: 'psv40', vendor: 'anthropic', apiModelId: 'claude-opus-5', accuracy: 90, status: 'Active', casesProcessed: 5, notes: 'ours', isDefault: false });
  });

  it('falls back to the catalog release notes when the tenant has none', () => {
    const m = joinModel(entry('psv40'), buildAdoption(entry('psv40'), ORG, { today: '2026-09-01' }));
    expect(m.notes).toBe(entry('psv40').releaseNotes);
  });

  it('returns only adopted models, and skips adoptions with no catalog entry', () => {
    const adoptions = [buildAdoption(entry('psv32'), ORG, { today: 'x' }), { ...buildAdoption(entry('psv33'), ORG, { today: 'x' }), modelId: 'gone' }];
    expect(joinAdoptedModels(catalog, adoptions).map(m => m.id)).toEqual(['psv32']);
  });
});

describe('findAdoption', () => {
  it('resolves a pre-PS-58 id through legacyModelIds', () => {
    const a = { ...buildAdoption(entry('psv40'), ORG, { today: 'x' }), legacyModelIds: ['psv-store-abc'] };
    expect(findAdoption([a], 'psv-store-abc')).toBe(a);
    expect(findAdoption([a], 'psv40')).toBe(a);
    expect(findAdoption([a], 'nope')).toBeUndefined();
  });
});

describe('availableForAdoption', () => {
  it('lists store-listed catalog models the organisation has not adopted', () => {
    const ids = availableForAdoption(catalog, ['psv32', 'psv33', 'psv-alt-gemini', 'psv-voice-gemini-flash-lite']).map(e => e.id);
    expect(ids).toEqual(['psv40', 'psv-voice-gemini-2-5-flash-lite']);
  });

  it('never offers a superseded (unlisted) model', () => {
    const ids = availableForAdoption(catalog, []).map(e => e.id);
    expect(ids).not.toContain('psv30');
    expect(ids).not.toContain('psv31');
  });
});

describe('adoptModel', () => {
  it('adds a Beta, non-default, zero-case adoption seeded from the benchmark', () => {
    const res = adoptModel(catalog, [], 'psv40', ORG, { today: '2026-09-24', adoptedBy: 'u1' });
    expect(res.ok).toBe(true);
    if (res.ok === false) return;
    expect(res.data.adoption).toEqual({
      organisationId: ORG, modelId: 'psv40', status: 'Beta', isDefault: false,
      accuracy: 97.8, casesProcessed: 0, notes: '', adoptedAt: '2026-09-24', adoptedBy: 'u1',
    });
  });

  it('refuses unknown catalog ids and repeats', () => {
    expect(adoptModel(catalog, [], 'made-up', ORG, { today: 'x' })).toEqual({ ok: false, error: 'NOT_IN_CATALOG' });
    const once = adoptModel(catalog, [], 'psv40', ORG, { today: 'x' });
    if (once.ok === false) throw new Error('setup');
    expect(adoptModel(catalog, once.data.adoptions, 'psv40', ORG, { today: 'x' })).toEqual({ ok: false, error: 'ALREADY_ADOPTED' });
  });
});

describe('applyDefault', () => {
  const start = starterAdoptions(ORG);

  it('clears other defaults only within the same group', () => {
    const res = applyDefault(catalog, start, 'psv33');
    if (res.ok === false) throw new Error(res.error);
    const byId = Object.fromEntries(res.data.map(a => [a.modelId, a.isDefault]));
    expect(byId.psv33).toBe(true);
    expect(byId.psv32).toBe(false);
    expect(byId['psv-voice-gemini-flash-lite']).toBe(true); // voice untouched
  });

  it('refuses retired and unknown models', () => {
    expect(applyDefault(catalog, start, 'psv31')).toEqual({ ok: false, error: 'CANNOT_DEFAULT_RETIRED' });
    expect(applyDefault(catalog, start, 'psv40')).toEqual({ ok: false, error: 'MODEL_NOT_FOUND' });
  });
});

describe('applyModelChanges', () => {
  const a = buildAdoption(entry('psv40'), ORG, { today: 'x' });

  it('applies tenant-owned fields', () => {
    const res = applyModelChanges(entry('psv40'), a, { status: 'Active', accuracy: 95, notes: 'n' });
    expect(res).toEqual({ ok: true, data: { ...a, status: 'Active', accuracy: 95, notes: 'n' } });
  });

  it('refuses a change to a platform-owned field', () => {
    expect(applyModelChanges(entry('psv40'), a, { apiModelId: 'gpt-5' })).toEqual({ ok: false, error: 'CATALOG_FIELDS_READ_ONLY' });
    expect(applyModelChanges(entry('psv40'), a, { name: 'renamed' })).toEqual({ ok: false, error: 'CATALOG_FIELDS_READ_ONLY' });
  });

  it('treats a catalog field passed unchanged as no change', () => {
    expect(applyModelChanges(entry('psv40'), a, { vendor: 'anthropic', status: 'Retired' }).ok).toBe(true);
  });
});

describe('starterAdoptions', () => {
  it('points only at catalog models, with one default per group', () => {
    const s = starterAdoptions(ORG);
    expect(s.every(a => catalog.some(e => e.id === a.modelId) && a.organisationId === ORG)).toBe(true);
    const models = joinAdoptedModels(catalog, s);
    expect(models.filter(m => m.isDefault && m.type !== 'Voice Dictation')).toHaveLength(1);
    expect(models.filter(m => m.isDefault && m.type === 'Voice Dictation')).toHaveLength(1);
  });
});

describe('migrateLegacyModels', () => {
  const legacyModel = (over: Partial<AIModel>): AIModel => ({
    id: 'psv32', name: 'pathscribe', version: 'v3.2', type: 'Gross + Micro', accuracy: 94.2, casesProcessed: 10,
    releaseDate: '2025-06-01', status: 'Active', subspecialtyIds: [], notes: 'n', isDefault: true,
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-sonnet-4-6', ...over,
  });

  it('gives every organisation its own copy of the old shared list', () => {
    const { store } = migrateLegacyModels([legacyModel({})], catalog, ['ORG-A', 'ORG-B']);
    expect(store['ORG-A']).toHaveLength(1);
    expect(store['ORG-B'][0]).toMatchObject({ organisationId: 'ORG-B', modelId: 'psv32', casesProcessed: 10, isDefault: true });
    store['ORG-A'][0].casesProcessed = 99;
    expect(store['ORG-B'][0].casesProcessed).toBe(10);
  });

  it('matches a store download to the catalog by vendor + apiModelId and keeps its old id', () => {
    const downloaded = legacyModel({ id: 'psv-store-xyz', apiModelId: 'claude-opus-5', status: 'Beta', isDefault: false, casesProcessed: 0 });
    const { store } = migrateLegacyModels([downloaded], catalog, ['ORG-A']);
    expect(store['ORG-A'][0]).toMatchObject({ modelId: 'psv40', legacyModelIds: ['psv-store-xyz'], status: 'Beta' });
  });

  it('reports records with no catalog match instead of inventing an entry', () => {
    const { store, unmatched } = migrateLegacyModels([legacyModel({ id: 'odd', apiModelId: 'unknown-model' })], catalog, ['ORG-A']);
    expect(unmatched).toEqual(['odd']);
    expect(store['ORG-A']).toEqual([]);
  });

  it('merges two legacy records for one real model', () => {
    const { store } = migrateLegacyModels([
      legacyModel({ isDefault: false }),
      legacyModel({ id: 'psv-store-dup', isDefault: true }),
    ], catalog, ['ORG-A']);
    expect(store['ORG-A']).toHaveLength(1);
    expect(store['ORG-A'][0]).toMatchObject({ modelId: 'psv32', isDefault: true, legacyModelIds: ['psv-store-dup'] });
  });
});

describe('facilitiesPinnedToModel', () => {
  it('returns facilities whose override points at the model', () => {
    const f = [{ id: 'a', internalAiModelId: 'psv33' }, { id: 'b', internalAiModelId: null }, { id: 'c' }];
    expect(facilitiesPinnedToModel(f, 'psv33').map(x => x.id)).toEqual(['a']);
  });
});
