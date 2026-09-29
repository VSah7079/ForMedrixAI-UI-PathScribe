// Batch 354: an organisation and everything under it.
import { describe, expect, it } from 'vitest';
import { linkFacilitiesToOrganisations, organisationIdOf, parentFacilityIdMap, withDescendantFacilityIds } from './facilityHierarchy';

const parents = parentFacilityIdMap([
  { id: 'trust' },
  { id: 'site-a', parentId: 'trust' },
  { id: 'site-b', parentId: 'trust' },
  { id: 'client-a', parentId: 'site-a' },
  { id: 'other' },
  { id: 'loop-1', parentId: 'loop-2' },
  { id: 'loop-2', parentId: 'loop-1' },
]);

describe('withDescendantFacilityIds', () => {
  it('a Trust includes its sites and what sits under them, at any depth', () => {
    expect(withDescendantFacilityIds(['trust'], parents).sort()).toEqual(['client-a', 'site-a', 'site-b', 'trust']);
  });
  it('a site includes only what is under it; a leaf is just itself', () => {
    expect(withDescendantFacilityIds(['site-a'], parents).sort()).toEqual(['client-a', 'site-a']);
    expect(withDescendantFacilityIds(['other'], parents)).toEqual(['other']);
  });
  it('no duplicates when a parent and its child are both chosen; a parent loop does not hang', () => {
    expect(withDescendantFacilityIds(['trust', 'site-a'], parents).sort()).toEqual(['client-a', 'site-a', 'site-b', 'trust']);
    expect(withDescendantFacilityIds(['loop-1'], parents).sort()).toEqual(['loop-1', 'loop-2']);
  });
  it('parentFacilityIdMap skips facilities with no parent', () => {
    expect(parents.has('trust')).toBe(false);
    expect(parents.get('client-a')).toBe('site-a');
  });
});

describe('linking hospital ids to organisations (Batch 372)', () => {
  const facilities = [
    { id: 'trust', isEnterprise: true, legacyTenantIds: ['ORG-T'] },
    { id: 'site', parentId: 'trust' },
    { id: 'client', performingLabFacilityId: 'site' },
    { id: 'standalone-lab', isEnterprise: true },
    { id: 'orphan' },
    { id: 'loop-a', parentId: 'loop-b' }, { id: 'loop-b', parentId: 'loop-a' },
  ];
  const byId = new Map(facilities.map(f => [f.id, f] as const));
  it('finds the organisation up the parents, then through the lab a client sends to', () => {
    expect(organisationIdOf('site', byId)).toBe('trust');
    expect(organisationIdOf('client', byId)).toBe('trust');
    expect(organisationIdOf('standalone-lab', byId)).toBe('standalone-lab');
    expect(organisationIdOf('orphan', byId)).toBeUndefined();
    expect(organisationIdOf('loop-a', byId)).toBeUndefined();
  });
  it('adds each organisation\'s own id and its members\' ids, keeping existing entries', () => {
    const linked = linkFacilitiesToOrganisations(facilities);
    expect(linked.find(f => f.id === 'trust')!.legacyTenantIds).toEqual(['ORG-T', 'trust', 'site', 'client']);
    expect(linked.find(f => f.id === 'standalone-lab')!.legacyTenantIds).toEqual(['standalone-lab']);
    expect(linked.find(f => f.id === 'site')!.legacyTenantIds).toBeUndefined();
    expect(facilities[0].legacyTenantIds).toEqual(['ORG-T']);
  });
});
