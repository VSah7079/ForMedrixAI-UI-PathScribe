// Focused unit coverage for the shared gate itself — see
// src/loaders/synopticLoader.test.ts for the thorough, real end-to-end
// wiring coverage (loader → this gate → redirect) that already exercises
// every real branch through an actual call site.
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../services', () => ({
  facilityService: { getById: vi.fn() },
}));

import { resolveCaseAccessGate } from './resolveCaseAccessGate';
import { facilityService } from '../../services';
import type { SessionUser } from './caseAccessControl';

const SESSION: SessionUser = { id: 'user-1', role: 'pathologist' } as SessionUser;

describe('resolveCaseAccessGate', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('grants access to an ordinary, unrestricted case with no session-shaped restrictions', async () => {
    const result = await resolveCaseAccessGate(SESSION, { reportingMode: 'assist', order: {}, patient: {} });
    expect(result).toEqual({ granted: true, reason: null, detail: null });
    expect(facilityService.getById).not.toHaveBeenCalled();
  });

  it('denies with reason "orchestration" when the Orchestration check fails, before any facility lookup', async () => {
    const result = await resolveCaseAccessGate(
      { ...SESSION, canViewOrchestration: false },
      { reportingMode: 'orchestrator', order: { facilityId: 'fac-1' }, patient: {} },
    );
    expect(result.granted).toBe(false);
    expect((result as any).reason).toBe('orchestration');
    expect(facilityService.getById).not.toHaveBeenCalled();
  });

  it('denies with reason "pediatric" when the pediatric check fails', async () => {
    vi.mocked(facilityService.getById).mockResolvedValue({
      ok: true, data: { id: 'fac-1', pediatricAgeThreshold: 18, authorizedPediatricPathologistIds: [] },
    } as any);
    const result = await resolveCaseAccessGate(
      { ...SESSION, canViewPediatric: false },
      { reportingMode: 'assist', order: { facilityId: 'fac-1' }, patient: { dateOfBirth: '2020-01-01' } },
    );
    expect(result.granted).toBe(false);
    expect((result as any).reason).toBe('pediatric');
  });

  it('never fetches a facility when the case has no order.facilityId', async () => {
    const result = await resolveCaseAccessGate(SESSION, { reportingMode: 'assist', order: {}, patient: { dateOfBirth: '2020-01-01' } });
    expect(result).toEqual({ granted: true, reason: null, detail: null });
    expect(facilityService.getById).not.toHaveBeenCalled();
  });
});
