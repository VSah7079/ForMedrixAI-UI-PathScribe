// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useAmendmentWorkflow.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// See useLisIntegration.test.ts's header for the unit/integration split
// rationale and the @vitest-environment override rationale.
//
// The largest, most branch-dense hook tested so far. All external services
// (amendmentService, reportVersionService, aiBehaviorService,
// lisAmendmentNoticeService, caseRouter, mockAuditService, sendEmail,
// getOrganisationByHospitalId, userService, and the dynamic imports for
// templateService/generateAiSuggestionsForReport) are mocked — this hook's
// own sequencing and branching logic is under test, not whether the mock
// services themselves behave correctly (they have their own tests).
//
// Real update alongside this hook's own i18n sweep conversion: it now
// calls useTranslation(), so the real i18next instance needs to be
// initialized before render — same side-effect import main.tsx itself
// uses (`import '@/i18n/config'`) — otherwise t() has nothing to
// resolve keys against and the showToast(...) assertions below would
// see the raw key string instead of its English text.
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAmendmentWorkflow } from '../useAmendmentWorkflow';
import { publishReportReleasedEvent } from '@/services/reports/publishReportReleasedEvent';
import { resolveFinalDiagnosisText } from '@/services/reportTemplates/resolveFinalDiagnosisText';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import type { Case } from '@/types/case/Case';

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { updateCase: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/reports/publishReportReleasedEvent', () => ({
  publishReportReleasedEvent: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/reportTemplates/resolveFinalDiagnosisText', () => ({
  resolveFinalDiagnosisText: vi.fn(),
}));
vi.mock('@/services/auditlog/mockAuditService', () => ({
  mockAuditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/organisation/organisationService', () => ({
  getOrganisationByHospitalId: vi.fn().mockReturnValue({ id: 'org-1', name: 'Test Org' }),
}));
vi.mock('@/services/communications/notificationService', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services', () => ({
  userService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'u1', email: 'admin@test.com', roles: ['Admin'], status: 'Active', organisationId: 'org-1' }] }) },
  amendmentService: {
    release: vi.fn().mockResolvedValue({ ok: true, data: { type: 'amendment' } }),
    startDraft: vi.fn().mockResolvedValue({ ok: true, data: { id: 'amend-1', sequenceNumber: 1 } }),
    captureFields: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  },
  reportVersionService: {
    create: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  },
  aiBehaviorService: { get: vi.fn().mockResolvedValue({ ok: true, data: { microscopicEnabled: true } }) },
  lisAmendmentNoticeService: { updateStatus: vi.fn().mockResolvedValue({ ok: true }) },
}));
vi.mock('@/services/templates/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue({ template: { sections: [{ fields: [{ id: 'f1' }] }] } }),
}));
vi.mock('@/services/cases/mockCaseService', () => ({
  generateAiSuggestionsForReport: vi.fn().mockResolvedValue({ f1: 'suggested value' }),
}));

function makeTestCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'TEST-CASE-AMEND',
    status: 'finalized',
    reportingMode: 'orchestration',
    originHospitalId: 'hosp-1',
    synopticReports: [{ instanceId: 'SR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', answers: { f1: 'x' }, status: 'finalized' }],
    ...overrides,
  } as unknown as Case;
}

const testSigningUser = { id: 'PATH-001', name: 'Dr. Test' } as any;

function baseParams(overrides: Partial<Parameters<typeof useAmendmentWorkflow>[0]> = {}) {
  return {
    caseData: makeTestCase(),
    setCaseData: vi.fn(),
    signingUser: testSigningUser,
    showToast: vi.fn(),
    activeReportInstanceId: 'SR-1',
    knownVersionRef: { current: 1 },
    setConcurrencyConflict: vi.fn(),
    sendSynopticReportToLis: vi.fn().mockResolvedValue({ ok: true }),
    generateReportPdfSnapshot: vi.fn().mockResolvedValue({ pdfBase64: 'abc' }),
    pendingLisNotice: null,
    setPendingLisNotice: vi.fn(),
    amendmentMode: 'amendment' as const,
    amendmentText: '',
    setAmendmentText: vi.fn(),
    setAmendmentMode: vi.fn(),
    setShowAmendmentModal: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAmendmentWorkflow — releasePendingAmendmentOrAddendum', () => {
  it('does nothing and returns undefined with no caseData.id or no activeReportInstanceId', async () => {
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData: null })));
    const released = await act(async () => result.current.releasePendingAmendmentOrAddendum());
    expect(released).toBeUndefined();
  });

  it('releases a pending addendum, updates lastRevisionType, and sends to LIS as new_instance when there is no concurrent amendment (CoPilot/assist mode)', async () => {
    const { amendmentService } = await import('@/services');
    vi.mocked(amendmentService.release).mockResolvedValueOnce({ ok: true, data: { type: 'addendum' } } as any);
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAddendumId: 'amend-1', templateName: 'T1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, sendSynopticReportToLis })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(sendSynopticReportToLis).toHaveBeenCalledWith(expect.objectContaining({ kind: 'new_instance' }));
    expect(publishReportReleasedEvent).not.toHaveBeenCalled();
  });

  it('sends corrected_with_addition instead, when another instance has a concurrent pending amendment (CoPilot/assist mode)', async () => {
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [
        { instanceId: 'SR-1', pendingAddendumId: 'amend-1', templateName: 'T1', answers: {} },
        { instanceId: 'SR-2', pendingAmendmentId: 'amend-2', answers: {} },
      ] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, sendSynopticReportToLis })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(sendSynopticReportToLis).toHaveBeenCalledWith(expect.objectContaining({ kind: 'corrected_with_addition' }));
  });

  it('releases a pending amendment, sets case status back to finalized, sends to LIS as corrected, and returns the released amendment id (CoPilot/assist mode)', async () => {
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, sendSynopticReportToLis, setCaseData })));

    const released = await act(async () => result.current.releasePendingAmendmentOrAddendum());

    expect(released).toBe('amend-1');
    expect(sendSynopticReportToLis).toHaveBeenCalledWith(expect.objectContaining({ kind: 'corrected' }));
    const updater = setCaseData.mock.calls[0][0];
    const patch = updater(caseData);
    expect(patch.status).toBe('finalized');
  });

  it('a real, orchestration-mode addendum release publishes a real ADDENDUM event through publishReportReleasedEvent instead \u2014 never sendSynopticReportToLis, per direct follow-up ("wire that in")', async () => {
    const { amendmentService } = await import('@/services');
    vi.mocked(amendmentService.release).mockResolvedValueOnce({ ok: true, data: { type: 'addendum' } } as any);
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const caseData = makeTestCase({
      reportingMode: 'orchestration' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAddendumId: 'amend-1', templateName: 'T1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, sendSynopticReportToLis })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      caseId: caseData.id, instanceId: 'SR-1', reportType: 'ADDENDUM',
    }));
    expect(sendSynopticReportToLis).not.toHaveBeenCalled();
  });

  it('a real, orchestration-mode correction release publishes a real CORRECTED event through publishReportReleasedEvent instead \u2014 never sendSynopticReportToLis', async () => {
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const caseData = makeTestCase({
      reportingMode: 'orchestration' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, sendSynopticReportToLis })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
      caseId: caseData.id, instanceId: 'SR-1', reportType: 'CORRECTED',
    }));
    expect(sendSynopticReportToLis).not.toHaveBeenCalled();
  });

  it('creates a CoPilot version record with the real PDF snapshot when reportingMode is assist', async () => {
    const { reportVersionService } = await import('@/services');
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: { f1: 'real answer' } }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(reportVersionService.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'assist', trigger: 'amendment', instanceId: 'SR-1',
    }));
  });

  it('does NOT create a version record for Orchestration mode', async () => {
    const { reportVersionService } = await import('@/services');
    const caseData = makeTestCase({
      reportingMode: 'orchestration' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

    expect(reportVersionService.create).not.toHaveBeenCalled();
  });

  it('on a real ConcurrencyConflictError, surfaces the conflict modal WITH blockOverride true and returns undefined', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockRejectedValueOnce(new ConcurrencyConflictError('TEST-CASE-AMEND', 1, 3));
    const setConcurrencyConflict = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setConcurrencyConflict })));

    const released = await act(async () => result.current.releasePendingAmendmentOrAddendum());

    expect(setConcurrencyConflict).toHaveBeenCalledWith({ actualVersion: 3, blockOverride: true });
    expect(released).toBeUndefined();
  });
});

describe('useAmendmentWorkflow — alertAdminsOfUnresolvedDrift', () => {
  it('logs an error and never sends email when the organisation cannot be resolved', async () => {
    const { getOrganisationByHospitalId } = await import('@/services/organisation/organisationService');
    vi.mocked(getOrganisationByHospitalId).mockReturnValueOnce(null);
    const { sendEmail } = await import('@/services/communications/notificationService');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));
    await act(async () => { await result.current.alertAdminsOfUnresolvedDrift('CASE-1', 2, 'failed'); });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('sends a real email to real, active admins within the same organisation, and audit-logs the alert', async () => {
    const { sendEmail } = await import('@/services/communications/notificationService');
    const { mockAuditService } = await import('@/services/auditlog/mockAuditService');
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));

    await act(async () => { await result.current.alertAdminsOfUnresolvedDrift('CASE-1', 3, 'skipped'); });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['admin@test.com'] }));
    expect(mockAuditService.logEvent).toHaveBeenCalled();
  });

  it('never throws back to the caller, even if the internal alert logic itself fails', async () => {
    const { userService } = await import('@/services');
    vi.mocked(userService.getAll).mockRejectedValueOnce(new Error('service down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));

    await expect(act(async () => { await result.current.alertAdminsOfUnresolvedDrift('CASE-1', 1, 'failed'); })).resolves.not.toThrow();
    errorSpy.mockRestore();
  });
});

describe('useAmendmentWorkflow — protocol change review', () => {
  it('handleProtocolChangesDetected ignores an empty changes list', () => {
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));
    act(() => { result.current.handleProtocolChangesDetected([]); });
    expect(result.current.showProtoReview).toBe(false);
  });

  it('handleProtocolChangesDetected stores real changes and opens the review modal', () => {
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));
    const changes = [{ id: 'c1', action: 'add', specimenId: 'SP-1' }] as any;
    act(() => { result.current.handleProtocolChangesDetected(changes); });
    expect(result.current.showProtoReview).toBe(true);
    expect(result.current.protoChanges).toEqual(changes);
  });

  it('handleProtoCommit with a "remove" action filters the matching report out entirely', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', specimenId: 'SP-1', templateId: 'tmpl-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setCaseData })));
    act(() => { result.current.handleProtocolChangesDetected([{ id: 'c1', action: 'remove', currentInstanceId: 'SR-1' } as any]); });

    await act(async () => { await result.current.handleProtoCommit(['c1']); });

    const patch = setCaseData.mock.calls[0][0];
    expect(patch.synopticReports).toHaveLength(0);
    expect(result.current.showProtoReview).toBe(false);
  });

  it('handleProtoCommit with an "add" action creates a real new report WITH AI suggestions, when AI is enabled', async () => {
    const { generateAiSuggestionsForReport } = await import('@/services/cases/mockCaseService');
    const setCaseData = vi.fn();
    const caseData = makeTestCase({ synopticReports: [] as any });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setCaseData })));
    act(() => { result.current.handleProtocolChangesDetected([{ id: 'c1', action: 'add', specimenId: 'SP-2', proposedTemplateId: 'tmpl-new', proposedTemplateName: 'New Template' } as any]); });

    await act(async () => { await result.current.handleProtoCommit(['c1']); });

    expect(generateAiSuggestionsForReport).toHaveBeenCalled();
    const patch = setCaseData.mock.calls[0][0];
    expect(patch.synopticReports).toHaveLength(1);
    expect(patch.synopticReports[0]).toMatchObject({ specimenId: 'SP-2', templateId: 'tmpl-new', aiSuggestions: { f1: 'suggested value' } });
  });

  it('handleProtoCommit skips AI suggestion generation entirely when the Microscopic-Driven AI toggle is disabled', async () => {
    const { aiBehaviorService } = await import('@/services');
    vi.mocked(aiBehaviorService.get).mockResolvedValueOnce({ ok: true, data: { microscopicEnabled: false } } as any);
    const { generateAiSuggestionsForReport } = await import('@/services/cases/mockCaseService');
    const caseData = makeTestCase({ synopticReports: [] as any });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData })));
    act(() => { result.current.handleProtocolChangesDetected([{ id: 'c1', action: 'add', specimenId: 'SP-2', proposedTemplateId: 'tmpl-new' } as any]); });

    await act(async () => { await result.current.handleProtoCommit(['c1']); });

    expect(generateAiSuggestionsForReport).not.toHaveBeenCalled();
  });

  it('handleProtoCommit with a "replace" action clears the old answers rather than carrying them forward under the new template', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', specimenId: 'SP-1', templateId: 'tmpl-old', answers: { old_field: 'stale value' } }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setCaseData })));
    act(() => { result.current.handleProtocolChangesDetected([{ id: 'c1', action: 'replace', currentInstanceId: 'SR-1', proposedTemplateId: 'tmpl-new', proposedTemplateName: 'New' } as any]); });

    await act(async () => { await result.current.handleProtoCommit(['c1']); });

    const patch = setCaseData.mock.calls[0][0];
    expect(patch.synopticReports[0].answers).toEqual({});
    expect(patch.synopticReports[0].templateId).toBe('tmpl-new');
  });
});

describe('useAmendmentWorkflow — openAmendmentDraft', () => {
  it('starts a real draft, captures the pre-override snapshot, and transitions a pending LIS notice to synoptic_amended', async () => {
    const { amendmentService, lisAmendmentNoticeService } = await import('@/services');
    const setPendingLisNotice = vi.fn();
    const pendingLisNotice = { id: 'notice-1', lisAmendmentSummary: 'x', receivedAt: '' };
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', answers: { f1: 'original value' } }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, pendingLisNotice, setPendingLisNotice })));

    await act(async () => { await result.current.openAmendmentDraft('amendment'); });

    expect(amendmentService.startDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'amendment' }));
    expect(result.current.amendmentDraftId).toBe('amend-1');
    expect(lisAmendmentNoticeService.updateStatus).toHaveBeenCalledWith('notice-1', 'synoptic_amended');
    expect(setPendingLisNotice).toHaveBeenCalledWith(null);
  });

  it('filters version history down to only entries for the active report instance, sorted by version number', async () => {
    const { reportVersionService } = await import('@/services');
    vi.mocked(reportVersionService.getByCaseId).mockResolvedValueOnce({
      ok: true,
      data: [
        { instanceId: 'SR-OTHER', versionNumber: 1, synopticAnswersSnapshot: {}, createdAt: '', createdBy: {} },
        { instanceId: 'SR-1', versionNumber: 2, synopticAnswersSnapshot: { f1: 'v2' }, createdAt: '', createdBy: {} },
        { instanceId: 'SR-1', versionNumber: 1, synopticAnswersSnapshot: { f1: 'v1' }, createdAt: '', createdBy: {} },
      ] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));

    await act(async () => { await result.current.openAmendmentDraft('amendment'); });

    expect(result.current.versionHistory.map(v => v.versionNumber)).toEqual([1, 2]);
    expect(result.current.versionHistory.every(v => (v as any).instanceId !== 'SR-OTHER')).toBe(true);
  });
});

describe('useAmendmentWorkflow — handleFieldOverridesConfirmed', () => {
  it('returns early and persists nothing when given an empty overrides object', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams()));
    await act(async () => { await result.current.handleFieldOverridesConfirmed({}); });
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('applies real overrides with full lineage tracking, and marks only the overridden fields as disputed', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', answers: { f1: 'old', f2: 'untouched' }, aiSuggestions: { f1: { verification: 'verified' }, f2: { verification: 'verified' } } }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setCaseData })));

    await act(async () => {
      await result.current.handleFieldOverridesConfirmed({ f1: { value: 'new overridden value', sourceVersionNumber: 2 } as any });
    });

    const patch = setCaseData.mock.calls[0][0];
    const report = patch.synopticReports[0];
    expect(report.answers.f1).toBe('new overridden value');
    expect(report.answers.f2).toBe('untouched');
    expect(report.fieldLineage.f1.wasOverride).toBe(true);
    expect(report.aiSuggestions.f1.verification).toBe('disputed');
    expect(report.aiSuggestions.f2.verification).toBe('verified'); // untouched field's verification is left alone
  });
});

describe('useAmendmentWorkflow — handleRequestAmendment', () => {
  it('resumes an existing draft, using the REAL type from the record rather than defaulting to amendment', async () => {
    const { amendmentService } = await import('@/services');
    vi.mocked(amendmentService.getByCaseId).mockResolvedValueOnce({
      ok: true,
      data: [{ id: 'amend-1', type: 'correction', sequenceNumber: 2, explanationOfChange: 'Fixed a real typo', notification: {} }] as any,
    });
    const setAmendmentMode = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1' }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setAmendmentMode })));

    await act(async () => { await result.current.handleRequestAmendment(); });

    expect(setAmendmentMode).toHaveBeenCalledWith('correction');
    expect(result.current.amendmentDraftId).toBe('amend-1');
  });

  it('starts a genuinely new draft when there is no existing pendingAmendmentId', async () => {
    const { amendmentService } = await import('@/services');
    const setAmendmentMode = vi.fn();
    const caseData = makeTestCase({ synopticReports: [{ instanceId: 'SR-1' }] as any });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setAmendmentMode })));

    await act(async () => { await result.current.handleRequestAmendment(); });

    expect(setAmendmentMode).toHaveBeenCalledWith('amendment');
    expect(amendmentService.startDraft).toHaveBeenCalled();
  });
});

describe('useAmendmentWorkflow — handleAmendmentSubmit', () => {
  it('the unlock path (amendment/correction mode) captures fields, unlocks the report to in-progress, and shows the real unlock toast', async () => {
    const { amendmentService } = await import('@/services');
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const setShowAmendmentModal = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [{ instanceId: 'SR-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, showToast, setCaseData, setShowAmendmentModal, amendmentMode: 'amendment' })));
    await act(async () => { await result.current.openAmendmentDraft('amendment'); });

    await act(async () => {
      await result.current.handleAmendmentSubmit({ explanationOfChange: 'Real correction reason', clinicianName: 'Dr. Notified', method: 'phone' as any, reasonId: 'AMEND_DIAG' });
    });

    expect(amendmentService.captureFields).toHaveBeenCalled();
    const calls = setCaseData.mock.calls;
    const patch = calls[calls.length - 1][0];
    expect(patch.status).toBe('in-progress');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('unlocked for amendment'));
    expect(setShowAmendmentModal).toHaveBeenCalledWith(false);
  });

  it('the release path (addendum mode) releases directly without unlocking anything, and shows the real release toast', async () => {
    const { amendmentService } = await import('@/services');
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({ synopticReports: [{ instanceId: 'SR-1', answers: {} }] as any });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, showToast, setCaseData, amendmentMode: 'addendum' })));
    await act(async () => { await result.current.openAmendmentDraft('addendum'); });

    await act(async () => {
      await result.current.handleAmendmentSubmit({ addendumTitle: 'New finding', explanationOfChange: 'Additional info', reasonId: 'ADD_IHC' });
    });

    expect(amendmentService.release).toHaveBeenCalled();
    expect(setCaseData).not.toHaveBeenCalled(); // the release path never touches case status/synopticReports
    expect(showToast).toHaveBeenCalledWith('Addendum released');
  });

  it('sets a real, visible submit error and does NOT proceed when the release call itself fails validation', async () => {
    const { amendmentService } = await import('@/services');
    vi.mocked(amendmentService.release).mockResolvedValueOnce({ ok: false, error: 'Addendum requires a title describing what it contains.' } as any);
    const setShowAmendmentModal = vi.fn();
    const caseData = makeTestCase({ synopticReports: [{ instanceId: 'SR-1', answers: {} }] as any });
    const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, setShowAmendmentModal, amendmentMode: 'addendum' })));
    await act(async () => { await result.current.openAmendmentDraft('addendum'); });

    await act(async () => { await result.current.handleAmendmentSubmit({ explanationOfChange: 'x', reasonId: 'ADD_IHC' }); });

    expect(result.current.amendmentSubmitError).toBe('Addendum requires a title describing what it contains.');
    expect(setShowAmendmentModal).not.toHaveBeenCalledWith(false);
  });

  describe('real audit logging - previously entirely absent from this flow, per direct guidance\u2019s own follow-up on provenance & auditability', () => {
    it('openAmendmentDraft logs amendment_draft_opened with the real reportInstanceId/specimenId', async () => {
      const { amendmentService } = await import('@/services');
      vi.mocked(amendmentService.startDraft).mockResolvedValueOnce({
        ok: true, data: { id: 'amend-1', sequenceNumber: 1, reportInstanceId: 'SR-1', specimenId: 'sp-A' },
      } as any);
      const log = vi.fn();
      const caseData = makeTestCase({ synopticReports: [{ instanceId: 'SR-1', specimenId: 'sp-A', answers: {} }] as any });
      const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, log, amendmentMode: 'addendum' })));

      await act(async () => { await result.current.openAmendmentDraft('addendum'); });

      expect(log).toHaveBeenCalledWith('amendment_draft_opened', expect.objectContaining({
        amendmentId: 'amend-1', type: 'addendum', reportInstanceId: 'SR-1', specimenId: 'sp-A',
      }));
    });

    it('the single-stage addendum release path logs amendment_released with the real, resolved record\u2019s own reportInstanceId/specimenId', async () => {
      const { amendmentService } = await import('@/services');
      vi.mocked(amendmentService.release).mockResolvedValueOnce({
        ok: true, data: { type: 'addendum', reportInstanceId: 'SR-1', specimenId: 'sp-A' },
      } as any);
      const log = vi.fn();
      const caseData = makeTestCase({ synopticReports: [{ instanceId: 'SR-1', specimenId: 'sp-A', answers: {} }] as any });
      const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, log, amendmentMode: 'addendum' })));
      await act(async () => { await result.current.openAmendmentDraft('addendum'); });

      await act(async () => {
        await result.current.handleAmendmentSubmit({ addendumTitle: 'New finding', explanationOfChange: 'Additional info', reasonId: 'ADD_IHC' });
      });

      expect(log).toHaveBeenCalledWith('amendment_released', expect.objectContaining({
        type: 'addendum', reportInstanceId: 'SR-1', specimenId: 'sp-A',
      }));
    });

    it('a real correction release audits the real, verbatim before/after Final Diagnosis text \u2014 resolved through the real, designated-field resolver, never instance.comment', async () => {
      const { amendmentService } = await import('@/services');
      vi.mocked(amendmentService.release).mockResolvedValueOnce({
        ok: true, data: { type: 'correction', originalReportSnapshot: { answers: { specimens: [{ diagnosis: 'Benign fibroadenoma.' }] } } },
      } as any);
      vi.mocked(resolveFinalDiagnosisText).mockReset();
      vi.mocked(resolveFinalDiagnosisText)
        .mockResolvedValueOnce('Benign fibroadenoma.')
        .mockResolvedValueOnce('Invasive ductal carcinoma.');
      const log = vi.fn();
      const caseData = makeTestCase({
        synopticReports: [{ instanceId: 'SR-1', templateId: 'tmpl-1', pendingAmendmentId: 'amend-1', answers: { specimens: [{ diagnosis: 'Invasive ductal carcinoma.' }] } }] as any,
      });
      const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData, log })));

      await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

      expect(log).toHaveBeenCalledWith('amendment_released', expect.objectContaining({
        previouslyReportedAs: 'Benign fibroadenoma.',
        correctedTo: 'Invasive ductal carcinoma.',
      }));
    });

    it('the real, verbatim previouslyReportedAs value is also forwarded to publishReportReleasedEvent for the outbound CORRECTED dispatch', async () => {
      const { amendmentService } = await import('@/services');
      vi.mocked(amendmentService.release).mockResolvedValueOnce({
        ok: true, data: { type: 'correction', originalReportSnapshot: { answers: { specimens: [{ diagnosis: 'Benign fibroadenoma.' }] } } },
      } as any);
      vi.mocked(resolveFinalDiagnosisText).mockReset();
      vi.mocked(resolveFinalDiagnosisText)
        .mockResolvedValueOnce('Benign fibroadenoma.')
        .mockResolvedValueOnce('Invasive ductal carcinoma.');
      const caseData = makeTestCase({
        reportingMode: 'orchestration' as any,
        synopticReports: [{ instanceId: 'SR-1', templateId: 'tmpl-1', pendingAmendmentId: 'amend-1', answers: { specimens: [{ diagnosis: 'Invasive ductal carcinoma.' }] } }] as any,
      });
      const { result } = renderHook(() => useAmendmentWorkflow(baseParams({ caseData })));

      await act(async () => { await result.current.releasePendingAmendmentOrAddendum(); });

      expect(publishReportReleasedEvent).toHaveBeenCalledWith(expect.objectContaining({
        previouslyReportedAs: 'Benign fibroadenoma.',
      }));
    });
  });
});
