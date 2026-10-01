// src/services/facilities/resolveCasePerformingLabScope.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getById = vi.fn();
vi.mock('@/services', () => ({ facilityService: { getById: (...args: unknown[]) => getById(...args) } }));

import { resolveCasePerformingLabScope } from './resolveCasePerformingLabScope';

const facility = (overrides: Record<string, unknown>) => ({ ok: true, data: { roles: [], ...overrides } });

beforeEach(() => { getById.mockReset(); });

describe('resolveCasePerformingLabScope', () => {
  it('no ordering facility → empty scope, no lookup made', async () => {
    expect(await resolveCasePerformingLabScope(undefined)).toEqual({ performingLabFacilityId: undefined, jurisdiction: undefined });
    expect(getById).not.toHaveBeenCalled();
  });

  it('an ordering facility that IS the performing lab reuses its own record — exactly one lookup', async () => {
    getById.mockResolvedValueOnce(facility({ id: 'lab-au', roles: ['performing_lab'], jurisdiction: 'AU' }));
    expect(await resolveCasePerformingLabScope('lab-au')).toEqual({ performingLabFacilityId: 'lab-au', jurisdiction: 'AU' });
    expect(getById).toHaveBeenCalledTimes(1);
  });

  it('a delegating ordering site resolves the PERFORMING lab\'s jurisdiction, not its own', async () => {
    getById
      .mockResolvedValueOnce(facility({ id: 'client-us', roles: ['external_ordering_client'], performingLabFacilityId: 'lab-ie', jurisdiction: 'US' }))
      .mockResolvedValueOnce(facility({ id: 'lab-ie', roles: ['performing_lab'], jurisdiction: 'IE' }));
    expect(await resolveCasePerformingLabScope('client-us')).toEqual({ performingLabFacilityId: 'lab-ie', jurisdiction: 'IE' });
  });

  it('a failed performing-lab lookup keeps the lab id but leaves jurisdiction undefined (skips only that tier)', async () => {
    getById
      .mockResolvedValueOnce(facility({ id: 'client', roles: [], performingLabFacilityId: 'lab-x', jurisdiction: 'US' }))
      .mockResolvedValueOnce({ ok: false, error: 'nope' });
    expect(await resolveCasePerformingLabScope('client')).toEqual({ performingLabFacilityId: 'lab-x', jurisdiction: undefined });
  });

  it('a facility with no performing lab at all → empty scope', async () => {
    getById.mockResolvedValueOnce(facility({ id: 'client', roles: ['external_ordering_client'], jurisdiction: 'US' }));
    expect(await resolveCasePerformingLabScope('client')).toEqual({ performingLabFacilityId: undefined, jurisdiction: undefined });
  });

  it('never rejects — a rejected or throwing lookup resolves to an empty scope', async () => {
    getById.mockRejectedValueOnce(new Error('network'));
    await expect(resolveCasePerformingLabScope('x')).resolves.toEqual({ performingLabFacilityId: undefined, jurisdiction: undefined });
    getById.mockImplementationOnce(() => { throw new Error('sync boom'); });
    await expect(resolveCasePerformingLabScope('x')).resolves.toEqual({ performingLabFacilityId: undefined, jurisdiction: undefined });
  });
});
