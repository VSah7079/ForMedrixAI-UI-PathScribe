// src/services/cytology/mockNonGynCytologyCategoryService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockNonGynCytologyCategoryService — Milan and Paris (urinary) non-GYN cytology dictionaries', () => {
  it('real, getBySystem(\'milan\') returns exactly the real, seven-tier Milan category set', async () => {
    const { mockNonGynCytologyCategoryService } = await import('./mockNonGynCytologyCategoryService');
    const result = await mockNonGynCytologyCategoryService.getBySystem('milan');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(7);
      expect(result.data.map(e => e.categoryNumber)).toEqual(['I', 'II', 'III', 'IVA', 'IVB', 'V', 'VI']);
      const malignant = result.data.find(e => e.categoryNumber === 'VI');
      expect(malignant?.riskOfMalignancyPercent).toBe(90);
    }
  });

  it('real, getBySystem(\'paris_urinary\') returns exactly the real, current TPS 2.0 six-category set, with no separate LGUN category', async () => {
    const { mockNonGynCytologyCategoryService } = await import('./mockNonGynCytologyCategoryService');
    const result = await mockNonGynCytologyCategoryService.getBySystem('paris_urinary');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(6);
      expect(result.data.some(e => e.abbreviation === 'LGUN')).toBe(false);
      expect(result.data.some(e => e.abbreviation === 'NHGUC')).toBe(true);
    }
  });

  it('real, a system-seeded entry cannot be deleted, only deactivated', async () => {
    const { mockNonGynCytologyCategoryService } = await import('./mockNonGynCytologyCategoryService');
    const result = await mockNonGynCytologyCategoryService.remove('ngc-milan-6');
    expect(result.ok).toBe(false);
  });

  it('real, a genuine custom, admin-added entry can be added and later removed', async () => {
    const { mockNonGynCytologyCategoryService } = await import('./mockNonGynCytologyCategoryService');
    const created = await mockNonGynCytologyCategoryService.add({
      system: 'milan', categoryNumber: 'VII', label: 'Custom Local Category', requiresPathologistReview: true, active: true,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const removed = await mockNonGynCytologyCategoryService.remove(created.data.id);
      expect(removed.ok).toBe(true);
    }
  });
});
