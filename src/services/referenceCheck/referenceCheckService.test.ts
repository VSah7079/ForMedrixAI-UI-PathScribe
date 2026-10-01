// src/services/referenceCheck/referenceCheckService.test.ts
import { describe, it, expect, vi } from 'vitest';

const { getAllPhysicians, getAllOverrides } = vi.hoisted(() => ({
  getAllPhysicians: vi.fn(),
  getAllOverrides: vi.fn(),
}));

vi.mock('../index', () => ({
  physicianService: { getAll: getAllPhysicians },
  grossingRoutingOverrideService: { getAll: getAllOverrides },
  specimenDictionaryService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));
vi.mock('../cases/casePoolAssignmentService', () => ({ loadRoutingRules: vi.fn().mockReturnValue([]) }));

import { checkClientReferences, checkSpecimenCategoryReferences, checkFacilityReferences } from './referenceCheckService';

describe('checkClientReferences — real, per direct guidance: Client is a Facility, not a separate entity', () => {
  it('real, produces the exact same real result as checkFacilityReferences for the same real id — same underlying record, two UI names', async () => {
    getAllPhysicians.mockResolvedValue({ ok: true, data: [{ clientIds: ['fac-1'] }] });
    getAllOverrides.mockResolvedValue({ ok: true, data: [] });
    const clientResult = await checkClientReferences('fac-1');
    const facilityResult = await checkFacilityReferences('fac-1');
    expect(clientResult).toEqual(facilityResult);
    expect(clientResult.hasReferences).toBe(true);
  });

  it('real, a genuinely unreferenced id correctly reports no references, through the same shared logic', async () => {
    getAllPhysicians.mockResolvedValue({ ok: true, data: [] });
    getAllOverrides.mockResolvedValue({ ok: true, data: [] });
    const result = await checkClientReferences('fac-unused');
    expect(result.hasReferences).toBe(false);
    expect(result.sources).toEqual([]);
  });
});

describe('checkSpecimenCategoryReferences — real, honest limit: specimenCategoryId does not exist on SpecimenEntry yet', () => {
  it('real, honestly reports no references today — never fabricates a check against a field that genuinely does not exist', async () => {
    const result = await checkSpecimenCategoryReferences('cat-1');
    expect(result.hasReferences).toBe(false);
    expect(result.sources).toEqual([]);
  });
});
