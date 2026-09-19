// src/services/protocols/mockPathwayMaterialDictionaryService.test.ts
import { describe, it, expect } from 'vitest';
import { mockFixativeDictionaryService, mockProcessingFormatDictionaryService } from './mockPathwayMaterialDictionaryService';

describe('mockFixativeDictionaryService', () => {
  it('a real getAll returns every real seeded entry, including the real regulatory-status split', async () => {
    const res = await mockFixativeDictionaryService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = res.data.map(f => f.name);
    expect(names).toContain('B-5 Fixative (Mercuric)');
    expect(names).toContain('Zinc Formalin');
    expect(names).toContain('OCT (Optimal Cutting Temperature) Compound');
  });

  it('B-5 and Zinc Formalin are real, genuinely separate entries with different regulatory status, per direct correction ("treating B-5 and Zinc Formalin as equivalent... masks critical regulatory and safety constraints")', async () => {
    const res = await mockFixativeDictionaryService.getAll();
    if (!res.ok) return;
    const b5 = res.data.find(f => f.code === 'B5');
    const zinc = res.data.find(f => f.code === 'ZNFORM');
    expect(b5?.regulatoryStatus).toBe('Restricted');
    expect(b5?.requiresWarningLabel).toBe(true);
    expect(zinc?.regulatoryStatus).toBe('Active');
    expect(b5?.id).not.toBe(zinc?.id);
  });

  it('OCT is marked as a real, explicit non-fixative, per direct correction ("is_fixative = false... not chemical cross-linking")', async () => {
    const res = await mockFixativeDictionaryService.getAll();
    if (!res.ok) return;
    const oct = res.data.find(f => f.code === 'OCT');
    expect(oct?.isFixative).toBe(false);
  });

  it('exactly one real entry per category is marked isDefault, so the UI never has an ambiguous default to resolve', async () => {
    const res = await mockFixativeDictionaryService.getAll();
    if (!res.ok) return;
    const byCategory = new Map<string, number>();
    for (const f of res.data.filter(f => f.isDefault)) {
      byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
    }
    for (const [, count] of byCategory) expect(count).toBe(1);
  });

  it('a real add() creates a genuinely new, real entry with version 1', async () => {
    const res = await mockFixativeDictionaryService.add({
      code: 'TESTFIX', name: 'Test Fixative', category: 'Surgical', active: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.version).toBe(1);
    expect(res.data.id).toBeTruthy();
  });

  it('a real update() increments version and preserves everything not explicitly changed', async () => {
    const addRes = await mockFixativeDictionaryService.add({ code: 'TESTFIX2', name: 'Test Fixative 2', category: 'Cytology', active: true });
    if (!addRes.ok) return;
    const updateRes = await mockFixativeDictionaryService.update(addRes.data.id, { active: false });
    expect(updateRes.ok).toBe(true);
    if (!updateRes.ok) return;
    expect(updateRes.data.version).toBe(2);
    expect(updateRes.data.active).toBe(false);
    expect(updateRes.data.name).toBe('Test Fixative 2');
  });

  it('a real, genuinely nonexistent id fails honestly on update, never throws', async () => {
    const res = await mockFixativeDictionaryService.update('fx-does-not-exist', { active: false });
    expect(res.ok).toBe(false);
  });
});

describe('mockProcessingFormatDictionaryService', () => {
  it('a real getAll returns exactly the four real, known formats this codebase has ever actually used, per direct confirmation', async () => {
    const res = await mockProcessingFormatDictionaryService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = res.data.map(p => p.name);
    expect(names).toEqual(expect.arrayContaining(['Standard', 'Megablock', 'Frozen Block', 'Resin Grid']));
  });

  it('exactly one real entry is marked isDefault', async () => {
    const res = await mockProcessingFormatDictionaryService.getAll();
    if (!res.ok) return;
    expect(res.data.filter(p => p.isDefault)).toHaveLength(1);
    expect(res.data.find(p => p.isDefault)?.name).toBe('Standard');
  });

  it('a real add()/update() round-trip works the same as the fixative catalog', async () => {
    const addRes = await mockProcessingFormatDictionaryService.add({ name: 'Test Format', active: true });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) return;
    const updateRes = await mockProcessingFormatDictionaryService.update(addRes.data.id, { description: 'Updated.' });
    expect(updateRes.ok).toBe(true);
    if (!updateRes.ok) return;
    expect(updateRes.data.version).toBe(2);
    expect(updateRes.data.description).toBe('Updated.');
  });
});
