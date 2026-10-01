import { describe, it, expect } from 'vitest';
import { FIELD_REQUIREMENT_PAGES, missingRequiredFields, overrideProblem, resolveFieldRequirements } from './fieldRequirementRules';
import { createFieldRequirementService } from './fieldRequirementService';

describe('field requirement rules (PS-359)', () => {
  it('Accession defaults reproduce what the page required before: names, date of birth, client, requesting provider, a described specimen', () => {
    const required = resolveFieldRequirements('accession').filter(f => f.required).map(f => f.id);
    expect(required).toEqual(['givenNames', 'familyNames', 'dateOfBirth', 'client', 'requestingProvider', 'specimenDescription']);
    expect(resolveFieldRequirements('accession').filter(f => f.locked).map(f => f.id)).toEqual(required);
    for (const f of FIELD_REQUIREMENT_PAGES.accession) if (f.default === 'locked') expect(f.lockReason, f.id).toBeTruthy();
  });
  it('an organisation\'s choice applies to configurable fields only', () => {
    const r = resolveFieldRequirements('accession', { mrn: true, givenNames: false, nope: true });
    expect(r.find(f => f.id === 'mrn')).toMatchObject({ required: true, changed: true });
    expect(r.find(f => f.id === 'givenNames')).toMatchObject({ required: true, locked: true, changed: false });
    expect(overrideProblem('accession', 'givenNames')).toBe('locked');
    expect(overrideProblem('accession', 'nope')).toBe('unknownField');
    expect(overrideProblem('histology', 'x')).toBe('unknownPage');
    expect(overrideProblem('accession', 'mrn')).toBeNull();
  });
  it('missing fields: blanks count as missing; a per-specimen field needs every specimen', () => {
    const r = resolveFieldRequirements('accession', { collectedAt: true });
    const values = { givenNames: 'Ann', familyNames: ' ', dateOfBirth: '1970-01-01', client: 'c1', requestingProvider: 'Dr X',
      specimenDescription: ['Skin', 'Colon'], collectedAt: ['2026-09-01T10:00', ''] };
    expect(missingRequiredFields(r, values).map(f => f.id)).toEqual(['familyNames', 'collectedAt']);
    expect(missingRequiredFields(r, { ...values, familyNames: 'Lee', collectedAt: ['a', 'b'], specimenDescription: [] }).map(f => f.id)).toEqual(['specimenDescription']);
  });
});

describe('field requirement service (PS-359)', () => {
  const harness = (granted = true, org = 'ORG-MFT') => {
    const mem = new Map<string, unknown>();
    const audits: string[] = [];
    const svc = createFieldRequirementService({
      authorization: { enforce: async (c: string) => ({ capability: c, allowed: granted, grantedBy: [], missingRequirements: [], context: {} }) },
      session: () => ({ id: 'U1', name: 'Admin One', organisationId: org }),
      enterpriseFacilities: async () => [{ id: 'fac-mft', name: 'Manchester', isEnterprise: true, legacyTenantIds: ['ORG-MFT'] }] as any,
      audit: async e => { audits.push(e.detail); return e; },
      store: { get: (k, f) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : f), set: (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } },
    });
    return { svc, audits };
  };
  it('an administrator makes a field required for their organisation, audited; switching back restores the default', async () => {
    const { svc, audits } = harness();
    expect(await svc.setRequired('fac-mft', 'accession', 'mrn', true)).toEqual({ ok: true });
    expect((await svc.forSession('accession')).find(f => f.id === 'mrn')?.required).toBe(true);
    expect((await svc.forOrganisation('fac-other', 'accession')).find(f => f.id === 'mrn')?.required).toBe(false);
    await svc.setRequired('fac-mft', 'accession', 'mrn', false);
    expect((await svc.forSession('accession')).find(f => f.id === 'mrn')).toMatchObject({ required: false, changed: false });
    expect(audits).toEqual(['Manchester: accession field "mrn" is now required.', 'Manchester: accession field "mrn" is now not required.']);
  });
  it('refuses locked fields, other organisations, and people without the capability', async () => {
    expect(await harness().svc.setRequired('fac-mft', 'accession', 'dateOfBirth', false)).toEqual({ ok: false, reason: 'locked' });
    expect(await harness().svc.setRequired('fac-other', 'accession', 'mrn', true)).toEqual({ ok: false, reason: 'otherOrganisation' });
    expect(await harness(false).svc.setRequired('fac-mft', 'accession', 'mrn', true)).toEqual({ ok: false, reason: 'notPermitted' });
  });
});
