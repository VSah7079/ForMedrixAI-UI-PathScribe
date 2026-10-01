// src/services/retentionPolicy/resolveRetentionEligibility.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Can we cleanup those 12 errors?"):
// Department.retentionOverrideDays didn't exist on the type at
// all — resolveDepartmentOverride() (below) and DepartmentsSection.tsx
// both genuinely, functionally depended on it, but the field itself
// was missing from IDepartmentService.ts, confirmed via a real
// tsc error, not assumed. Fixed there; this file adds the test
// coverage that never existed for this real, already-wired-in
// resolution chain (Specimen -> SpecimenEntry.departmentId ->
// Department.retentionOverrideDays), which real, top-level
// consumers (computeDisposalQueue.ts/disposeItemByScan.ts, via
// resolveMostConservativeEligibleDate) depend on for real specimen
// disposal-eligibility decisions.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services', () => ({
  specimenDictionaryService: { getAll: vi.fn() },
  departmentService: { getAll: vi.fn() },
}));

import { specimenDictionaryService, departmentService } from '@/services';
import { resolveDepartmentOverride } from './resolveRetentionEligibility';

beforeEach(() => { vi.clearAllMocks(); });

describe('resolveDepartmentOverride — the real, direct consumer of Department.retentionOverrideDays', () => {
  it('walks the full chain and returns the real override when every real link resolves', async () => {
    vi.mocked(specimenDictionaryService.getAll).mockResolvedValue({
      ok: true, data: [{ id: 'entry-1', departmentId: 'cat-1' } as any],
    });
    vi.mocked(departmentService.getAll).mockResolvedValue({
      ok: true, data: [{ id: 'cat-1', retentionOverrideDays: { wet_tissue: 90, slide: 3650 } } as any],
    });

    const result = await resolveDepartmentOverride('entry-1');

    expect(result).toEqual({ wet_tissue: 90, slide: 3650 });
  });

  it('returns undefined (not an empty object) when the specimen dictionary entry has no departmentId at all', async () => {
    vi.mocked(specimenDictionaryService.getAll).mockResolvedValue({
      ok: true, data: [{ id: 'entry-1' } as any],
    });

    const result = await resolveDepartmentOverride('entry-1');

    expect(result).toBeUndefined();
  });

  it('returns undefined when the real department itself has no override configured', async () => {
    vi.mocked(specimenDictionaryService.getAll).mockResolvedValue({
      ok: true, data: [{ id: 'entry-1', departmentId: 'cat-1' } as any],
    });
    vi.mocked(departmentService.getAll).mockResolvedValue({
      ok: true, data: [{ id: 'cat-1' } as any],
    });

    const result = await resolveDepartmentOverride('entry-1');

    expect(result).toBeUndefined();
  });

  it('returns undefined for an undefined specimenDictionaryEntryId, without calling either real service', async () => {
    const result = await resolveDepartmentOverride(undefined);

    expect(result).toBeUndefined();
    expect(specimenDictionaryService.getAll).not.toHaveBeenCalled();
  });

  it('returns undefined when specimenDictionaryService.getAll() itself fails, rather than throwing', async () => {
    vi.mocked(specimenDictionaryService.getAll).mockResolvedValue({ ok: false, error: 'down' } as any);

    const result = await resolveDepartmentOverride('entry-1');

    expect(result).toBeUndefined();
  });
});
