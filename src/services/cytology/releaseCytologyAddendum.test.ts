// src/services/cytology/releaseCytologyAddendum.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockCytologySignOutRecordService', () => ({
  mockCytologySignOutRecordService: { getBySpecimenId: vi.fn(), create: vi.fn() },
}));
vi.mock('../reports/publishReportReleasedEvent', () => ({
  publishReportReleasedEvent: vi.fn().mockResolvedValue({}),
}));
vi.mock('../facilities/mockFacilityService', () => ({
  mockFacilityService: { getById: vi.fn() },
}));

import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { publishReportReleasedEvent } from '../reports/publishReportReleasedEvent';
import { mockFacilityService } from '../facilities/mockFacilityService';
import { releaseCytologyAddendum } from './releaseCytologyAddendum';

const addingUser = { id: 'PATH-001', name: 'Dr. Reed', isPathologist: true };

function priorRecord(overrides: any = {}) {
  return {
    id: 'cyto-signout-1', caseId: 'CASE-1', specimenId: 'SP-1', reviewRecordId: 'rev-1',
    reportContent: { primaryInterpretation: 'Atypical squamous cells of undetermined significance (ASC-US).', specimenAdequacy: ['Satisfactory.'] },
    signedBy: { userId: 'PATH-000', userName: 'Dr. First', isPathologist: true },
    signedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockReset();
  vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockResolvedValue({ ok: true, data: [priorRecord()] } as any);
  vi.mocked(mockCytologySignOutRecordService.create).mockReset();
  vi.mocked(mockCytologySignOutRecordService.create).mockResolvedValue({ ok: true, data: { id: 'cyto-signout-2' } } as any);
  vi.mocked(publishReportReleasedEvent).mockClear();
  vi.mocked(mockFacilityService.getById).mockReset();
  vi.mocked(mockFacilityService.getById).mockResolvedValue({ ok: false, error: 'not found' } as any);
});

describe('releaseCytologyAddendum', () => {
  it('a real specimen with no prior sign-out at all fails honestly \u2014 nothing to add an addendum to', async () => {
    vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockResolvedValue({ ok: true, data: [] } as any);
    const result = await releaseCytologyAddendum('CASE-1', 'SP-1', 'HPV co-testing: positive for HPV 16.', addingUser);
    expect(result.ok).toBe(false);
    expect(mockCytologySignOutRecordService.create).not.toHaveBeenCalled();
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real, successful addendum creates a new, linked sign-out record referencing the SAME reviewRecordId, and publishes the real ADDENDUM event', async () => {
    const result = await releaseCytologyAddendum('CASE-1', 'SP-1', 'HPV co-testing: positive for HPV 16.', addingUser, 'FAC-A');

    expect(result.ok).toBe(true);
    expect(result.signOutRecordId).toBe('cyto-signout-2');
    expect(mockCytologySignOutRecordService.create).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', specimenId: 'SP-1',
      reviewRecordId: 'rev-1', // same review — the diagnosis itself never changes for an addendum
      addsToRecordId: 'cyto-signout-1',
    }));
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', instanceId: 'cyto-signout-2', reportType: 'ADDENDUM', source: 'CYTOLOGY',
      performingFacilityId: 'FAC-A',
    }));
  });

  it('never sends previouslyReportedAs \u2014 an addendum leaves the original diagnosis intact, it never replaces it', async () => {
    await releaseCytologyAddendum('CASE-1', 'SP-1', 'HPV co-testing: positive for HPV 16.', addingUser);
    const call = vi.mocked(publishReportReleasedEvent).mock.calls[0][0];
    expect(call.previouslyReportedAs).toBeUndefined();
  });

  it('the real, original primaryInterpretation is carried forward unchanged into the new record\u2019s own report content', async () => {
    await releaseCytologyAddendum('CASE-1', 'SP-1', 'HPV co-testing: positive for HPV 16.', addingUser);
    const created = vi.mocked(mockCytologySignOutRecordService.create).mock.calls[0][0] as any;
    expect(created.reportContent.primaryInterpretation).toBe('Atypical squamous cells of undetermined significance (ASC-US).');
    expect(created.reportContent.addendumText).toBe('HPV co-testing: positive for HPV 16.');
  });

  it('with multiple prior records for the same specimen, the real addendum adds to the most recently signed one', async () => {
    vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockResolvedValue({
      ok: true, data: [
        priorRecord({ id: 'cyto-signout-original', signedAt: '2026-09-01T00:00:00.000Z' }),
        priorRecord({ id: 'cyto-signout-first-addendum', signedAt: '2026-09-05T00:00:00.000Z' }),
      ],
    } as any);
    await releaseCytologyAddendum('CASE-1', 'SP-1', 'A second addendum.', addingUser);
    expect(mockCytologySignOutRecordService.create).toHaveBeenCalledWith(expect.objectContaining({ addsToRecordId: 'cyto-signout-first-addendum' }));
  });

  it('a real failure creating the addendum sign-out record fails honestly, never publishes an event', async () => {
    vi.mocked(mockCytologySignOutRecordService.create).mockResolvedValue({ ok: false, error: 'boom' } as any);
    const result = await releaseCytologyAddendum('CASE-1', 'SP-1', 'Some addendum.', addingUser);
    expect(result.ok).toBe(false);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real, optional generatePdf callback is forwarded through, untouched, to the published event', async () => {
    const generatePdf = vi.fn();
    await releaseCytologyAddendum('CASE-1', 'SP-1', 'Some addendum.', addingUser, undefined, generatePdf);
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({ generatePdf }));
  });

  describe('real, per PS-277 §1.2.3 — resolves the performing lab\'s own real forceAddendumOnDedicatedPage print policy', () => {
    it('threads the real, resolved policy through onto the new addendum record\'s own reportContent', async () => {
      vi.mocked(mockFacilityService.getById).mockImplementation(async (id) => {
        if (id === 'FAC-A') return { ok: true, data: { id: 'FAC-A', roles: ['performing_lab'], forceAddendumOnDedicatedPagePrintPolicy: true } } as any;
        return { ok: false, error: 'not found' } as any;
      });
      await releaseCytologyAddendum('CASE-1', 'SP-1', 'A real addendum.', addingUser, 'FAC-A');
      const created = vi.mocked(mockCytologySignOutRecordService.create).mock.calls[0][0] as any;
      expect(created.reportContent.forceAddendumOnDedicatedPage).toBe(true);
    });

    it('resolves through an ordering facility\'s own real performingLabFacilityId override to the actual performing lab\'s policy', async () => {
      vi.mocked(mockFacilityService.getById).mockImplementation(async (id) => {
        if (id === 'FAC-ORDERING') return { ok: true, data: { id: 'FAC-ORDERING', roles: ['external_ordering_client'], performingLabFacilityId: 'FAC-LAB' } } as any;
        if (id === 'FAC-LAB') return { ok: true, data: { id: 'FAC-LAB', roles: ['performing_lab'], forceAddendumOnDedicatedPagePrintPolicy: true } } as any;
        return { ok: false, error: 'not found' } as any;
      });
      await releaseCytologyAddendum('CASE-1', 'SP-1', 'A real addendum.', addingUser, 'FAC-ORDERING');
      const created = vi.mocked(mockCytologySignOutRecordService.create).mock.calls[0][0] as any;
      expect(created.reportContent.forceAddendumOnDedicatedPage).toBe(true);
    });

    it('a real, honest undefined — no facilityId given at all — never throws, and the flag is simply left unset', async () => {
      await releaseCytologyAddendum('CASE-1', 'SP-1', 'A real addendum.', addingUser);
      const created = vi.mocked(mockCytologySignOutRecordService.create).mock.calls[0][0] as any;
      expect(created.reportContent.forceAddendumOnDedicatedPage).toBeUndefined();
      expect(mockFacilityService.getById).not.toHaveBeenCalled();
    });

    it('a facilityId that resolves to no real facility at all is a real, honest no-op — never throws', async () => {
      const result = await releaseCytologyAddendum('CASE-1', 'SP-1', 'A real addendum.', addingUser, 'FAC-MISSING');
      expect(result.ok).toBe(true);
      const created = vi.mocked(mockCytologySignOutRecordService.create).mock.calls[0][0] as any;
      expect(created.reportContent.forceAddendumOnDedicatedPage).toBeUndefined();
    });
  });
});
