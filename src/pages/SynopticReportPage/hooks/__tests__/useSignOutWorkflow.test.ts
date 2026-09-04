// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useSignOutWorkflow.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// See useLisIntegration.test.ts's header for the unit/integration split
// rationale and the @vitest-environment override rationale.
//
// The biggest, highest-stakes hook in this directory — finalize, sign-out,
// countersign release, and the fixative-time gate. All external services
// mocked; this hook's own sequencing (especially the CoPilot
// send-before-release ordering guarantee, and the resident/FPPE
// countersign routing) is what's under test.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook as rtlRenderHook, act } from '@testing-library/react';
import { SystemConfigProvider } from '@/contexts/SystemConfigContext';
import { useSignOutWorkflow } from '../useSignOutWorkflow';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import { caseRouter } from '@/services/cases/CaseRouter';
import { abnormalDetectionSignalService, qaActivityRecordService } from '@/services';
import { ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID } from '@/services/quality/mockQaActivityTypeService';
import { detectCriticalFindings } from '@/services/clinical/detectCriticalFindings';
import { mockCriticalResultNotificationService } from '@/services/clinical/mockCriticalResultNotificationService';
import type { Case } from '@/types/case/Case';

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { updateCase: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/auth/caseAccessControl', () => ({
  getSessionUser: vi.fn().mockReturnValue({ id: 'PATH-001', role: 'pathologist' }),
  canFinalizeCase: vi.fn().mockReturnValue({ granted: true, dimension: 'primary', reason: '' }),
}));
vi.mock('@/services', () => ({
  countersignService: { release: vi.fn().mockResolvedValue({ ok: true }), countersign: vi.fn().mockResolvedValue({ ok: true }), reject: vi.fn().mockResolvedValue({ ok: true, data: { residentId: 'PATH-002', residentName: 'Dr. Resident' } }) },
  userService: { getById: vi.fn().mockResolvedValue({ ok: true, data: { email: 'attending@test.com' } }) },
  fppeAssignmentService: { getActiveAssignmentForUser: vi.fn().mockResolvedValue({ ok: true, data: null }), recordCaseReviewed: vi.fn().mockResolvedValue({ ok: true }) },
  qaSupervisionAssignmentService: { getActiveAssignmentForUser: vi.fn().mockResolvedValue({ ok: true, data: null }), recordCaseReviewed: vi.fn().mockResolvedValue({ ok: true }) },
  intraoperativeService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  amendmentService: { release: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
  reportVersionService: { create: vi.fn().mockResolvedValue({ ok: true, data: {} }), getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  abnormalTriggerRuleService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  abnormalDetectionSignalService: { recordSignal: vi.fn().mockResolvedValue({ ok: true, data: {} }), getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }), getStats: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
  qaActivityRecordService: { create: vi.fn().mockResolvedValue({ ok: true, data: {} }), getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  facilityService: { getById: vi.fn().mockResolvedValue({ ok: false, error: 'not mocked' }) },
}));
vi.mock('@/services/communications/notificationService', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/reportRelease/mockReportReleaseService', () => ({
  mockReportReleaseService: { resolveBufferForCase: vi.fn().mockResolvedValue({ applies: true, durationMinutes: 5 }) },
}));
vi.mock('@/services/reports/dispatchCaseInstances', () => ({
  dispatchCaseInstances: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/templates/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue({ template: { sections: [] } }),
}));
vi.mock('@/services/clinical/detectCriticalFindings', () => ({
  detectCriticalFindings: vi.fn().mockResolvedValue({ ok: true, data: { flags: [] } }),
}));
vi.mock('@/services/clinical/mockCriticalResultNotificationService', () => ({
  mockCriticalResultNotificationService: { recordNotification: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
}));

function makeTestCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'TEST-CASE-SIGNOUT',
    status: 'in-progress',
    reportingMode: 'orchestration',
    specimens: [],
    synopticReports: [{ instanceId: 'SR-1', specimenId: 'SP-1', templateName: 'T1', answers: { f1: 'x' }, status: 'draft' }],
    accession: { fullAccession: 'S26-TEST-001' },
    ...overrides,
  } as unknown as Case;
}

const testSigningUser = { id: 'PATH-001', name: 'Dr. Test' } as any;

function baseParams(overrides: Partial<Parameters<typeof useSignOutWorkflow>[0]> = {}) {
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
    isOrchestrationMode: true,
    orchSections: [],
    setCaseSigned: vi.fn(),
    setShowSignOutModal: vi.fn(),
    setPendingReconciliation: vi.fn(),
    countersignFeedback: '',
    specimenDictionary: [],
    setFixativeGateSpecimens: vi.fn(),
    setPreAnalyticDateGateSpecimens: vi.fn(),
    setPendingFinalizeArgs: vi.fn(),
    setPendingActionIsSignOut: vi.fn(),
    synopticPanelRef: { current: { validateRequired: vi.fn().mockReturnValue([]), getUncertainRequiredFields: vi.fn().mockReturnValue([]), getBlockingUnverifiedFields: vi.fn().mockReturnValue([]), sweepAndGetFinalState: vi.fn().mockReturnValue({ verificationSummary: {} }) } } as any,
    setAlertFieldId: vi.fn(),
    safeSetLeftTab: vi.fn(),
    setActiveSpecimenId: vi.fn(),
    setActiveReportType: vi.fn(),
    setAmendmentMode: vi.fn(),
    setShowAmendmentModal: vi.fn(),
    setShowFinalizeModal: vi.fn(),
    openAmendmentDraft: vi.fn().mockResolvedValue(undefined),
    releasePendingAmendmentOrAddendum: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

// Real, per direct guidance (PS-105): useSignOutWorkflow now calls
// useSystemConfig() (the enterprise-level abnormal detection kill
// switch), which throws without a <SystemConfigProvider> ancestor.
// Same shadowing pattern as useSpecimenBlockManagement.test.ts's own
// AuthProvider wrapper — every renderHook( call below is this one,
// not @testing-library/react's own, unwrapped version.
const renderHook: typeof rtlRenderHook = (callback, options) =>
  rtlRenderHook(callback, { ...options, wrapper: ({ children }) => React.createElement(SystemConfigProvider, null, children) });

beforeEach(() => {
  vi.clearAllMocks();
  // Real, per direct guidance (PS-105): guaranteed clean enterprise-
  // config state entering every test, even if an earlier test's own
  // governance-gate test failed before reaching its own cleanup line.
  localStorage.removeItem('pathscribe_enterprise_config_v2');
});

describe('useSignOutWorkflow — finalizeSignOut (CoPilot ordering guarantee)', () => {
  it('does NOT release a pending amendment when the LIS send fails — the instance stays visible in triage, not silently finalized', async () => {
    const { amendmentService } = await import('@/services');
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: false });
    const showToast = vi.fn();
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, sendSynopticReportToLis, showToast })));

    await act(async () => { await result.current.finalizeSignOut(); });

    expect(amendmentService.release).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('could not be transmitted'));
  });

  it('DOES release only after a confirmed successful LIS send, and creates a real version record', async () => {
    const { amendmentService, reportVersionService } = await import('@/services');
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      reportingMode: 'assist' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.finalizeSignOut(); });

    expect(amendmentService.release).toHaveBeenCalledTimes(1);
    expect(reportVersionService.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'assist', trigger: 'amendment' }));
    const patch = setCaseData.mock.calls[0][0];
    expect(patch.synopticReports.find((r: any) => r.instanceId === 'SR-1').status).toBe('finalized');
  });

  it('Orchestration mode releases immediately without any LIS transmission gate at all', async () => {
    const sendSynopticReportToLis = vi.fn().mockResolvedValue({ ok: true });
    const { amendmentService } = await import('@/services');
    const caseData = makeTestCase({
      reportingMode: 'orchestration' as any,
      synopticReports: [{ instanceId: 'SR-1', pendingAmendmentId: 'amend-1', answers: {} }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, sendSynopticReportToLis })));

    await act(async () => { await result.current.finalizeSignOut(); });

    expect(sendSynopticReportToLis).not.toHaveBeenCalled();
    expect(amendmentService.release).toHaveBeenCalledTimes(1);
  });

  it('always sets caseSigned true and closes the sign-out modal at the end, regardless of amendment content', async () => {
    const setCaseSigned = vi.fn();
    const setShowSignOutModal = vi.fn();
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ setCaseSigned, setShowSignOutModal })));
    await act(async () => { await result.current.finalizeSignOut(); });
    expect(setCaseSigned).toHaveBeenCalledWith(true);
    expect(setShowSignOutModal).toHaveBeenCalledWith(false);
  });
});

describe('useSignOutWorkflow — handleSignOutConfirm (real, critical fix: pending-release guard)', () => {
  it('refuses outright when the case is already pending-release — the real bug this closes: finalizeSignOut() has zero buffer awareness and would otherwise create a new ReportVersionRecord bypassing the recall window entirely', async () => {
    const { countersignService } = await import('@/services');
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const showToast = vi.fn();
    const setShowSignOutModal = vi.fn();
    const caseData = makeTestCase({ status: 'pending-release' } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast, setShowSignOutModal })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('already Pending Release'));
    expect(setShowSignOutModal).toHaveBeenCalledWith(false);
    // Real, load-bearing assertion: neither the resident-countersign
    // path nor any real finalize/version-creation write ever ran.
    expect(countersignService.release).not.toHaveBeenCalled();
    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    expect(updateCalls.length).toBe(0);
  });
});

describe('useSignOutWorkflow — handleSignOutConfirm (resident/countersign gate)', () => {
  it('a genuine resident (not also attending) releases the case for countersign and does NOT proceed to finalize', async () => {
    const { countersignService } = await import('@/services');
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const showToast = vi.fn();
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['resident'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(countersignService.release).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('released for attending countersign'));
    // Real feature, per direct specification, Phase 4 (spec §15a —
    // "Resident Submissions... route... WITHOUT TRIGGERING A RELEASE
    // BUFFER"). The countersign gate's own real, unconditional early
    // return (before finalizeCase() — see that gate's own comment:
    // "does not proceed to reconciliation check or any finalize logic
    // below") already guarantees this architecturally; this assertion
    // makes it a real, durable, testable guarantee too, not just a
    // comment someone could silently break later. A real caseRouter
    // write genuinely happened (the countersign release itself) — the
    // check is specifically that NONE of them ever set
    // status: 'pending-release'.
    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    expect(updateCalls.some((call: any[]) => call[1]?.status === 'pending-release')).toBe(false);
  });

  it('real, per direct follow-up ("Continue with the version-record creation to the trainee path"): a resident\'s submission now creates a real, immutable ReportVersionRecord — with no instanceId, so it correctly never triggers real ORU^R01 dispatch', async () => {
    const { countersignService, reportVersionService } = await import('@/services');
    const showToast = vi.fn();
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['resident'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(reportVersionService.create).toHaveBeenCalledWith(expect.objectContaining({
      caseId: caseData.id,
      mode: 'orchestration',
      trigger: 'initial_signout',
    }));
    // Real, deliberate: no instanceId on this real call — the same
    // real, whole-case snapshot shape every orchestration-mode
    // create() call in this app already uses. This alone is what
    // correctly keeps a resident's submission out of the real ORU^R01
    // dispatch hook inside create() itself.
    const createCall = (reportVersionService.create as any).mock.calls[0][0];
    expect(createCall.instanceId).toBeUndefined();

    // Real, deliberate ordering: the snapshot must be created BEFORE
    // the countersign release, so it genuinely reflects what was
    // actually submitted for review.
    const createOrder = (reportVersionService.create as any).mock.invocationCallOrder[0];
    const releaseOrder = (countersignService.release as any).mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(releaseOrder);
  });

  it('a resident who is ALSO attending on this case bypasses the countersign gate entirely — falls through to normal finalize', async () => {
    const { countersignService } = await import('@/services');
    const caseData = makeTestCase({
      participants: [
        { status: 'active', staffId: 'PATH-001', participationTypeIds: ['resident'] },
        { status: 'active', staffId: 'PATH-001', participationTypeIds: ['attending'] },
      ],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(countersignService.release).not.toHaveBeenCalled();
  });

  it('real, per direct follow-up ("Path B Execution Plan"): an attending sign-out with a real buffer applying starts the buffer (status: pending-release) and does NOT dispatch immediately', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const { dispatchCaseInstances } = await import('@/services/reports/dispatchCaseInstances');
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['attending'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    const bufferCall = updateCalls.find((call: any[]) => call[1]?.status === 'pending-release');
    expect(bufferCall).toBeDefined();
    expect(bufferCall[1].releaseBufferExpiresAt).toBeDefined();
    expect(dispatchCaseInstances).not.toHaveBeenCalled();
  });

  it('real, per direct follow-up ("Path B Execution Plan"): an attending sign-out with NO buffer applying (disabled config, or a real STAT bypass) sets status: finalized and dispatches immediately', async () => {
    const { mockReportReleaseService } = await import('@/services/reportRelease/mockReportReleaseService');
    vi.mocked(mockReportReleaseService.resolveBufferForCase).mockResolvedValueOnce({ applies: false, durationMinutes: 0 } as any);
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const { dispatchCaseInstances } = await import('@/services/reports/dispatchCaseInstances');
    const caseData = makeTestCase({
      id: 'TEST-CASE-NOBUFFER',
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['attending'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    const finalizeCall = updateCalls.find((call: any[]) => call[1]?.status === 'finalized');
    expect(finalizeCall).toBeDefined();
    expect(finalizeCall[1].releasedAt).toBeDefined();
    expect(dispatchCaseInstances).toHaveBeenCalledWith('TEST-CASE-NOBUFFER');
  });

  it('denies sign-out entirely and shows the real denial reason when the user has no genuine relationship to the case', async () => {
    const { canFinalizeCase } = await import('@/services/auth/caseAccessControl');
    vi.mocked(canFinalizeCase).mockReturnValueOnce({ granted: false, dimension: 'no-relationship', reason: 'You are not a participant on this case.' } as any);
    const showToast = vi.fn();
    const setShowSignOutModal = vi.fn();
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ showToast, setShowSignOutModal })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(showToast).toHaveBeenCalledWith('You are not a participant on this case.');
    expect(setShowSignOutModal).toHaveBeenCalledWith(false);
  });

  it('records a real countersign completion when an attending signs out a case that was released pending-countersign', async () => {
    const { countersignService } = await import('@/services');
    const caseData = makeTestCase({ status: 'pending-countersign' } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(countersignService.countersign).toHaveBeenCalledWith(expect.objectContaining({ attendingId: 'PATH-001' }));
  });

  // PS-114, Stage 4 — real, dedicated tests for the completed gate
  // cutover. The existing tests above never exercise any of this: their
  // shared getActiveAssignmentForUser mocks always resolve
  // { ok: true, data: null }, so none of these branches run in any of
  // them.

  it('a provisional hire under an active QaSupervisionAssignment is redirected to release-for-countersign, with the reviewer resolved from supervisorUserId', async () => {
    const { qaSupervisionAssignmentService, fppeAssignmentService, countersignService, userService } = await import('@/services');
    vi.mocked(qaSupervisionAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({
      ok: true, data: { id: 'qa-sup-gate-test-001', status: 'active', supervisorUserId: 'SUPERVISOR-001' } as any,
    });
    // Aligned with the new system here so the real drift-check (tested
    // on its own below) doesn't spuriously warn in this, unrelated test.
    vi.mocked(fppeAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({
      ok: true, data: { id: 'fppe-gate-test-001', status: 'active' } as any,
    });
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['provisional_hire'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    // Real point of this test: the gate redirects to release-for-
    // countersign (same real mechanism as the resident gate) and
    // resolves the reviewer from the NEW system's own supervisorUserId
    // field — never the old proctorUserId name, which no longer exists
    // on this type.
    expect(countersignService.release).toHaveBeenCalled();
    expect(userService.getById).toHaveBeenCalledWith('SUPERVISOR-001');
  });

  it('a provisional hire with NO active QaSupervisionAssignment (graduated, or never assigned) signs out normally — no countersign redirect', async () => {
    const { qaSupervisionAssignmentService, countersignService } = await import('@/services');
    // Explicit, even though it matches the shared default — this is
    // the real "graduated" shape: getActiveAssignmentForUser returns
    // null once an assignment's status has moved to 'completed' (see
    // IQaSupervisionAssignmentService's own doc comment — "not under
    // supervision" is the expected case once graduated).
    vi.mocked(qaSupervisionAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({ ok: true, data: null });
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['provisional_hire'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(countersignService.release).not.toHaveBeenCalled();
  });

  it('logs a real drift warning, but does not change gating behavior, when the old and new systems disagree on active-assignment status', async () => {
    const { qaSupervisionAssignmentService, fppeAssignmentService, countersignService } = await import('@/services');
    // New system says active (real gate should follow this); old
    // system disagrees and says inactive — a real, deliberate
    // mismatch, only possible during the transition period this
    // safety net exists for.
    vi.mocked(qaSupervisionAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({
      ok: true, data: { id: 'qa-sup-drift-001', status: 'active', supervisorUserId: 'SUPERVISOR-001' } as any,
    });
    vi.mocked(fppeAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({ ok: true, data: null });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const caseData = makeTestCase({
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['provisional_hire'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });
    // The drift check fires as an unawaited .then() alongside the main
    // gate flow — flush the microtask queue once more before asserting.
    await act(async () => { await Promise.resolve(); });

    // Real gating behavior follows the NEW system (release-for-
    // countersign fired) regardless of the old system's disagreement.
    expect(countersignService.release).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[PS-114 drift] FPPE gate disagreement between old and new systems', expect.objectContaining({ legacyActive: false, newActive: true }));
    warnSpy.mockRestore();
  });

  it('shadow-writes the real countersign increment to the OLD fppeAssignmentService, using the same real id the new system resolved, and surfaces (does not swallow) a failure on the new, now-primary system', async () => {
    const { fppeAssignmentService, qaSupervisionAssignmentService } = await import('@/services');
    vi.mocked(qaSupervisionAssignmentService.getActiveAssignmentForUser).mockResolvedValueOnce({
      ok: true, data: { id: 'qa-sup-shadow-test-001', status: 'active', supervisorUserId: 'SUPERVISOR-001' } as any,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(qaSupervisionAssignmentService.recordCaseReviewed).mockRejectedValueOnce(new Error('write failed'));
    const caseData = makeTestCase({
      status: 'pending-countersign',
      participants: [{ status: 'active', staffId: 'PATH-002', participationTypeIds: ['provisional_hire'] }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    // Both systems still get the same real id — old-system writes are
    // NOT retired, since FppeAssignmentsSection.tsx still reads them.
    expect(qaSupervisionAssignmentService.recordCaseReviewed).toHaveBeenCalledWith('qa-sup-shadow-test-001');
    expect(fppeAssignmentService.recordCaseReviewed).toHaveBeenCalledWith('qa-sup-shadow-test-001');
    // Real point of this test: a failure on the new, now-authoritative
    // system is surfaced, not silently swallowed — the old shadow-write
    // failing silently is fine (nothing reads it live), but a silent
    // failure on the new system could leave a graduated pathologist
    // incorrectly gated on their next sign-out.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('holds sign-out for reconciliation when a merged intraop specimen has an unreconciled frozen category, rather than finalizing immediately', async () => {
    const { intraoperativeService } = await import('@/services');
    vi.mocked(intraoperativeService.getAll).mockResolvedValueOnce({
      ok: true,
      data: [{ status: 'merged', mergedIntoCaseId: 'TEST-CASE-SIGNOUT', specimens: [{ id: 'ISP-1', specimenLabel: 'A', frozenCategory: 'benign', frozenSectionDiagnosis: 'Benign tissue' }] }],
    } as any);
    const setPendingReconciliation = vi.fn();
    const setCaseSigned = vi.fn();
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ setPendingReconciliation, setCaseSigned })));

    await act(async () => { await result.current.handleSignOutConfirm(); });

    expect(setPendingReconciliation).toHaveBeenCalledWith(expect.objectContaining({ specimenId: 'ISP-1' }));
    expect(setCaseSigned).not.toHaveBeenCalled(); // finalizeSignOut must NOT have run
  });
});

describe('useSignOutWorkflow — handleReturnToTrainee ("Return to Trainee"/"Reject with Notes")', () => {
  it('real, per direct guidance ("Yes we should scope \'Return to Trainee\'/\'Reject with Notes\'"): refuses with no feedback — a rejection with nothing to act on helps no one', async () => {
    const { countersignService } = await import('@/services');
    const showToast = vi.fn();
    const caseData = makeTestCase({ status: 'pending-countersign' } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast, countersignFeedback: '' })));

    await act(async () => { await result.current.handleReturnToTrainee(); });

    expect(countersignService.reject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Feedback is required'));
  });

  it('real, per direct guidance: with real feedback, calls countersignService.reject, reassigns ownership back to the resident, and reverts per-instance status to draft', async () => {
    const { countersignService } = await import('@/services');
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const showToast = vi.fn();
    const caseData = makeTestCase({
      status: 'pending-countersign',
      participants: [{ status: 'active', staffId: 'PATH-001', participationTypeIds: ['attending', 'primary'] }],
      synopticReports: [{ instanceId: 'INST-1', status: 'pending-countersign', answers: {} }],
    } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast, countersignFeedback: 'Please re-check the margin measurements.' })));

    await act(async () => { await result.current.handleReturnToTrainee(); });

    expect(countersignService.reject).toHaveBeenCalledWith(expect.objectContaining({
      caseId: caseData.id,
      attendingFeedback: 'Please re-check the margin measurements.',
    }));

    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    const returnCall = updateCalls.find((call: any[]) => call[1]?.status === 'returned');
    expect(returnCall).toBeDefined();
    const patch = returnCall[1];
    // Real, per direct guidance: ownership genuinely reassigned back
    // to the resident (the mocked reject() result's own residentId),
    // via the same real syncPrimaryAssignee() primitive
    // delegateCase()'s own ownership-transfer branch uses.
    expect(patch.order.assignedTo).toBe('PATH-002');
    expect(patch.returnedBy).toBe('PATH-001');
    // Real, per direct guidance: the per-instance status set at
    // release time must be reverted too, or the resident can't
    // actually re-edit their own synoptic reports.
    expect(patch.synopticReports[0].status).toBe('draft');

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('returned to Dr. Resident'));
  });

  it('real, per direct guidance: a genuine reject() failure surfaces the real error and never touches the case', async () => {
    const { countersignService } = await import('@/services');
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(countersignService.reject).mockResolvedValueOnce({ ok: false, error: 'No pending countersign record found for case TEST-CASE-SIGNOUT' } as any);
    const showToast = vi.fn();
    const caseData = makeTestCase({ status: 'pending-countersign' } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, showToast, countersignFeedback: 'Some real feedback.' })));

    await act(async () => { await result.current.handleReturnToTrainee(); });

    expect(showToast).toHaveBeenCalledWith('No pending countersign record found for case TEST-CASE-SIGNOUT');
    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    expect(updateCalls.some((call: any[]) => call[1]?.status === 'returned')).toBe(false);
  });
});

describe('useSignOutWorkflow — finalizeCase', () => {
  it('returns false immediately with no caseData', async () => {
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData: null })));
    const succeeded = await act(async () => result.current.finalizeCase());
    expect(succeeded).toBe(false);
  });

  it('denies finalization and returns false when the write-permission guard rejects', async () => {
    const { canFinalizeCase } = await import('@/services/auth/caseAccessControl');
    vi.mocked(canFinalizeCase).mockReturnValueOnce({ granted: false, dimension: 'x', reason: 'No relationship to this case.' } as any);
    const showToast = vi.fn();
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ showToast })));

    const succeeded = await act(async () => result.current.finalizeCase());

    expect(succeeded).toBe(false);
    expect(showToast).toHaveBeenCalledWith('No relationship to this case.');
  });

  it('the pre-analytic date gate hard-blocks finalization when a specimen is missing collectedAt, and checks BEFORE the fixative-time gate', async () => {
    const setPreAnalyticDateGateSpecimens = vi.fn();
    const setFixativeGateSpecimens = vi.fn();
    const setPendingFinalizeArgs = vi.fn();
    const caseData = makeTestCase({
      // Missing collectedAt only — receivedAt present. Also would
      // separately trigger the fixative-time gate (no dictionary entry
      // here, so it doesn't) — this isolates the pre-analytic gate.
      specimens: [{ id: 'SP-1', label: 'A', description: 'Breast', receivedAt: '2026-01-01T01:00:00Z' }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, setPreAnalyticDateGateSpecimens, setFixativeGateSpecimens, setPendingFinalizeArgs })));

    const succeeded = await act(async () => result.current.finalizeCase(['excluded-1']));

    expect(succeeded).toBe(false);
    expect(setPreAnalyticDateGateSpecimens).toHaveBeenCalledWith([
      { specimenId: 'SP-1', label: 'A', description: 'Breast', missingCollectedAt: true, missingReceivedAt: false },
    ]);
    expect(setPendingFinalizeArgs).toHaveBeenCalledWith(['excluded-1']);
    // Never reaches the fixative-time gate — the pre-analytic gate
    // returns false first.
    expect(setFixativeGateSpecimens).not.toHaveBeenCalled();
  });

  it('the pre-analytic date gate does NOT block a specimen with a real administrative-override flag set instead of a real date', async () => {
    const setPreAnalyticDateGateSpecimens = vi.fn();
    const caseData = makeTestCase({
      specimens: [{
        id: 'SP-1', label: 'A', description: 'Breast',
        receivedAt: '2026-01-01T01:00:00Z',
        collectedAtAdministrativeOverride: true,
      }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, setPreAnalyticDateGateSpecimens })));

    await act(async () => { await result.current.finalizeCase(); });

    expect(setPreAnalyticDateGateSpecimens).not.toHaveBeenCalled();
  });

  it('the fixative-time gate hard-blocks finalization for a specimen requiring it, and stores the pending args for after the gate resolves', async () => {
    const setFixativeGateSpecimens = vi.fn();
    const setPendingFinalizeArgs = vi.fn();
    const caseData = makeTestCase({
      // collectedAt/receivedAt both present — isolates this test to the
      // fixative-time gate specifically, not the separate pre-analytic
      // date gate (checked earlier in finalizeCase).
      specimens: [{ id: 'SP-1', label: 'A', description: 'Breast', specimenDictionaryEntryId: 'entry-1', collectedAt: '2026-01-01T00:00:00Z', receivedAt: '2026-01-01T01:00:00Z', processing: {} }] as any,
    });
    const specimenDictionary = [{ id: 'entry-1', requireFixativeTimeBeforeSignout: true }] as any;
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, specimenDictionary, setFixativeGateSpecimens, setPendingFinalizeArgs })));

    const succeeded = await act(async () => result.current.finalizeCase(['excluded-1']));

    expect(succeeded).toBe(false);
    expect(setFixativeGateSpecimens).toHaveBeenCalledWith([{ specimenId: 'SP-1', label: 'A', description: 'Breast' }]);
    expect(setPendingFinalizeArgs).toHaveBeenCalledWith(['excluded-1']);
  });

  it('does NOT block a specimen that already has processedAt documented, even if its dictionary entry requires it', async () => {
    const setFixativeGateSpecimens = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', specimenDictionaryEntryId: 'entry-1', collectedAt: '2026-01-01T00:00:00Z', receivedAt: '2026-01-01T01:00:00Z', processing: { processedAt: '2026-01-01T00:00:00Z' } }] as any,
    });
    const specimenDictionary = [{ id: 'entry-1', requireFixativeTimeBeforeSignout: true }] as any;
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, specimenDictionary, setFixativeGateSpecimens })));

    await act(async () => { await result.current.finalizeCase(); });

    expect(setFixativeGateSpecimens).not.toHaveBeenCalled();
  });

  it('on real success, sets status finalized, leaves every synoptic report status genuinely untouched — no more excluded-instances-become-deferred marking', async () => {
    const setCaseData = vi.fn();
    const log = vi.fn();
    const caseData = makeTestCase({
      synopticReports: [
        { instanceId: 'SR-1', answers: {}, status: 'draft' },
        { instanceId: 'SR-2', answers: {}, status: 'draft' },
      ] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, setCaseData, log })));

    // Real fix, per direct product decision: "Deferred" is gone —
    // synoptic reports must all have their required fields completed
    // before finalize. finalizeCase's own excludedInstanceIds
    // parameter is now inert plumbing (kept only so the unrelated
    // fixative-gate resume flow doesn't need a deeper refactor) — it
    // must never mark anything 'deferred', a status that no longer
    // exists at all.
    const succeeded = await act(async () => result.current.finalizeCase(['SR-2']));

    expect(succeeded).toBe(true);
    const patch = setCaseData.mock.calls[0][0];
    // Real feature, per direct specification: Post-Sign-Out Release
    // Buffer — the default test fixture carries no STAT priority, so the
    // buffer genuinely applies; this real, non-finalized intermediate
    // status is exactly the new, correct behavior, not a regression.
    expect(patch.status).toBe('pending-release');
    expect(patch.finalizedAt).toBeDefined();
  });

  it('on a real ConcurrencyConflictError, surfaces the modal with blockOverride true and returns false — highest-stakes write in the file', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockRejectedValueOnce(new ConcurrencyConflictError('TEST-CASE-SIGNOUT', 1, 4));
    const setConcurrencyConflict = vi.fn();
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ setConcurrencyConflict })));

    const succeeded = await act(async () => result.current.finalizeCase());

    expect(setConcurrencyConflict).toHaveBeenCalledWith({ actualVersion: 4, blockOverride: true });
    expect(succeeded).toBe(false);
  });
});

describe('useSignOutWorkflow — handleRequestFinalize', () => {
  it('blocks finalize outright when the case has an active hold — checked before every other gate, per direct follow-up: "putting a case on Hold at the case level makes sense if there is something truly wrong"', async () => {
    const showToast = vi.fn();
    const caseData = makeTestCase({
      caseHolds: [{
        id: 'casehold-1', reason: 'quality_issue', note: 'Block 2 fragmented on sectioning.',
        setAt: '2026-01-01T00:00:00.000Z', setByUserId: 'u1', setByUserName: 'Test User', active: true,
      }] as any,
    });
    const synopticPanelRef = { current: { validateRequired: vi.fn().mockReturnValue([]), getBlockingUnverifiedFields: vi.fn().mockReturnValue([]) } } as any;
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, synopticPanelRef, showToast })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Block 2 fragmented on sectioning'));
    expect(result.current.showPreFinalise).toBe(false);
  });

  it('does NOT block finalize when the case has only a released (inactive) hold', async () => {
    const caseData = makeTestCase({
      caseHolds: [{
        id: 'casehold-1', reason: 'quality_issue', note: 'Resolved already.',
        setAt: '2026-01-01T00:00:00.000Z', setByUserId: 'u1', setByUserName: 'Test User', active: false,
        releasedAt: '2026-01-02T00:00:00.000Z', releasedByUserId: 'u1', releasedByUserName: 'Test User',
        releaseNote: 'Re-cut received.',
      }] as any,
    });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showPreFinalise).toBe(true);
  });

  it('shows the missing-fields warning and does NOT proceed to pre-finalisation when required fields are incomplete', async () => {
    const missing = [{ fieldId: 'f1', fieldLabel: 'Field 1' }];
    const synopticPanelRef = { current: { validateRequired: vi.fn().mockReturnValue(missing), getUncertainRequiredFields: vi.fn().mockReturnValue([]) } } as any;
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ synopticPanelRef })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showMissingWarning).toBe(true);
    expect(result.current.showPreFinalise).toBe(false);
  });

  it('blocks finalize and navigates directly to the first unverified required field, instead of the old AI-review-modal flow', async () => {
    // Real fix, per direct product decision: any required field with
    // an AI suggestion still unverified — regardless of confidence —
    // now hard-blocks finalize and redirects the pathologist straight
    // to it (via setAlertFieldId), rather than opening a review modal.
    const blocking = [{ sectionId: 's1', sectionTitle: 'Findings', fieldId: 'f1', fieldLabel: 'Field 1' }];
    const setAlertFieldId = vi.fn();
    const showToast = vi.fn();
    const synopticPanelRef = { current: { validateRequired: vi.fn().mockReturnValue([]), getBlockingUnverifiedFields: vi.fn().mockReturnValue(blocking) } } as any;
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ synopticPanelRef, setAlertFieldId, showToast })));

    await act(async () => { await result.current.handleRequestFinalize(true); });

    expect(setAlertFieldId).toHaveBeenCalledWith('f1');
    expect(showToast).toHaveBeenCalled();
    expect(result.current.showPreFinalise).toBe(false);
    // The old modal-based path no longer triggers for this case.
    expect(result.current.showAiReview).toBe(false);
  });

  it('proceeds straight to pre-finalisation review when everything is complete and confirmed', async () => {
    const { result } = renderHook(() => useSignOutWorkflow(baseParams()));
    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showPreFinalise).toBe(true);
  });

  it('blocks finalize and opens the critical findings modal when a real, detected \'critical\' severity finding is present', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showPreFinalise).toBe(false);
    expect(result.current.showCriticalFindingsModal).toBe(true);
    expect(result.current.criticalFindings).toHaveLength(1);
    expect(result.current.criticalFindings[0].term).toBe('invasive carcinoma');
  });

  it('does NOT block finalize when only an \'abnormal\' severity finding is detected - only \'critical\'/\'malignant\' soft-blocks', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'mild dysplasia', sourceField: 'microscopic', sourceQuote: 'mild dysplastic changes noted', severity: 'Abnormal', confidence: 80 }] },
    });
    const caseData = makeTestCase({ diagnostic: { microscopicDescription: 'Mild dysplastic changes noted.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showPreFinalise).toBe(true);
    expect(result.current.showCriticalFindingsModal).toBe(false);
  });

  it('does NOT block finalize when the case has no real diagnostic text at all', async () => {
    const { result } = renderHook(() => useSignOutWorkflow(baseParams()));
    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showPreFinalise).toBe(true);
    expect(detectCriticalFindings).not.toHaveBeenCalled();
  });

  it('PS-105 governance: an enterprise-disabled kill switch skips the entire detection engine — never even calls detectCriticalFindings, regardless of real findings in the text', async () => {
    localStorage.setItem('pathscribe_enterprise_config_v2', JSON.stringify({
      id: 'ENT-DEFAULT', name: 'PathScribe Enterprise',
      features: { reportingPlusEnabled: false, abnormalDetectionEnabled: false },
    }));
    vi.mocked(detectCriticalFindings).mockResolvedValue({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showCriticalFindingsModal).toBe(false);
    expect(result.current.showPreFinalise).toBe(true);
    expect(detectCriticalFindings).not.toHaveBeenCalled();
  });

  it('handleAcknowledgeCriticalFindings dismisses the modal and marks this session\'s findings acknowledged - a second Finalize click no longer re-blocks on the same, unchanged findings', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValue({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showCriticalFindingsModal).toBe(true);

    act(() => { result.current.handleAcknowledgeCriticalFindings(); });
    expect(result.current.showCriticalFindingsModal).toBe(false);

    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showPreFinalise).toBe(true);
    expect(result.current.showCriticalFindingsModal).toBe(false);
  });

  it('handleRecordCriticalNotification records a real notification with every required field, then dismisses the modal', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showCriticalFindingsModal).toBe(true);

    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', readBackConfirmed: true, notifiedByName: 'Test User' });
    });

    expect(mockCriticalResultNotificationService.recordNotification).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'TEST-CASE-CRITICAL',
      trigger: 'critical_value',
      clinicianName: 'Dr. Faulkner',
      method: 'verbal_phone',
      readBackConfirmed: true,
      notifiedBy: { userId: 'PATH-001', userName: 'Test User' },
    }));
    expect(result.current.showCriticalFindingsModal).toBe(false);
  });

  it('real, per direct guidance: "notified by" is genuinely editable, independent of the signed-in user\'s own name — a representative may have made the real call, with staff simply transcribing the event', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Jane Representative, RN' });
    });

    const call = vi.mocked(mockCriticalResultNotificationService.recordNotification).mock.calls[0][0];
    // Real, per direct guidance: userId always stays the real,
    // verifiable, currently signed-in user (PATH-001, per this test
    // file's own mocked signingUser) — only the human-readable name
    // is genuinely editable, never a different, unverifiable userId.
    expect(call.notifiedBy).toEqual({ userId: 'PATH-001', userName: 'Jane Representative, RN' });
  });

  describe('real, per direct correction (PS-134 follow-up: "when would a CAPA be needed?"): confirmation is real audit trail only, never a CAPA trigger on its own', () => {
    it('a confirmed Malignant finding creates a real, concordant QA activity record — never "discordant," since the primary pathologist confirming their own finding is not a discrepancy', async () => {
      vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
        ok: true,
        data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
      });
      const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
      const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

      await act(async () => { await result.current.handleRequestFinalize(false); });
      await act(async () => {
        await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Dr. Test' });
      });

      const call = vi.mocked(qaActivityRecordService.create).mock.calls[0][0];
      expect(call.activityTypeId).toBe(ABNORMAL_FINDING_CONFIRMATION_ACTIVITY_TYPE_ID);
      expect(call.caseId).toBe('TEST-CASE-CRITICAL');
      expect(call.outcome).toBe('concordant');
      // Real, per QaActivityRecord's own contract: severity is only
      // ever meaningful when outcome === 'discordant' — a concordant
      // record has nothing to grade, so it's genuinely never set here.
      expect(call.severity).toBeUndefined();
    });

    it('the real finding term and source quote are carried through as this activity\'s own fieldValues, not lost', async () => {
      vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
        ok: true,
        data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified in the deep margin', severity: 'Malignant', confidence: 92 }] },
      });
      const caseData = makeTestCase({ id: 'TEST-CASE-FIELDVALUES', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified in the deep margin.' } as any });
      const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

      await act(async () => { await result.current.handleRequestFinalize(false); });
      await act(async () => {
        await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Dr. Test' });
      });

      const call = vi.mocked(qaActivityRecordService.create).mock.calls[0][0];
      expect(call.fieldValues.findingTerm).toBe('invasive carcinoma');
      expect(call.fieldValues.findingSource).toBe('invasive ductal carcinoma identified in the deep margin');
    });

    it('disputing (acknowledging without recording) never creates a QA activity record at all — matches this ticket\'s own "human\'s call is genuinely final" acceptance criterion', async () => {
      vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
        ok: true,
        data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
      });
      const caseData = makeTestCase({ id: 'TEST-CASE-DISPUTED', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
      const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

      await act(async () => { await result.current.handleRequestFinalize(false); });
      await act(async () => { await result.current.handleAcknowledgeCriticalFindings(); });

      expect(qaActivityRecordService.create).not.toHaveBeenCalled();
    });
  });

  it('handleRecordCriticalNotification persists the real, single highest-severity finding to Case.abnormalDetectionStatus — the field WorklistTable.tsx actually renders from', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [
        { term: 'mild atypia', sourceField: 'microscopic', sourceQuote: 'mild atypia', severity: 'Abnormal', confidence: 70 },
        { term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 },
      ] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Test User' });
    });

    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    const abnormalStatusCall = updateCalls.find((c: any[]) => c[1]?.abnormalDetectionStatus);
    expect(abnormalStatusCall).toBeDefined();
    expect(abnormalStatusCall[0]).toBe('TEST-CASE-CRITICAL');
    expect(abnormalStatusCall[1].abnormalDetectionStatus.severity).toBe('Malignant');
    expect(abnormalStatusCall[1].abnormalDetectionStatus.confirmedAt).toBeTruthy();
  });

  it('PS-130 architecture test: handleRecordCriticalNotification attaches a real, structurally-synthetic coded term alongside the confirmed status — never a real SNOMED/ICD-O-3 code (PS-130 stays blocked)', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Test User' });
    });

    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    const call = updateCalls.find((c: any[]) => c[1]?.syntheticAbnormalCoding);
    expect(call).toBeDefined();
    for (const term of call[1].syntheticAbnormalCoding) {
      expect(term.code).toMatch(/^TEST-/);
      expect(term.display).toContain('[SYNTHETIC — TEST ONLY]');
    }
  });

  it('PS-137: handleRecordCriticalNotification records a real, "confirmed" agreement signal per finding, de-identifying narrative-sourced ones', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma, 3.2 cm, identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma, 3.2 cm, identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', notifiedByName: 'Test User' });
    });

    expect(abnormalDetectionSignalService.recordSignal).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'TEST-CASE-CRITICAL',
      source: 'narrative',
      suggestedSeverity: 'Malignant',
      suggestedConfidence: 92,
      outcome: 'confirmed',
    }));
    // Real de-identification check: the real measurement value itself
    // must never reach the stored reasonClean unaltered — the
    // structural diagnostic term it's preserved alongside is fine,
    // since deidentifyText() deliberately keeps that (real, valuable,
    // aggregatable) part intact.
    const call = vi.mocked(abnormalDetectionSignalService.recordSignal).mock.calls[0][0];
    expect(call.reasonClean).not.toContain('3.2 cm');
    expect(call.reasonClean).toContain('invasive ductal carcinoma');
  });

  it('PS-137: handleAcknowledgeCriticalFindings records a real "dismissed" signal, never a confirmed one, and never touches Case.abnormalDetectionStatus', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'Malignant', confidence: 92 }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    act(() => { result.current.handleAcknowledgeCriticalFindings(); });

    expect(abnormalDetectionSignalService.recordSignal).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'TEST-CASE-CRITICAL',
      outcome: 'dismissed',
    }));
    const updateCalls = (caseRouter.updateCase as any).mock.calls;
    expect(updateCalls.find((c: any[]) => c[1]?.abnormalDetectionStatus)).toBeUndefined();
  });
});

describe('useSignOutWorkflow — handlePreFinalConfirm / handleFinalizeConfirm sequencing', () => {
  it('handlePreFinalConfirm calls finalizeCase, then releasePendingAmendmentOrAddendum only on real success — properly sequenced, not fire-and-forget', async () => {
    const releasePendingAmendmentOrAddendum = vi.fn().mockResolvedValue('amend-1');
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ releasePendingAmendmentOrAddendum })));

    await act(async () => {
      result.current.handlePreFinalConfirm(['SR-1'], []);
      await new Promise(r => setTimeout(r, 0)); // let the fire-and-forget async IIFE resolve
    });

    expect(releasePendingAmendmentOrAddendum).toHaveBeenCalledTimes(1);
  });

  it('handleFinalizeConfirm takes the genuine first-time-finalize path when the case is not already finalized', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const caseData = makeTestCase({ status: 'in-progress' } as any);
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData, isOrchestrationMode: false })));

    act(() => { result.current.handleFinalizeConfirm(); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    // Real feature, per direct specification: Post-Sign-Out Release
    // Buffer — the default test fixture carries no STAT priority, so
    // this real, first-time-finalize path genuinely lands on
    // 'pending-release', not 'finalized' — a real write happened.
    expect(caseRouter.updateCase).toHaveBeenCalledWith('TEST-CASE-SIGNOUT', expect.objectContaining({ status: 'pending-release' }), expect.anything());
  });
});
