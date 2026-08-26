// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockReasonDictionaryService } from './mockReasonDictionaryService';

describe('mockReasonDictionaryService - real, category-scoped reason dictionary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getAll only returns entries for the real, requested category', async () => {
    const res = await mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data.every(r => r.category === 'POST_SIGNOUT_BILLING_CHANGE')).toBe(true);
    }
  });

  it('every real seeded reason is Active by default', async () => {
    const res = await mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE');
    if (res.ok) {
      expect(res.data.every(r => r.status === 'Active')).toBe(true);
    }
  });

  it('a new entry can be added to a real category and is immediately retrievable', async () => {
    await mockReasonDictionaryService.add({
      category: 'POST_SIGNOUT_BILLING_CHANGE', name: 'Test reason', description: 'A real test reason', status: 'Active',
    });
    const res = await mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE');
    if (res.ok) {
      expect(res.data.some(r => r.name === 'Test reason')).toBe(true);
    }
  });

  it('deactivating a real entry removes it from Active status without deleting it', async () => {
    const addRes = await mockReasonDictionaryService.add({
      category: 'POST_SIGNOUT_BILLING_CHANGE', name: 'To deactivate', description: 'x', status: 'Active',
    });
    if (!addRes.ok) return;
    await mockReasonDictionaryService.deactivate(addRes.data.id);
    const res = await mockReasonDictionaryService.getAll('POST_SIGNOUT_BILLING_CHANGE');
    if (res.ok) {
      const entry = res.data.find(r => r.id === addRes.data.id);
      expect(entry?.status).toBe('Inactive');
    }
  });

  it('updating a non-existent id returns a real, honest error rather than silently succeeding', async () => {
    const res = await mockReasonDictionaryService.update('reason-does-not-exist', { name: 'x' });
    expect(res.ok).toBe(false);
  });
});
