// src/services/printRouting/wasCaseFrozenSectioned.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wasCaseFrozenSectioned } from './wasCaseFrozenSectioned';
import { mockIntraoperativeService } from '../intraop/mockIntraoperativeService';
import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';

vi.mock('../intraop/mockIntraoperativeService', () => ({
  mockIntraoperativeService: { getAll: vi.fn() },
}));

function makeEntry(overrides: Partial<IntraoperativeEntry>): IntraoperativeEntry {
  return {
    id: 'entry-1',
    patientMatch: { source: 'barcode', patientName: 'Test Patient', mrn: 'MRN1' } as any,
    performedBy: { userId: 'u1', userName: 'Tech' },
    orNumber: 'OR-1',
    surgeon: 'Dr. Test',
    specimens: [],
    status: 'merged',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as IntraoperativeEntry;
}

describe('wasCaseFrozenSectioned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when a merged entry for this case has a specimen with a frozen_section_cut milestone', async () => {
    (mockIntraoperativeService.getAll as any).mockResolvedValue({
      ok: true,
      data: [
        makeEntry({
          mergedIntoCaseId: 'CASE-1',
          specimens: [
            {
              id: 's1',
              specimenLabel: 'A',
              milestones: [{ id: 'm1', milestone: 'gross_logged', timestamp: '2026-01-01T00:00:00Z' },
                          { id: 'm2', milestone: 'frozen_section_cut', timestamp: '2026-01-01T00:05:00Z' }],
              preparations: [],
            } as any,
          ],
        }),
      ],
    });

    await expect(wasCaseFrozenSectioned('CASE-1')).resolves.toBe(true);
  });

  it('returns false when the matching merged entry has no frozen_section_cut milestone on any specimen', async () => {
    (mockIntraoperativeService.getAll as any).mockResolvedValue({
      ok: true,
      data: [
        makeEntry({
          mergedIntoCaseId: 'CASE-2',
          specimens: [
            {
              id: 's1',
              specimenLabel: 'A',
              milestones: [{ id: 'm1', milestone: 'gross_logged', timestamp: '2026-01-01T00:00:00Z' }],
              preparations: [],
            } as any,
          ],
        }),
      ],
    });

    await expect(wasCaseFrozenSectioned('CASE-2')).resolves.toBe(false);
  });

  it('returns false when no IntraoperativeEntry was ever merged into this case (the common, non-intraop case)', async () => {
    (mockIntraoperativeService.getAll as any).mockResolvedValue({
      ok: true,
      data: [makeEntry({ mergedIntoCaseId: 'SOME-OTHER-CASE' })],
    });

    await expect(wasCaseFrozenSectioned('CASE-3')).resolves.toBe(false);
  });

  it('ignores a pending (not yet merged) entry even if its own id string happens to equal the caseId', async () => {
    (mockIntraoperativeService.getAll as any).mockResolvedValue({
      ok: true,
      data: [makeEntry({ id: 'CASE-4', status: 'pending', mergedIntoCaseId: undefined })],
    });

    await expect(wasCaseFrozenSectioned('CASE-4')).resolves.toBe(false);
  });

  it('fails honestly to false (never throws) when the underlying service call itself fails', async () => {
    (mockIntraoperativeService.getAll as any).mockResolvedValue({ ok: false, error: 'boom' });

    await expect(wasCaseFrozenSectioned('CASE-5')).resolves.toBe(false);
  });
});
