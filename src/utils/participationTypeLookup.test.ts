// src/utils/participationTypeLookup.test.ts — Batch 335: the cache is cleared after a save.
import { describe, it, expect } from 'vitest';
import { getParticipationTypeLookup, invalidateParticipationTypeLookup } from './participationTypeLookup';
import { mockParticipationTypeService } from '../services/participationTypes/mockParticipationTypeService';

describe('participationTypeLookup', () => {
  it('shares one fetch until invalidated, then reads the saved data', async () => {
    const first = getParticipationTypeLookup();
    expect(getParticipationTypeLookup()).toBe(first);
    const before = (await first).find(t => t.id === 'resident')!;
    await mockParticipationTypeService.update('resident', { jurisdictionProfiles: { ...before.jurisdictionProfiles, US: { label: 'PGY Resident' } } });
    expect((await getParticipationTypeLookup()).find(t => t.id === 'resident')!.jurisdictionProfiles?.US).toBeUndefined();
    invalidateParticipationTypeLookup();
    expect((await getParticipationTypeLookup()).find(t => t.id === 'resident')!.jurisdictionProfiles?.US).toEqual({ label: 'PGY Resident' });
  });
});
