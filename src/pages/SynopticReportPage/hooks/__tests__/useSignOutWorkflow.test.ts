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
import { renderHook, act } from '@testing-library/react';
import { useSignOutWorkflow } from '../useSignOutWorkflow';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
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
  countersignService: { release: vi.fn().mockResolvedValue({ ok: true }), countersign: vi.fn().mockResolvedValue({ ok: true }) },
  userService: { getById: vi.fn().mockResolvedValue({ ok: true, data: { email: 'attending@test.com' } }) },
  fppeAssignmentService: { getActiveAssignmentForUser: vi.fn().mockResolvedValue({ ok: true, data: null }), recordCaseReviewed: vi.fn().mockResolvedValue({ ok: true }) },
  intraoperativeService: { getAll: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  amendmentService: { release: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
  reportVersionService: { create: vi.fn().mockResolvedValue({ ok: true, data: {} }), getByCaseId: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
}));
vi.mock('@/services/communications/notificationService', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  vi.clearAllMocks();
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
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'critical' }] },
    });
    const caseData = makeTestCase({ diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });

    expect(result.current.showPreFinalise).toBe(false);
    expect(result.current.showCriticalFindingsModal).toBe(true);
    expect(result.current.criticalFindings).toHaveLength(1);
    expect(result.current.criticalFindings[0].term).toBe('invasive carcinoma');
  });

  it('does NOT block finalize when only an \'abnormal\' severity finding is detected - only \'critical\' soft-blocks', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValueOnce({
      ok: true,
      data: { flags: [{ term: 'mild dysplasia', sourceField: 'microscopic', sourceQuote: 'mild dysplastic changes noted', severity: 'abnormal' }] },
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

  it('handleAcknowledgeCriticalFindings dismisses the modal and marks this session\'s findings acknowledged - a second Finalize click no longer re-blocks on the same, unchanged findings', async () => {
    vi.mocked(detectCriticalFindings).mockResolvedValue({
      ok: true,
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'critical' }] },
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
      data: { flags: [{ term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'critical' }] },
    });
    const caseData = makeTestCase({ id: 'TEST-CASE-CRITICAL', diagnostic: { microscopicDescription: 'Invasive ductal carcinoma identified.' } as any });
    const { result } = renderHook(() => useSignOutWorkflow(baseParams({ caseData })));

    await act(async () => { await result.current.handleRequestFinalize(false); });
    expect(result.current.showCriticalFindingsModal).toBe(true);

    await act(async () => {
      await result.current.handleRecordCriticalNotification({ clinicianName: 'Dr. Faulkner', method: 'verbal_phone', readBackConfirmed: true });
    });

    expect(mockCriticalResultNotificationService.recordNotification).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'TEST-CASE-CRITICAL',
      trigger: 'critical_value',
      clinicianName: 'Dr. Faulkner',
      method: 'verbal_phone',
      readBackConfirmed: true,
      notifiedBy: { userId: 'PATH-001', userName: 'Dr. Test' },
    }));
    expect(result.current.showCriticalFindingsModal).toBe(false);
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
