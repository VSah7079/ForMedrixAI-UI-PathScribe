// src/services/cytology/releaseCytologyCorrection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mockCytologyReviewRecordService', () => ({
  mockCytologyReviewRecordService: { create: vi.fn() },
}));
vi.mock('./mockCytologySignOutRecordService', () => ({
  mockCytologySignOutRecordService: { getBySpecimenId: vi.fn(), create: vi.fn() },
}));
vi.mock('./resolveCytologyReportContent', () => ({
  resolveCytologyReportContent: vi.fn(),
}));
vi.mock('../reports/publishReportReleasedEvent', () => ({
  publishReportReleasedEvent: vi.fn().mockResolvedValue({}),
}));

import { mockCytologyReviewRecordService } from './mockCytologyReviewRecordService';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { resolveCytologyReportContent } from './resolveCytologyReportContent';
import { publishReportReleasedEvent } from '../reports/publishReportReleasedEvent';
import { releaseCytologyCorrection } from './releaseCytologyCorrection';

const correctingUser = { id: 'PATH-001', name: 'Dr. Reed', isPathologist: true };
const correctedFindings = { primaryInterpretationId: 'cat-nilm', requiresPathologistReview: true };
const patient = { name: 'Jane Roe' };
const order = { accessionNumber: 'S26-0001-CYT-001', facilityId: 'FAC-A' };
const specimen = { typeDescription: 'Pap smear' };

function priorRecord(overrides: any = {}) {
  return {
    id: 'cyto-signout-1', caseId: 'CASE-1', specimenId: 'SP-1', reviewRecordId: 'rev-1',
    reportContent: { primaryInterpretation: 'Benign fibroadenoma.' },
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
  vi.mocked(mockCytologyReviewRecordService.create).mockReset();
  vi.mocked(mockCytologyReviewRecordService.create).mockResolvedValue({ ok: true, data: { id: 'rev-2' } } as any);
  vi.mocked(resolveCytologyReportContent).mockReset();
  vi.mocked(resolveCytologyReportContent).mockReturnValue({ primaryInterpretation: 'Invasive ductal carcinoma.' } as any);
  vi.mocked(publishReportReleasedEvent).mockClear();
});

describe('releaseCytologyCorrection', () => {
  it('a real specimen with no prior sign-out at all fails honestly \u2014 nothing to correct, nothing created', async () => {
    vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockResolvedValue({ ok: true, data: [] } as any);
    const result = await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser);
    expect(result.ok).toBe(false);
    expect(mockCytologyReviewRecordService.create).not.toHaveBeenCalled();
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real, successful correction creates a new review, a new linked sign-out record, and publishes the real CORRECTED event', async () => {
    const result = await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser);

    expect(result.ok).toBe(true);
    expect(result.signOutRecordId).toBe('cyto-signout-2');
    expect(mockCytologyReviewRecordService.create).toHaveBeenCalledWith(expect.objectContaining({
      specimenId: 'SP-1', caseId: 'CASE-1', role: 'pathologist_review', primaryInterpretationId: 'cat-nilm',
      recordedBy: { userId: 'PATH-001', userName: 'Dr. Reed' },
    }));
    expect(mockCytologySignOutRecordService.create).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', specimenId: 'SP-1', reviewRecordId: 'rev-2', amendsRecordId: 'cyto-signout-1',
    }));
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', instanceId: 'cyto-signout-2', reportType: 'CORRECTED', source: 'CYTOLOGY',
      previouslyReportedAs: 'Benign fibroadenoma.', performingFacilityId: 'FAC-A',
    }));
  });

  it('with multiple prior records for the same specimen, the real correction amends the most recently signed one \u2014 never the original if a correction already happened since', async () => {
    vi.mocked(mockCytologySignOutRecordService.getBySpecimenId).mockResolvedValue({
      ok: true, data: [
        priorRecord({ id: 'cyto-signout-original', signedAt: '2026-09-01T00:00:00.000Z', reportContent: { primaryInterpretation: 'Original finding.' } }),
        priorRecord({ id: 'cyto-signout-first-correction', signedAt: '2026-09-05T00:00:00.000Z', reportContent: { primaryInterpretation: 'First corrected finding.' } }),
      ],
    } as any);

    await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser);

    expect(mockCytologySignOutRecordService.create).toHaveBeenCalledWith(expect.objectContaining({ amendsRecordId: 'cyto-signout-first-correction' }));
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({ previouslyReportedAs: 'First corrected finding.' }));
  });

  it('a real failure creating the corrected review fails honestly, never creates a sign-out record or publishes an event', async () => {
    vi.mocked(mockCytologyReviewRecordService.create).mockResolvedValue({ ok: false, error: 'boom' } as any);
    const result = await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser);
    expect(result.ok).toBe(false);
    expect(mockCytologySignOutRecordService.create).not.toHaveBeenCalled();
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real failure creating the corrected sign-out record fails honestly, never publishes an event', async () => {
    vi.mocked(mockCytologySignOutRecordService.create).mockResolvedValue({ ok: false, error: 'boom' } as any);
    const result = await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser);
    expect(result.ok).toBe(false);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real, optional generatePdf callback is forwarded through, untouched, to the published event', async () => {
    const generatePdf = vi.fn();
    await releaseCytologyCorrection('CASE-1', 'SP-1', correctedFindings, [], patient, order, specimen, correctingUser, generatePdf);
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({ generatePdf }));
  });
});
