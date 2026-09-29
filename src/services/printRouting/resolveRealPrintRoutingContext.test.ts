// src/services/printRouting/resolveRealPrintRoutingContext.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn() },
}));
vi.mock('../locations/mockLocationService', () => ({
  mockLocationService: { getById: vi.fn() },
}));
vi.mock('./wasCaseFrozenSectioned', () => ({
  wasCaseFrozenSectioned: vi.fn(),
}));

import { caseRouter } from '../cases/CaseRouter';
import { mockLocationService } from '../locations/mockLocationService';
import { wasCaseFrozenSectioned } from './wasCaseFrozenSectioned';
import { resolveRealPrintRoutingContext } from './resolveRealPrintRoutingContext';

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(mockLocationService.getById).mockReset();
  vi.mocked(wasCaseFrozenSectioned).mockReset();
  vi.mocked(wasCaseFrozenSectioned).mockResolvedValue(false);
});

describe('resolveRealPrintRoutingContext', () => {
  it('resolves the real orderingFacilityId directly from Case.order, no Location lookup when there’s no real locationId', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { facilityId: 'CLIENT-A' } } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-PERFORMING', 'SURGPATH');
    expect(result.orderingFacilityId).toBe('CLIENT-A');
    expect(mockLocationService.getById).not.toHaveBeenCalled();
  });

  it('resolves the real pointOfCare via the case’s own real locationId, same real lookup path Component C already uses', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { locationId: 'LOC-OR-1' } } as any);
    vi.mocked(mockLocationService.getById).mockResolvedValue({ ok: true, data: { pointOfCare: 'Theatre 2' } } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-PERFORMING', 'SURGPATH');
    expect(mockLocationService.getById).toHaveBeenCalledWith('LOC-OR-1');
    expect(result.pointOfCare).toBe('Theatre 2');
  });

  it('a real, failed Location lookup degrades to no pointOfCare at all, never throws or fabricates one', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: { locationId: 'LOC-BAD' } } as any);
    vi.mocked(mockLocationService.getById).mockRejectedValue(new Error('not found'));
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-PERFORMING', 'SURGPATH');
    expect(result.pointOfCare).toBeUndefined();
  });

  it('the real performingFacilityId passed in is forwarded directly as facilityId', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-PERFORMING', 'SURGPATH');
    expect(result.facilityId).toBe('FAC-PERFORMING');
  });

  it('maps every real reportType to its real, documented EventTriggerType', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    expect((await resolveRealPrintRoutingContext('C', 'FINAL', undefined, 'SURGPATH')).eventTriggerType).toBe('INITIAL_SIGNOUT');
    expect((await resolveRealPrintRoutingContext('C', 'PRELIMINARY', undefined, 'SURGPATH')).eventTriggerType).toBe('PRELIMINARY');
    expect((await resolveRealPrintRoutingContext('C', 'CORRECTED', undefined, 'SURGPATH')).eventTriggerType).toBe('AMENDED_SIGNOUT');
    expect((await resolveRealPrintRoutingContext('C', 'ADDENDUM', undefined, 'SURGPATH')).eventTriggerType).toBe('AMENDED_SIGNOUT');
  });

  it('a real source of ‘CYTOLOGY’ resolves the one real, reliable specimenCaseType signal this app has', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'CYTOLOGY');
    expect(result.specimenCaseType).toBe('CYTOLOGY');
  });

  it('a real source of ‘SURGPATH’ with no real intraop merge signal honestly defaults to ROUTINE_SURGICAL — never fabricates FROZEN_SECTION', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    vi.mocked(wasCaseFrozenSectioned).mockResolvedValue(false);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'SURGPATH');
    expect(result.specimenCaseType).toBe('ROUTINE_SURGICAL');
    expect(wasCaseFrozenSectioned).toHaveBeenCalledWith('CASE-1');
  });

  it('PS-278/279 gap-closing: a real intraop frozen-section merge signal now resolves FROZEN_SECTION, closing the previously-disclosed gap', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    vi.mocked(wasCaseFrozenSectioned).mockResolvedValue(true);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'SURGPATH');
    expect(result.specimenCaseType).toBe('FROZEN_SECTION');
  });

  it('a real source of ‘CYTOLOGY’ never even checks the intraop signal — Cytology is a genuinely different, non-surgical pipeline', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'CYTOLOGY');
    expect(wasCaseFrozenSectioned).not.toHaveBeenCalled();
  });

  it('an explicit specimenCaseTypeOverride wins over the real, inferred source signal — a real caller that genuinely knows (e.g. a future direct intraop caller) is trusted over the honest default, and skips the inference lookup entirely', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'SURGPATH', { specimenCaseTypeOverride: 'FROZEN_SECTION' });
    expect(result.specimenCaseType).toBe('FROZEN_SECTION');
    expect(wasCaseFrozenSectioned).not.toHaveBeenCalled();
  });

  it('workstationId/userId overrides pass straight through when a caller explicitly supplies them', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue({ order: {} } as any);
    const result = await resolveRealPrintRoutingContext('CASE-1', 'FINAL', 'FAC-1', 'SURGPATH', { workstationId: 'WS-9', userId: 'USER-9' });
    expect(result.workstationId).toBe('WS-9');
    expect(result.userId).toBe('USER-9');
  });
});
