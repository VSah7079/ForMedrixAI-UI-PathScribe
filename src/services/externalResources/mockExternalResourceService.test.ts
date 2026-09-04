// src/services/externalResources/mockExternalResourceService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { mockExternalResourceService } = await import('./mockExternalResourceService');

const ORG_A = 'ORG-TEST-A';
const ORG_B = 'ORG-TEST-B';
const LAB_1 = 'CLIENT-LAB-1';
const LAB_2 = 'CLIENT-LAB-2';

describe('mockExternalResourceService — real relevance filtering', () => {
  beforeEach(() => { store.clear(); });

  it('an enterprise-scoped resource is visible to any viewer in the same organisation, regardless of which lab they are at', async () => {
    await mockExternalResourceService.create({
      title: 'Org A Protocols', url: 'https://example.com/a', category: 'protocols', scope: 'enterprise', organisationId: ORG_A,
    });
    const resolved = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A, performingLabFacilityIds: [LAB_1] });
    expect(resolved.protocols).toHaveLength(1);
    const resolvedNoLab = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A });
    expect(resolvedNoLab.protocols).toHaveLength(1);
  });

  it('an enterprise-scoped resource for a DIFFERENT organisation never surfaces — never a flat global list', async () => {
    await mockExternalResourceService.create({
      title: 'Org A Protocols', url: 'https://example.com/a', category: 'protocols', scope: 'enterprise', organisationId: ORG_A,
    });
    const resolved = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_B });
    expect(resolved.protocols).toHaveLength(0);
  });

  it('a lab-scoped resource only surfaces for a viewer actually relevant to that specific lab', async () => {
    await mockExternalResourceService.create({
      title: 'Lab 1 System', url: 'https://example.com/lis1', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_1,
    });
    const atLab1 = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A, performingLabFacilityIds: [LAB_1] });
    expect(atLab1.systems).toHaveLength(1);

    const atLab2 = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A, performingLabFacilityIds: [LAB_2] });
    expect(atLab2.systems).toHaveLength(0);

    const noLabContext = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A });
    expect(noLabContext.systems).toHaveLength(0);
  });

  it('a real viewer sees BOTH their enterprise set and their own lab-specific additions together, not one or the other', async () => {
    await mockExternalResourceService.create({
      title: 'Org A Protocols', url: 'https://example.com/a', category: 'protocols', scope: 'enterprise', organisationId: ORG_A,
    });
    await mockExternalResourceService.create({
      title: 'Lab 1 System', url: 'https://example.com/lis1', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_1,
    });
    await mockExternalResourceService.create({
      title: 'Lab 2 System', url: 'https://example.com/lis2', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_2,
    });
    const resolved = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A, performingLabFacilityIds: [LAB_1] });
    expect(resolved.protocols).toHaveLength(1);
    expect(resolved.systems).toHaveLength(1);
    expect(resolved.systems[0].title).toBe('Lab 1 System');
  });

  it('a viewer relevant to MULTIPLE labs at once (e.g. pool cases spanning several hospitals) sees each of those labs\' own resources together', async () => {
    await mockExternalResourceService.create({
      title: 'Lab 1 System', url: 'https://example.com/lis1', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_1,
    });
    await mockExternalResourceService.create({
      title: 'Lab 2 System', url: 'https://example.com/lis2', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_2,
    });
    const resolved = await mockExternalResourceService.resolveForViewer({ organisationId: ORG_A, performingLabFacilityIds: [LAB_1, LAB_2] });
    expect(resolved.systems).toHaveLength(2);
    const titles = resolved.systems.map(r => r.title).sort();
    expect(titles).toEqual(['Lab 1 System', 'Lab 2 System']);
  });

  it('listForOrganisation is the real admin view — sees everything for the org regardless of lab scope, unlike resolveForViewer', async () => {
    await mockExternalResourceService.create({
      title: 'Lab 1 System', url: 'https://example.com/lis1', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_1,
    });
    await mockExternalResourceService.create({
      title: 'Lab 2 System', url: 'https://example.com/lis2', category: 'systems', scope: 'lab', organisationId: ORG_A, facilityId: LAB_2,
    });
    const adminView = await mockExternalResourceService.listForOrganisation(ORG_A);
    expect(adminView).toHaveLength(2);
  });

  it('update and remove work on real, persisted resources', async () => {
    const created = await mockExternalResourceService.create({
      title: 'Original', url: 'https://example.com/x', category: 'references', scope: 'enterprise', organisationId: ORG_A,
    });
    const updated = await mockExternalResourceService.update(created.id, { title: 'Renamed', url: 'https://example.com/y' });
    expect(updated?.title).toBe('Renamed');
    expect(updated?.url).toBe('https://example.com/y');

    await mockExternalResourceService.remove(created.id);
    const afterRemove = await mockExternalResourceService.listForOrganisation(ORG_A);
    expect(afterRemove.find(r => r.id === created.id)).toBeUndefined();
  });

  it('the real seed migration carries the corrected CAP URL, not the stale one that 404s', async () => {
    const seeded = await mockExternalResourceService.listForOrganisation('ORG-DVMC');
    const cap = seeded.find(r => r.title === 'CAP Cancer Protocols');
    expect(cap?.url).toBe('https://www.cap.org/protocols-and-guidelines/cancer-reporting-tools/cancer-protocol-templates');
  });
});
