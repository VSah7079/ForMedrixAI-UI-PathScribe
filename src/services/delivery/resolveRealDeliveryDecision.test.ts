// src/services/delivery/resolveRealDeliveryDecision.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../locations/mockLocationService', () => ({
  mockLocationService: { getById: vi.fn() },
}));
vi.mock('./mockDeliveryRuleService', () => ({
  mockDeliveryRuleService: { getActive: vi.fn() },
}));

import { caseRouter } from '../cases/CaseRouter';
import { mockLocationService } from '../locations/mockLocationService';
import { mockDeliveryRuleService } from './mockDeliveryRuleService';
import { resolveRealDeliveryDecision } from './resolveRealDeliveryDecision';

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(mockLocationService.getById).mockReset();
  vi.mocked(mockDeliveryRuleService.getActive).mockReset();
  vi.mocked(mockDeliveryRuleService.getActive).mockResolvedValue({ ok: true, data: [] });
});

describe('resolveRealDeliveryDecision', () => {
  it('a real, unknown case resolves to the real, spec-stated default, never throws', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    const result = await resolveRealDeliveryDecision('CASE-X', 'FINAL');
    expect(result.action).toBe('ELECTRONIC_ONLY');
  });

  it('resolves the real providerId and orderingFacilityId directly from Case.order, no Location lookup when there\u2019s no real locationId at all', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { orderingPhysicianId: 'DR-1', facilityId: 'FAC-A' } } as any);
    vi.mocked(mockDeliveryRuleService.getActive).mockResolvedValue({
      ok: true, data: [{ id: 'r1', providerId: 'DR-1', orderingFacilityId: 'FAC-A', action: 'SUPPRESS', active: true, createdAt: '', updatedAt: '' }],
    });
    const result = await resolveRealDeliveryDecision('CASE-1', 'FINAL');
    expect(result.action).toBe('SUPPRESS');
    expect(mockLocationService.getById).not.toHaveBeenCalled();
  });

  it('resolves the real pointOfCare via the case\u2019s own real locationId, per the source spec\u2019s own Patient Location criterion (HL7 PV1-3.1)', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { locationId: 'LOC-OR-1' } } as any);
    vi.mocked(mockLocationService.getById).mockResolvedValue({ ok: true, data: { pointOfCare: 'OR' } } as any);
    vi.mocked(mockDeliveryRuleService.getActive).mockResolvedValue({
      ok: true, data: [{ id: 'r1', pointOfCare: 'OR', action: 'DUAL', active: true, createdAt: '', updatedAt: '' }],
    });
    const result = await resolveRealDeliveryDecision('CASE-1', 'PRELIMINARY');
    expect(mockLocationService.getById).toHaveBeenCalledWith('LOC-OR-1');
    expect(result.action).toBe('DUAL');
  });

  it('a real, failed Location lookup degrades to no pointOfCare at all, never throws or fabricates one', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { locationId: 'LOC-BAD' } } as any);
    vi.mocked(mockLocationService.getById).mockRejectedValue(new Error('not found'));
    const result = await resolveRealDeliveryDecision('CASE-1', 'FINAL');
    expect(result.action).toBe('ELECTRONIC_ONLY');
  });

  it('the real reportType passed in is forwarded directly into the resolution criteria', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    vi.mocked(mockDeliveryRuleService.getActive).mockResolvedValue({
      ok: true, data: [{ id: 'r1', reportType: 'ADDENDUM', action: 'SUPPRESS', active: true, createdAt: '', updatedAt: '' }],
    });
    const result = await resolveRealDeliveryDecision('CASE-1', 'ADDENDUM');
    expect(result.action).toBe('SUPPRESS');
  });
});
