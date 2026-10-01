import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase, updateCase } = vi.hoisted(() => ({
  getCase: vi.fn(), updateCase: vi.fn(),
}));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase, updateCase } }));

const { releaseMock, countersignMock, getForCaseMock, getActiveAssignmentForUser } = vi.hoisted(() => ({
  releaseMock: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  countersignMock: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  getForCaseMock: vi.fn().mockResolvedValue({ ok: true, data: null }),
  getActiveAssignmentForUser: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));
// Batch 331 (PS-327): signing authority. The signer's staff record (for a
// forensic appointment) and the session are controlled per test.
const { getStaffById, session } = vi.hoisted(() => ({
  getStaffById: vi.fn(),
  session: { current: { id: 'user-attending', role: 'superadmin' } as { id: string; role?: string } | null },
}));
vi.mock('@/services', () => ({
  countersignService: { release: releaseMock, countersign: countersignMock, getForCase: getForCaseMock },
  qaSupervisionAssignmentService: { getActiveAssignmentForUser },
  userService: { getById: getStaffById },
  facilityService: { getById: vi.fn().mockResolvedValue({ ok: false, error: 'not found' }) },
}));
vi.mock('@/services/auth/caseAccessControl', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/auth/caseAccessControl')>()),
  getSessionUser: () => session.current,
}));
const US_APPOINTMENT = { type: 'MEDICOLEGAL_APPOINTMENT', issuingBody: 'OCME', jurisdiction: 'US', effectiveDate: '2020-01-01' };
vi.mock('@/services/quality/mockQaSupervisionAssignmentService', () => ({ FPPE_ACTIVITY_TYPE_ID: 'fppe-activity' }));

const { publishReportReleasedEventMock } = vi.hoisted(() => ({
  publishReportReleasedEventMock: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/reports/publishReportReleasedEvent', () => ({
  publishReportReleasedEvent: publishReportReleasedEventMock,
}));

import { signAutopsyReport } from './signAutopsyReport';
import type { Case } from '@/types/case/Case';

const signedPad = {
  tier: 'PAD' as const,
  frozenPayload: {},
  signedBy: { name: 'Dr. E. Reed', isPathologist: true },
  signedAt: '2026-09-05T14:00:00Z',
};

function baseCase(overrides: Partial<Case> = {}, participants: any[] = []): Case {
  return {
    id: 'case-1',
    accession: { accessionNumber: 'A-2026-1' },
    originHospitalId: 'HOSP-001',
    originEnterpriseId: 'ENT-DEFAULT',
    patient: { id: 'pt-1', firstName: 'John', lastName: 'Doe' },
    specimens: [{ id: 'sp-1', label: 'A', description: 'Body' }],
    order: { priority: 'Routine' },
    status: 'in-progress',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    participants,
    autopsy: {
      jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full',
      addenda: [], ancillaryHold: { active: false },
    },
    ...overrides,
  } as Case;
}

const attendingUser = { id: 'user-attending', name: 'Dr. E. Reed', isPathologist: true };
const residentUser = { id: 'user-resident', name: 'Dr. J. Park', isPathologist: true };

beforeEach(() => {
  getCase.mockReset();
  updateCase.mockReset();
  releaseMock.mockClear();
  countersignMock.mockClear();
  getForCaseMock.mockReset();
  getForCaseMock.mockResolvedValue({ ok: true, data: null });
  getActiveAssignmentForUser.mockReset();
  getActiveAssignmentForUser.mockResolvedValue({ ok: true, data: null });
  publishReportReleasedEventMock.mockClear();
  session.current = { id: 'user-attending', role: 'superadmin' };
  getStaffById.mockReset();
  getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [US_APPOINTMENT] } });
});

describe('signAutopsyReport', () => {
  it('a real, unknown caseId returns a real, honest error, never a silent no-op', async () => {
    getCase.mockResolvedValue(undefined);
    const result = await signAutopsyReport('case-unknown', 'PAD', attendingUser);
    expect(result.ok).toBe(false);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real case with no autopsy record returns a real, honest error', async () => {
    getCase.mockResolvedValue(baseCase({ autopsy: undefined } as any));
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result.ok).toBe(false);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('signing the FAD before a real, signed PAD exists is blocked, never persisted', async () => {
    getCase.mockResolvedValue(baseCase());
    const result = await signAutopsyReport('case-1', 'FAD', attendingUser);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PAD must be signed/i);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('an attending (no resident participant) signing the PAD writes a real padSnapshot and does not change CaseStatus', async () => {
    getCase.mockResolvedValue(baseCase());
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('signed');
    expect(updateCase).toHaveBeenCalledTimes(1);
    const [caseId, updates] = updateCase.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(updates.autopsy.padSnapshot.tier).toBe('PAD');
    expect(updates.autopsy.padSnapshot.signedBy).toEqual({ name: 'Dr. E. Reed', isPathologist: true });
    expect(updates.status).toBeUndefined();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('an attending signing the FAD (with a real, prior signed PAD) writes a real fadSnapshot and transitions CaseStatus to finalized', async () => {
    getCase.mockResolvedValue(baseCase({ autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad } as any }));
    const result = await signAutopsyReport('case-1', 'FAD', attendingUser);
    expect(result.ok).toBe(true);
    const updates = updateCase.mock.calls[0][1];
    expect(updates.autopsy.fadSnapshot.tier).toBe('FAD');
    expect(updates.status).toBe('finalized');
  });

  it('signing the FAD never touches an already-real, existing padSnapshot', async () => {
    getCase.mockResolvedValue(baseCase({ autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad } as any }));
    await signAutopsyReport('case-1', 'FAD', attendingUser);
    const updates = updateCase.mock.calls[0][1];
    expect(updates.autopsy.padSnapshot).toEqual(signedPad);
  });

  it('a real, active resident participant (no attending role) signing the PAD is intercepted \u2014 released for countersign, no padSnapshot written', async () => {
    getCase.mockResolvedValue(baseCase({}, [
      { status: 'active', staffId: 'user-resident', participationTypeIds: ['resident'] },
    ]));
    const result = await signAutopsyReport('case-1', 'PAD', residentUser);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('released_for_countersign');
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(releaseMock.mock.calls[0][0]).toMatchObject({ caseId: 'case-1', residentId: 'user-resident', autopsyReportTier: 'PAD' });
    const updates = updateCase.mock.calls[0][1];
    expect(updates.status).toBe('pending-countersign');
    expect(updates.autopsy).toBeUndefined();
  });

  it('a real, active FPPE provisional hire with an active assignment signing the FAD is intercepted with the correct tier', async () => {
    getActiveAssignmentForUser.mockResolvedValue({ ok: true, data: { supervisorUserId: 'user-attending' } });
    getCase.mockResolvedValue(baseCase(
      { autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad } as any },
      [{ status: 'active', staffId: 'user-resident', participationTypeIds: ['provisional_hire'] }],
    ));
    const result = await signAutopsyReport('case-1', 'FAD', residentUser);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('released_for_countersign');
    expect(releaseMock.mock.calls[0][0]).toMatchObject({ autopsyReportTier: 'FAD' });
  });

  it('a dual-role signer (resident participant AND active attending participant on the same case) is never intercepted', async () => {
    getCase.mockResolvedValue(baseCase({}, [
      { status: 'active', staffId: 'user-resident', participationTypeIds: ['resident', 'attending'] },
    ]));
    const result = await signAutopsyReport('case-1', 'PAD', residentUser);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('signed');
    expect(releaseMock).not.toHaveBeenCalled();
    const updates = updateCase.mock.calls[0][1];
    expect(updates.autopsy.padSnapshot).toBeDefined();
  });

  it('an attending signing a tier with a real, pending CountersignRecord for that same tier completes it alongside writing the real snapshot', async () => {
    getForCaseMock.mockResolvedValue({ ok: true, data: { status: 'pending', autopsyReportTier: 'PAD', caseId: 'case-1' } });
    getCase.mockResolvedValue(baseCase());
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result.ok).toBe(true);
    expect(countersignMock).toHaveBeenCalledTimes(1);
    expect(countersignMock.mock.calls[0][0]).toMatchObject({ caseId: 'case-1', attendingId: 'user-attending' });
    const updates = updateCase.mock.calls[0][1];
    expect(updates.autopsy.padSnapshot).toBeDefined();
  });

  it('an attending signing with no real, pending CountersignRecord at all never calls countersign(), but still writes the real snapshot', async () => {
    getForCaseMock.mockResolvedValue({ ok: true, data: null });
    getCase.mockResolvedValue(baseCase());
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result.ok).toBe(true);
    expect(countersignMock).not.toHaveBeenCalled();
    expect(updateCase.mock.calls[0][1].autopsy.padSnapshot).toBeDefined();
  });

  it('an attending signing the PAD captures the real, existing report text (orchSections) in the snapshot \u2014 the same generic diagnosis data every specialty already writes, not an invented field', async () => {
    getCase.mockResolvedValue(baseCase({
      orchSections: [
        { id: 'gross', label: 'Gross Description', text: 'Heart weighs 420g...', aiGenerated: '', userEdited: true, isStreaming: false },
        { id: 'diagnosis', label: 'Diagnosis', text: 'Acute myocardial infarction, anterior wall.', aiGenerated: '', userEdited: true, isStreaming: false },
      ],
    } as any));
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result.ok).toBe(true);
    const updates = updateCase.mock.calls[0][1];
    const capturedSections = updates.autopsy.padSnapshot.frozenPayload.sections;
    expect(capturedSections).toEqual([
      { id: 'gross', label: 'Gross Description', text: 'Heart weighs 420g...' },
      { id: 'diagnosis', label: 'Diagnosis', text: 'Acute myocardial infarction, anterior wall.' },
    ]);
  });

  it('a resident releasing the PAD for countersign captures the real report text in the comparison snapshot the attending\u2019s eventual delta is computed against', async () => {
    getCase.mockResolvedValue(baseCase({
      orchSections: [{ id: 'diagnosis', label: 'Diagnosis', text: 'Preliminary: cardiac tamponade.', aiGenerated: '', userEdited: true, isStreaming: false }],
    } as any, [{ status: 'active', staffId: 'user-resident', participationTypeIds: ['resident'] }]));
    await signAutopsyReport('case-1', 'PAD', residentUser);
    const snapshot = releaseMock.mock.calls[0][0].releasedAnswersSnapshot['case-1'];
    expect(snapshot['section_diagnosis']).toBe('Preliminary: cardiac tamponade.');
  });

  it('an attending signing the FAD never completes a real, pending PAD-tier CountersignRecord \u2014 tiers must match exactly', async () => {
    getForCaseMock.mockResolvedValue({ ok: true, data: { status: 'pending', autopsyReportTier: 'PAD', caseId: 'case-1' } });
    getCase.mockResolvedValue(baseCase({ autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad } as any }));
    const result = await signAutopsyReport('case-1', 'FAD', attendingUser);
    expect(result.ok).toBe(true);
    expect(countersignMock).not.toHaveBeenCalled();
    expect(updateCase.mock.calls[0][1].autopsy.fadSnapshot).toBeDefined();
  });
});

describe('signAutopsyReport — Report_Released_Event wiring, per direct follow-up ("wire in Autopsy")', () => {
  it("a real, direct PAD sign publishes a real PRELIMINARY event — an interim milestone, matching its own real, established CaseStatus-unchanged posture", async () => {
    getCase.mockResolvedValue(baseCase());
    await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(publishReportReleasedEventMock).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'case-1', reportType: 'PRELIMINARY', releasedBy: { id: 'user-attending', name: 'Dr. E. Reed' },
    }));
  });

  it("a real, direct FAD sign publishes a real FINAL event — the case's own real terminal event", async () => {
    getCase.mockResolvedValue(baseCase({ autopsy: { jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full', addenda: [], ancillaryHold: { active: false }, padSnapshot: signedPad } as any }));
    await signAutopsyReport('case-1', 'FAD', attendingUser);
    expect(publishReportReleasedEventMock).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case-1', reportType: 'FINAL' }));
  });

  it('a real, thin generatePdf callback is forwarded through to the published event untouched', async () => {
    getCase.mockResolvedValue(baseCase());
    const generatePdf = vi.fn();
    await signAutopsyReport('case-1', 'PAD', attendingUser, generatePdf);
    expect(publishReportReleasedEventMock).toHaveBeenCalledWith(expect.objectContaining({ generatePdf }));
  });

  it('a real, provisional-hire sign genuinely intercepted for countersign never publishes any event at all — no real snapshot exists yet to report', async () => {
    getCase.mockResolvedValue(baseCase({} as any, [{ status: 'active', staffId: 'user-resident', participationTypeIds: ['resident'] }]));
    await signAutopsyReport('case-1', 'PAD', residentUser);
    expect(publishReportReleasedEventMock).not.toHaveBeenCalled();
  });
});

describe('signAutopsyReport — signing authority (Batch 331, PS-327)', () => {
  const hospitalCase = (participants: any[] = []) => baseCase({
    autopsy: { jurisdiction: 'US', caseAuthority: 'hospital_consented', scope: 'full', addenda: [], ancillaryHold: { active: false } } as any,
  }, participants);

  it('refuses a signer who is neither an eligible participant nor an administrator', async () => {
    session.current = { id: 'user-other', role: 'pathologist' };
    getCase.mockResolvedValue(hospitalCase([{ staffId: 'user-attending', status: 'active', participationTypeIds: ['attending'] }]));
    const result = await signAutopsyReport('case-1', 'PAD', { id: 'user-other', name: 'Dr. Other', isPathologist: true });
    expect(result).toMatchObject({ ok: false, errorCode: 'NOT_AUTHORIZED' });
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('lets the assigned attending sign a hospital autopsy without any forensic appointment', async () => {
    session.current = { id: 'user-attending', role: 'pathologist' };
    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [] } });
    getCase.mockResolvedValue(hospitalCase([{ staffId: 'user-attending', status: 'active', participationTypeIds: ['attending'] }]));
    const result = await signAutopsyReport('case-1', 'PAD', attendingUser);
    expect(result).toMatchObject({ ok: true, outcome: 'signed' });
  });

  it('requires an active appointment for the case jurisdiction on a forensic case, even for an administrator', async () => {
    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [] } });
    getCase.mockResolvedValue(baseCase());
    expect(await signAutopsyReport('case-1', 'PAD', attendingUser)).toMatchObject({ ok: false, errorCode: 'NO_FORENSIC_APPOINTMENT' });

    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [{ ...US_APPOINTMENT, jurisdiction: 'CA' }] } });
    expect(await signAutopsyReport('case-1', 'PAD', attendingUser)).toMatchObject({ ok: false, errorCode: 'NO_FORENSIC_APPOINTMENT' });

    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [{ ...US_APPOINTMENT, expirationDate: '2021-01-01' }] } });
    expect(await signAutopsyReport('case-1', 'PAD', attendingUser)).toMatchObject({ ok: false, errorCode: 'NO_FORENSIC_APPOINTMENT' });
    expect(updateCase).not.toHaveBeenCalled();

    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [US_APPOINTMENT] } });
    expect(await signAutopsyReport('case-1', 'PAD', attendingUser)).toMatchObject({ ok: true, outcome: 'signed' });
  });

  it('still routes a resident on a forensic case for countersign rather than refusing', async () => {
    session.current = { id: 'user-resident', role: 'pathologist' };
    getStaffById.mockResolvedValue({ ok: true, data: { providerCredentials: [] } });
    getCase.mockResolvedValue(baseCase({}, [{ staffId: 'user-resident', status: 'active', participationTypeIds: ['resident'] }]));
    const result = await signAutopsyReport('case-1', 'PAD', residentUser);
    expect(result).toMatchObject({ ok: true, outcome: 'released_for_countersign' });
  });
});
