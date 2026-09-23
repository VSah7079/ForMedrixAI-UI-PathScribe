import { describe, it, expect } from 'vitest';
import { resolveQaCaseSelectionContext } from './resolveQaCaseSelectionContext';
import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';

function makeEntry(overrides: Partial<IntraoperativeEntry> = {}): IntraoperativeEntry {
  return {
    id: 'intraop-1',
    patientMatch: { source: 'barcode', patientName: 'Test Patient', mrn: 'MRN-1', confirmedAt: '2026-01-01T00:00:00.000Z' },
    performedBy: { userId: 'u1', userName: 'Dr. Test' },
    orNumber: 'OR-1',
    surgeon: 'Dr. Surgeon',
    specimens: [],
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveQaCaseSelectionContext - hasNonDeferredFrozenCategory', () => {
  it('is false when no intraop entry merged into this case exists', () => {
    const entries = [makeEntry({ mergedIntoCaseId: 'case-other', status: 'merged' })];
    const context = resolveQaCaseSelectionContext('case-1', entries);
    expect(context.hasNonDeferredFrozenCategory).toBe(false);
  });

  it('is false when the merged session exists but every specimen is deferred or has no frozen category', () => {
    const entries = [
      makeEntry({
        mergedIntoCaseId: 'case-1',
        status: 'merged',
        specimens: [
          { id: 's1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'deferred' },
          { id: 's2', specimenLabel: 'B', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [] },
        ],
      }),
    ];
    const context = resolveQaCaseSelectionContext('case-1', entries);
    expect(context.hasNonDeferredFrozenCategory).toBe(false);
  });

  it('is true when the merged session has at least one specimen with a real, non-deferred frozen category', () => {
    const entries = [
      makeEntry({
        mergedIntoCaseId: 'case-1',
        status: 'merged',
        specimens: [
          { id: 's1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'deferred' },
          { id: 's2', specimenLabel: 'B', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'malignant' },
        ],
      }),
    ];
    const context = resolveQaCaseSelectionContext('case-1', entries);
    expect(context.hasNonDeferredFrozenCategory).toBe(true);
  });

  it('a pending (unmerged) session for the same case never counts, even with a real frozen category', () => {
    const entries = [
      makeEntry({
        status: 'pending',
        specimens: [{ id: 's1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z', milestones: [], preparations: [], frozenCategory: 'malignant' }],
      }),
    ];
    const context = resolveQaCaseSelectionContext('case-1', entries);
    expect(context.hasNonDeferredFrozenCategory).toBe(false);
  });
});
