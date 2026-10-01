import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDocs, query, collection, where } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  query: vi.fn((...args: any[]) => args),
  collection: vi.fn(),
  where: vi.fn((...args: any[]) => ({ where: args })),
}));

vi.mock('firebase/firestore', () => ({ getDocs, query, collection, where }));
vi.mock('@/firebase', () => ({ db: {} }));

import { fetchSpecimenDeficienciesForCase } from './fetchSpecimenDeficienciesForCase';

describe('fetchSpecimenDeficienciesForCase', () => {
  beforeEach(() => { getDocs.mockReset(); where.mockClear(); });

  it('queries filtered by the real caseId', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchSpecimenDeficienciesForCase('CASE-1');
    expect(where).toHaveBeenCalledWith('caseId', '==', 'CASE-1');
  });

  it('maps real Firestore docs into real SpecimenDeficiency objects, including the real doc id', async () => {
    getDocs.mockResolvedValue({
      docs: [{ id: 'def-1', data: () => ({ caseId: 'CASE-1', deficiencyTypeId: 'def-block-lost', status: 'open', raisedBy: 'system', raisedAt: '2026-01-01T00:00:00Z' }) }],
    });
    const result = await fetchSpecimenDeficienciesForCase('CASE-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('def-1');
    expect(result[0].deficiencyTypeId).toBe('def-block-lost');
    expect(result[0].status).toBe('open');
  });

  it('returns an empty array for a case with no real deficiencies yet', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const result = await fetchSpecimenDeficienciesForCase('CASE-EMPTY');
    expect(result).toEqual([]);
  });
});
