import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDocs, query, collection, where, orderBy, limit } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  query: vi.fn((...args: any[]) => args),
  collection: vi.fn(),
  where: vi.fn((...args: any[]) => ({ where: args })),
  orderBy: vi.fn((...args: any[]) => ({ orderBy: args })),
  limit: vi.fn((...args: any[]) => ({ limit: args })),
}));

vi.mock('firebase/firestore', () => ({ getDocs, query, collection, where, orderBy, limit }));
vi.mock('@/firebase', () => ({ db: {} }));

import { fetchGlobalDeficiencies } from './fetchGlobalDeficiencies';

describe('fetchGlobalDeficiencies', () => {
  beforeEach(() => { getDocs.mockReset(); where.mockClear(); orderBy.mockClear(); limit.mockClear(); });

  it('filters by the two real, still-actionable statuses — never contained/investigating/resolved/verified', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchGlobalDeficiencies();
    expect(where).toHaveBeenCalledWith('status', 'in', ['open', 'pending-verification']);
  });

  it('orders by the real raisedAt field, newest first', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchGlobalDeficiencies();
    expect(orderBy).toHaveBeenCalledWith('raisedAt', 'desc');
  });

  it('defaults to a real, bounded limit of 100', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchGlobalDeficiencies();
    expect(limit).toHaveBeenCalledWith(100);
  });

  it('accepts a real, explicit override for the limit', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchGlobalDeficiencies(25);
    expect(limit).toHaveBeenCalledWith(25);
  });

  it('maps real Firestore docs into real SpecimenDeficiency objects, including the real doc id', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { id: 'def-1', data: () => ({ caseId: 'CASE-1', deficiencyTypeId: 'def-block-lost', status: 'open', raisedBy: 'system', raisedAt: '2026-01-02T00:00:00Z' }) },
        { id: 'def-2', data: () => ({ caseId: 'CASE-2', deficiencyTypeId: 'def-missing-preanalytic-date', status: 'pending-verification', raisedBy: 'system', raisedAt: '2026-01-01T00:00:00Z' }) },
      ],
    });
    const result = await fetchGlobalDeficiencies();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('def-1');
    expect(result[1].status).toBe('pending-verification');
  });

  it('returns an empty array when nothing real is open across any case', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const result = await fetchGlobalDeficiencies();
    expect(result).toEqual([]);
  });
});
