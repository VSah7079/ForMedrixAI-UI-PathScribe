// Batch 353: the Quality tab's TAT joins, moved out of QualityTab.tsx.
import { describe, expect, it } from 'vitest';
import { consultationRecords, facilityNamesById, withPerformingLabs } from './qualityTatInputs';
import type { Facility } from '../facilities/IFacilityService';

const fac = (over: Partial<Facility>) => ({ id: 'f', name: 'F', roles: ['external_ordering_client'], ...over }) as Facility;

describe('qualityTatInputs', () => {
  const facilities = [
    fac({ id: 'client', name: 'Client', performingLabFacilityId: 'lab' }),
    fac({ id: 'lab', name: 'Lab', roles: ['performing_lab'] }),
    fac({ id: 'orphan', name: 'Orphan' }),
  ];
  it('gives each case the lab its ordering facility sends to', () => {
    const out = withPerformingLabs([
      { id: '1', order: { facilityId: 'client' } }, { id: '2', order: { facilityId: 'lab' } },
      { id: '3', order: { facilityId: 'orphan' } }, { id: '4' },
    ], facilities);
    expect(out.map(c => c.performingLabFacilityId)).toEqual(['lab', 'lab', undefined, undefined]);
  });
  it('names facilities by id', () => {
    expect(facilityNamesById(facilities)).toEqual({ client: 'Client', lab: 'Lab', orphan: 'Orphan' });
  });
  it('adds informal review requests to the delegation records', () => {
    const out = consultationRecords(
      [{ id: 'd1', caseId: 'C', fromUserId: 'A', delegationType: 'POOL', timestamp: 't', status: 'pending' }],
      [{ id: 'r1', caseId: 'C', fromUserId: 'A', fromUserName: 'A', toUserId: 'B', toUserName: 'B', status: 'pending', requestedAt: 't2' }],
    );
    expect(out.map(d => [d.id, d.delegationType])).toEqual([['d1', 'POOL'], ['r1', 'CASUAL_REVIEW']]);
  });
});
