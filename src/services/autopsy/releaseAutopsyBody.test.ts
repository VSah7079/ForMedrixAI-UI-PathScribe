import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase, updateCase } = vi.hoisted(() => ({
  getCase: vi.fn(), updateCase: vi.fn(),
}));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase, updateCase } }));

import { releaseAutopsyBody } from './releaseAutopsyBody';
import type { Case } from '@/types/case/Case';

const signedPad = {
  tier: 'PAD' as const,
  frozenPayload: {},
  signedBy: { name: 'Dr. E. Reed', isPathologist: true },
  signedAt: '2026-09-05T14:00:00Z',
};

function baseCase(overrides: Partial<Case>): Case {
  return {
    id: 'case-1',
    accession: { accessionNumber: 'A-2026-1' },
    originHospitalId: 'HOSP-001',
    originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'pt-1', firstName: 'John', lastName: 'Doe' },
    specimens: [{ id: 'sp-1', label: 'A', description: 'Body' }],
    order: { priority: 'Routine' },
    status: 'draft',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    autopsy: {
      jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full',
      addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad,
    },
    ...overrides,
  } as Case;
}

beforeEach(() => {
  getCase.mockReset();
  updateCase.mockReset();
});

describe('releaseAutopsyBody', () => {
  it('a real case that fails the real gate is never persisted \u2014 updateCase is never called', async () => {
    getCase.mockResolvedValue(baseCase({ autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: true } } as any }));
    const result = await releaseAutopsyBody('case-1', 'sp-1', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis' });
    expect(result.ok).toBe(false);
    expect(result.blockedReasons?.length).toBeGreaterThan(0);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, allowed release appends the real event onto the real, target specimen\u2019s own locationHistory and persists via the real caseRouter', async () => {
    getCase.mockResolvedValue(baseCase({}));
    const result = await releaseAutopsyBody('case-1', 'sp-1', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis', releasedAt: '2026-09-10T09:00:00Z' });
    expect(result.ok).toBe(true);
    expect(updateCase).toHaveBeenCalledTimes(1);
    const [caseId, updates] = updateCase.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(updates.specimens[0].locationHistory).toEqual([
      { location: 'Smith Funeral Home', action: 'Released', at: '2026-09-10T09:00:00Z', source: 'PathScribe', performedByName: 'Tech: M. Davis' },
    ]);
  });

  it('a real, prior locationHistory on the specimen is preserved, with the real release event appended, never replacing it', async () => {
    const priorEvent = { location: 'Cold Storage Unit 3', at: '2026-09-01T02:00:00Z', source: 'PathScribe' };
    getCase.mockResolvedValue(baseCase({ specimens: [{ id: 'sp-1', label: 'A', description: 'Body', locationHistory: [priorEvent] }] }));
    const result = await releaseAutopsyBody('case-1', 'sp-1', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis', releasedAt: '2026-09-10T09:00:00Z' });
    expect(result.ok).toBe(true);
    const updates = updateCase.mock.calls[0][1];
    expect(updates.specimens[0].locationHistory).toHaveLength(2);
    expect(updates.specimens[0].locationHistory[0]).toEqual(priorEvent);
  });

  it('a real, non-target specimen on the same case is left completely untouched', async () => {
    getCase.mockResolvedValue(baseCase({ specimens: [{ id: 'sp-1', label: 'A', description: 'Body' }, { id: 'sp-2', label: 'B', description: 'Heart' }] }));
    await releaseAutopsyBody('case-1', 'sp-1', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis', releasedAt: '2026-09-10T09:00:00Z' });
    const updates = updateCase.mock.calls[0][1];
    expect(updates.specimens[1]).toEqual({ id: 'sp-2', label: 'B', description: 'Heart' });
  });

  it('a real, unknown caseId returns a real, honest error, never a silent no-op', async () => {
    getCase.mockResolvedValue(undefined);
    const result = await releaseAutopsyBody('case-unknown', 'sp-1', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, unknown specimenId on an otherwise real, valid case returns a real, honest error', async () => {
    getCase.mockResolvedValue(baseCase({}));
    const result = await releaseAutopsyBody('case-1', 'sp-unknown', { releasedTo: 'Smith Funeral Home', releasedByName: 'Tech: M. Davis' });
    expect(result.ok).toBe(false);
    expect(updateCase).not.toHaveBeenCalled();
  });
});
