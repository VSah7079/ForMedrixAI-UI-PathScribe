import { describe, it, expect } from 'vitest';
import { mockAssetLocationDictionaryService } from './mockAssetLocationDictionaryService';

describe('mockAssetLocationDictionaryService.findOrCreateByName', () => {
  it('a real, exact (case-insensitive) match returns the existing entry, never a duplicate', async () => {
    const result = await mockAssetLocationDictionaryService.findOrCreateByName('grossing station 3');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('loc-grossing-station-3');
      expect(result.data.status).toBe('Active');
    }
  });

  it('a real, unrecognized name creates a new, real Unverified, autoCreated entry \u2014 never blocked, never silently dropped', async () => {
    const result = await mockAssetLocationDictionaryService.findOrCreateByName('Cold Storage Unit 7', 'No exact match reported by source system TEST on case S26-9999.');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Cold Storage Unit 7');
      expect(result.data.status).toBe('Unverified');
      expect(result.data.autoCreated).toBe(true);
      expect(result.data.autoCreatedNote).toContain('S26-9999');
    }
  });

  it('a real, near-miss (not an exact match) is never silently folded into an existing entry \u2014 it creates its own, real new pending entry instead', async () => {
    const result = await mockAssetLocationDictionaryService.findOrCreateByName('Grossing Station 3B');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).not.toBe('loc-grossing-station-3');
      expect(result.data.status).toBe('Unverified');
    }
  });

  it('a real, subsequent call with the exact same, real auto-created name now matches that new entry, rather than creating a second duplicate', async () => {
    const first = await mockAssetLocationDictionaryService.findOrCreateByName('Freezer Bay 4');
    const second = await mockAssetLocationDictionaryService.findOrCreateByName('freezer bay 4');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.id).toBe(first.data.id);
    }
  });
});

describe('mockAssetLocationDictionaryService.verify/deactivate', () => {
  it('verify() promotes a real Unverified entry to Active', async () => {
    const created = await mockAssetLocationDictionaryService.findOrCreateByName('Verify Test Location');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const verified = await mockAssetLocationDictionaryService.verify(created.data.id);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.data.status).toBe('Active');
  });

  it('deactivate() sets a real entry\u2019s status to Inactive without deleting it', async () => {
    const created = await mockAssetLocationDictionaryService.findOrCreateByName('Deactivate Test Location');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const deactivated = await mockAssetLocationDictionaryService.deactivate(created.data.id);
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) expect(deactivated.data.status).toBe('Inactive');
    const stillThere = await mockAssetLocationDictionaryService.getById(created.data.id);
    expect(stillThere.ok).toBe(true);
  });
});
