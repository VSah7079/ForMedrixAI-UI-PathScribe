// src/services/reports/releasePreliminaryReport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../cases/CaseRouter', () => ({
  caseRouter: { getCase: vi.fn(), updateCase: vi.fn() },
}));
vi.mock('./publishReportReleasedEvent', () => ({
  publishReportReleasedEvent: vi.fn(),
}));

import { caseRouter } from '../cases/CaseRouter';
import { publishReportReleasedEvent } from './publishReportReleasedEvent';
import { releasePreliminaryReport } from './releasePreliminaryReport';

const releasingUser = { id: 'user-1', name: 'Dr. E. Reed', role: 'Pathologist' };

function makeCase(overrides: any = {}) {
  return {
    id: 'CASE-1',
    reportingMode: 'orchestrator',
    status: 'in-progress',
    patient: { mrn: 'MRN-1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1980-01-01', organisationId: 'ORG-1' },
    diagnostic: {},
    synopticReports: [{ instanceId: 'INST-1', specimenId: 'SPEC-1', templateId: 'tpl-1', templateName: 'Template', status: 'in-progress', answers: {} }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(caseRouter.getCase).mockReset();
  vi.mocked(caseRouter.updateCase).mockReset();
  vi.mocked(caseRouter.updateCase).mockResolvedValue({} as any);
  vi.mocked(publishReportReleasedEvent).mockReset();
  vi.mocked(publishReportReleasedEvent).mockResolvedValue({ dispatchedCount: 1 });
});

describe('releasePreliminaryReport', () => {
  it('a real, unknown caseId returns a real, honest error, never a silent no-op', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(undefined);
    const result = await releasePreliminaryReport('CASE-X', releasingUser);
    expect(result.ok).toBe(false);
    expect(result.dispatchedCount).toBe(0);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it("an assist-mode case is refused — Preliminary release is only ever this app's to send for orchestration-mode cases", async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ reportingMode: 'assist' }) as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(false);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('a real, already-finalized case is refused — real, existing sign-out dispatch is the correct path there, never this one', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ status: 'finalized' }) as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already final/i);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it("a real case in pending-release is also refused, reusing resolveIsFinalStatus's own real definition rather than a second, separate check", async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ status: 'pending-release' }) as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(false);
  });

  it('pending-countersign is NOT refused — still genuinely Preliminary, per PS-292\u2019s own "stay strict" decision', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ status: 'pending-countersign' }) as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(true);
    expect(result.dispatchedCount).toBe(1);
  });

  it('a real, in-progress case with a real instance publishes exactly one real PRELIMINARY event, through the one, shared publish point, and never touches CaseStatus', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);

    expect(result.ok).toBe(true);
    expect(result.dispatchedCount).toBe(1);
    expect(publishReportReleasedEvent).toHaveBeenCalledTimes(1);
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'CASE-1', reportType: 'PRELIMINARY', releasedBy: { id: 'user-1', name: 'Dr. E. Reed' },
    }));

    const updateCall = vi.mocked(caseRouter.updateCase).mock.calls[0];
    expect(updateCall[0]).toBe('CASE-1');
    expect(updateCall[1]).not.toHaveProperty('status');
    expect((updateCall[1] as any).diagnostic.preliminaryRecordedAt).toBeDefined();
    expect((updateCall[1] as any).diagnostic.reviewerRole).toBe('Pathologist');
  });

  it('forwards a real, optional generatePdf callback and the case\u2019s own real performing facility into the published event \u2014 Component B\u2019s own real print dispatch needs both', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ order: { facilityId: 'FAC-A' } }) as any);
    const generatePdf = vi.fn();
    await releasePreliminaryReport('CASE-1', releasingUser, generatePdf);
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      performingFacilityId: 'FAC-A', generatePdf,
    }));
  });

  it('an omitted generatePdf callback is forwarded as undefined, never a fabricated stand-in \u2014 a caller with no real access to the PDF-rendering closure honestly has none to give', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    await releasePreliminaryReport('CASE-1', releasingUser);
    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({ generatePdf: undefined }));
  });

  it('a real, orchestration-mode case with zero real instances yet returns an honest ok:true, dispatchedCount:0 — never conflated with a failure, and never even publishes an event', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase({ synopticReports: [] }) as any);
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(true);
    expect(result.dispatchedCount).toBe(0);
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('a real, honest dispatchedCount of 0 from the publish point itself (every real instance genuinely failed to build a payload) never writes the attestation fields either', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    vi.mocked(publishReportReleasedEvent).mockResolvedValue({ dispatchedCount: 0 });
    const result = await releasePreliminaryReport('CASE-1', releasingUser);
    expect(result.ok).toBe(true);
    expect(result.dispatchedCount).toBe(0);
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('never dedups at this level — a second, real release for the same case publishes a second, real event, unlike the strict one-time FINAL dispatch', async () => {
    vi.mocked(caseRouter.getCase).mockResolvedValue(makeCase() as any);
    await releasePreliminaryReport('CASE-1', releasingUser);
    await releasePreliminaryReport('CASE-1', releasingUser);
    expect(publishReportReleasedEvent).toHaveBeenCalledTimes(2);
  });
});
