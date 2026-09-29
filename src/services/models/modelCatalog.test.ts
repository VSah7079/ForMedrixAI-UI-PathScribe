// src/services/models/modelCatalog.test.ts — PS-58 global catalog invariants.
import { describe, it, expect } from 'vitest';
import { GLOBAL_MODEL_CATALOG, mockModelCatalogService } from './modelCatalog';
import { DEMO_ORGANISATION_IDS } from './mockModelService';
import { listOrganisations } from '../organisation/organisationService';

describe('GLOBAL_MODEL_CATALOG', () => {
  it('has unique ids', () => {
    const ids = GLOBAL_MODEL_CATALOG.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists each real model once (vendor + apiModelId)', () => {
    const keys = GLOBAL_MODEL_CATALOG.map(e => `${e.vendor}/${e.apiModelId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hands out copies, so a caller cannot edit platform data', async () => {
    const res = await mockModelCatalogService.getAll();
    if (res.ok === false) throw new Error(res.error);
    res.data[0].name = 'tampered';
    res.data[0].subspecialtyIds.push('x');
    expect(GLOBAL_MODEL_CATALOG[0].name).not.toBe('tampered');
    expect(GLOBAL_MODEL_CATALOG[0].subspecialtyIds).toEqual([]);
  });

  it('returns MODEL_NOT_FOUND for an unknown id', async () => {
    expect(await mockModelCatalogService.getById('nope')).toEqual({ ok: false, error: 'MODEL_NOT_FOUND' });
  });
});

describe('DEMO_ORGANISATION_IDS', () => {
  it('matches the organisations the demo seeds', async () => {
    const orgs = await listOrganisations();
    expect([...DEMO_ORGANISATION_IDS].sort()).toEqual(orgs.map(o => o.id).sort());
  });
});
