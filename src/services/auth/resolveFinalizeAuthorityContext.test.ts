// src/services/auth/resolveFinalizeAuthorityContext.test.ts — Batch 331 (PS-327).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/facilities/resolveCasePerformingLabScope', () => ({
  resolveCasePerformingLabScope: vi.fn(async (id: string | undefined) =>
    (id ? { performingLabFacilityId: 'lab-1', jurisdiction: 'GB_EW' } : { performingLabFacilityId: undefined, jurisdiction: undefined })),
}));
vi.mock('@/utils/participationTypeLookup', () => ({ getParticipationTypeLookup: vi.fn(async () => [{ id: 'attending' }]) }));

import { resolveFinalizeAuthorityContext } from './resolveFinalizeAuthorityContext';

describe('resolveFinalizeAuthorityContext', () => {
  it("uses the performing lab's jurisdiction by default", async () => {
    expect(await resolveFinalizeAuthorityContext({ order: { facilityId: 'hosp-1' } })).toEqual({
      participationTypes: [{ id: 'attending' }], performingLabFacilityId: 'lab-1', jurisdiction: 'GB_EW',
    });
  });

  it("uses the override (Autopsy: the coroner jurisdiction) but keeps the lab for per-lab overrides", async () => {
    expect(await resolveFinalizeAuthorityContext({ order: { facilityId: 'hosp-1' } }, { jurisdictionOverride: 'GB_SCT' }))
      .toMatchObject({ performingLabFacilityId: 'lab-1', jurisdiction: 'GB_SCT' });
  });

  it('falls back to the lab jurisdiction when the override is empty, and copes with no case', async () => {
    expect((await resolveFinalizeAuthorityContext({ order: { facilityId: 'hosp-1' } }, { jurisdictionOverride: null })).jurisdiction).toBe('GB_EW');
    expect(await resolveFinalizeAuthorityContext(null)).toMatchObject({ performingLabFacilityId: undefined, jurisdiction: undefined });
  });
});
