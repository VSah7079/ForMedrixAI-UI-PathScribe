import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDocs, query, collection, where, orderBy } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  query: vi.fn((...args: any[]) => args),
  collection: vi.fn(),
  where: vi.fn((...args: any[]) => ({ where: args })),
  orderBy: vi.fn((...args: any[]) => ({ orderBy: args })),
}));

vi.mock('firebase/firestore', () => ({ getDocs, query, collection, where, orderBy }));
vi.mock('@/firebase', () => ({ db: {} }));

import { fetchDispatchHistoryForCase } from './fetchDispatchHistoryForCase';

describe('fetchDispatchHistoryForCase', () => {
  beforeEach(() => { getDocs.mockReset(); where.mockClear(); });

  it('queries only the two real, in-scope event types, filtered by caseId', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await fetchDispatchHistoryForCase('CASE-1');
    expect(where).toHaveBeenCalledWith('caseId', '==', 'CASE-1');
    expect(where).toHaveBeenCalledWith('eventType', 'in', ['cassette-dispatch-outcome', 'block-exception']);
  });

  it('maps real Firestore docs into real, typed DispatchHistoryEntry objects', async () => {
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ eventType: 'cassette-dispatch-outcome', caseId: 'CASE-1', createdAt: '2026-01-01T00:00:00Z', payload: { outcome: 'dispatched' } }) },
        { data: () => ({ eventType: 'block-exception', caseId: 'CASE-1', createdAt: '2026-01-01T01:00:00Z', payload: { status: 'Lost' } }) },
      ],
    });
    const result = await fetchDispatchHistoryForCase('CASE-1');
    expect(result).toHaveLength(2);
    expect(result[0].eventType).toBe('cassette-dispatch-outcome');
    expect(result[1].eventType).toBe('block-exception');
  });

  it('returns an empty array for a case with no real events yet', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    const result = await fetchDispatchHistoryForCase('CASE-EMPTY');
    expect(result).toEqual([]);
  });
});
