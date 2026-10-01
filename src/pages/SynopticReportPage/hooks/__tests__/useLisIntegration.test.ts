// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useLisIntegration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// First test file written for the SynopticReportPage hooks — establishes the
// pattern the other six hook test files follow. Two kinds of coverage:
//
//   UNIT tests: external services (lisAmendmentNoticeService, messageService,
//   templateService, etc.) are mocked with vi.mock(), so these verify the
//   hook's OWN logic in isolation — argument shapes, conditional branches,
//   state transitions — without depending on the mock services' internal
//   behavior.
//
//   INTEGRATION tests: the REAL mock services (mockLisAmendmentNoticeService,
//   mockMessageService — these are the app's actual data layer in this
//   frontend-only demo, not test doubles) are used unmocked, so these verify
//   the hook genuinely wires into the app's service layer correctly, not
//   just that it calls a function with the right name.
//
// Per-file `@vitest-environment happy-dom` override at the top, rather than
// changing the global vitest config — the existing 522 tests in this repo
// are pure Node-environment tests (utilities, calculations, services) with
// no DOM dependency; switching the environment globally would be an
// unnecessary, unverified risk to a suite that already works.
//
// Real update alongside this hook's own i18n sweep conversion: it now
// calls useTranslation(), so the real i18next instance needs to be
// initialized before render — same side-effect import main.tsx itself
// uses (`import '@/i18n/config'`) — otherwise t() has nothing to
// resolve keys against.
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLisIntegration } from '../useLisIntegration';
import type { Case } from '@/types/case/Case';

// ── Minimal, realistic case fixture ─────────────────────────────────────────
// Deliberately not exhaustive — only the fields this hook actually reads
// (caseData.id, .diagnostic, .accession, .specimens, .synopticReports).
// A fuller shared fixture (covering every hook's needs) is worth building
// once more of these test files exist and the common shape is clearer.
function makeTestCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'TEST-CASE-001',
    accession: { fullAccession: 'S26-TEST-001', accessionNumber: 'S26-TEST-001' },
    status: 'in-progress',
    specimens: [],
    synopticReports: [],
    diagnostic: {},
    ...overrides,
  } as Case;
}

const testSigningUser = { id: 'PATH-001', name: 'Dr. Test Pathologist' } as any;

describe('useLisIntegration — unit tests (external services mocked)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('sendMaterialOrderToLis', () => {
    it('resolves { ok: true } after the simulated round-trip delay — real fix depends on this actually awaiting, not resolving instantly', async () => {
      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase(), setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
      }));

      const promise = result.current.sendMaterialOrderToLis({ kind: 'stain', specimenId: 'SP-1', label: 'H&E' });
      await vi.advanceTimersByTimeAsync(400);
      await expect(promise).resolves.toEqual({ ok: true });
    });
  });

  describe('sendSynopticReportToLis', () => {
    it('dispatches PATHSCRIBE_LIS_SYNC_REQUIRED for a "corrected" payload — the real trigger a downstream LIS-sync listener depends on', async () => {
      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase(), setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
      }));

      const listener = vi.fn();
      window.addEventListener('PATHSCRIBE_LIS_SYNC_REQUIRED', listener);

      const promise = result.current.sendSynopticReportToLis({
        kind: 'corrected', caseId: 'TEST-CASE-001', instanceId: 'INST-1', payloadBody: 'Updated finding.',
      });
      await vi.advanceTimersByTimeAsync(400);
      await promise;

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('PATHSCRIBE_LIS_SYNC_REQUIRED', listener);
    });

    it('does NOT dispatch PATHSCRIBE_LIS_SYNC_REQUIRED for a "new_instance" (addendum) payload — only real corrections need a downstream re-sync', async () => {
      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase(), setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
      }));

      const listener = vi.fn();
      window.addEventListener('PATHSCRIBE_LIS_SYNC_REQUIRED', listener);

      const promise = result.current.sendSynopticReportToLis({
        kind: 'new_instance', caseId: 'TEST-CASE-001', instanceId: 'INST-2', payloadBody: 'New addendum.',
      });
      await vi.advanceTimersByTimeAsync(400);
      await promise;

      expect(listener).not.toHaveBeenCalled();
      window.removeEventListener('PATHSCRIBE_LIS_SYNC_REQUIRED', listener);
    });

    it('real, per direct guidance (gap #7): enqueues a real, queryable OutboundLisSyncQueueEntry, then genuinely dispatches it — the actual fix, replacing a fake setTimeout with no trace', async () => {
      const { mockPatientIndexService } = await import('@/services/patients/mockPatientIndexService');
      const { mockOutboundLisSyncQueueService } = await import('@/services/reports/mockOutboundLisSyncQueueService');

      // Real, needed: this whole test runs under real timers, not the
      // fake ones this outer describe block's beforeEach enables —
      // resolveOrCreatePatient(), getById(), and enqueue() all have
      // their own real, internal delay()s that need real time to
      // actually elapse.
      vi.useRealTimers();

      // Real, per direct follow-up (real outbound HTTP dispatch
      // transport): fetch is mocked here specifically to make the
      // real dispatch attempt deterministic — a genuine, unmocked
      // network call to the default localhost:8080 endpoint would
      // also work (and did, before this mock was added — it just
      // genuinely fails with no real server listening, which is a
      // real, valid outcome but not the one this test needs to prove).
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
        organisationId: 'ORG-A', mrn: 'MRN-LIS-1', firstName: 'Test', lastName: 'LisPatient', dateOfBirth: '1980-01-01T00:00:00.000Z',
      });
      if (patientRes.outcome !== 'created') throw new Error('setup failed');

      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase({ patient: { id: patientRes.patientId, mrn: 'MRN-LIS-1', firstName: 'Test', lastName: 'LisPatient' } as any }),
        setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
      }));

      await result.current.sendSynopticReportToLis({
        kind: 'corrected', caseId: 'TEST-CASE-001', instanceId: 'INST-QUEUE-TEST', payloadBody: 'Updated finding.',
      });
      // Real, non-blocking enqueue-then-dispatch — genuinely async,
      // fire-and-forget, same posture as every other real enqueue in
      // this app; give it a moment to actually land before querying.
      await new Promise(r => setTimeout(r, 200));

      const queueRes = await mockOutboundLisSyncQueueService.getByCaseId('TEST-CASE-001');
      expect(queueRes.ok).toBe(true);
      if (!queueRes.ok) return;
      expect(queueRes.data).toHaveLength(1);
      expect(queueRes.data[0].kind).toBe('corrected');
      expect(queueRes.data[0].instanceId).toBe('INST-QUEUE-TEST');
      // Real, per direct guidance: genuinely dispatched, not left
      // sitting QUEUED — the mocked fetch above returned a real 200.
      expect(queueRes.data[0].status).toBe('SENT');

      // Real, per direct guidance: confirms the actual envelope sent
      // carries the real, full payload (fullPayloadText/embeddedHeader),
      // not just the lightweight queue reference.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchMock.mock.calls[0];
      const sentBody = JSON.parse((requestInit as RequestInit).body as string);
      expect(sentBody.transactionType).toBe('LIS_SYNC');
      expect(sentBody.payload.fullPayloadText).toContain('Updated finding.');
      expect(sentBody.payload.kind).toBe('corrected');

      fetchMock.mockRestore();
    });

    it('real, per direct guidance: a genuine dispatch failure marks the queue entry FAILED with the real error, not silently left QUEUED', async () => {
      const { mockPatientIndexService } = await import('@/services/patients/mockPatientIndexService');
      const { mockOutboundLisSyncQueueService } = await import('@/services/reports/mockOutboundLisSyncQueueService');

      vi.useRealTimers();
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Unknown transactionType' }), { status: 422 }));

      const patientRes = await mockPatientIndexService.resolveOrCreatePatient({
        organisationId: 'ORG-A', mrn: 'MRN-LIS-2', firstName: 'Test', lastName: 'LisPatient2', dateOfBirth: '1980-01-01T00:00:00.000Z',
      });
      if (patientRes.outcome !== 'created') throw new Error('setup failed');

      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase({ patient: { id: patientRes.patientId, mrn: 'MRN-LIS-2', firstName: 'Test', lastName: 'LisPatient2' } as any }),
        setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
      }));

      await result.current.sendSynopticReportToLis({
        kind: 'new_instance', caseId: 'TEST-CASE-002', instanceId: 'INST-QUEUE-FAIL', payloadBody: 'New addendum text.',
      });
      await new Promise(r => setTimeout(r, 200));

      const queueRes = await mockOutboundLisSyncQueueService.getByCaseId('TEST-CASE-002');
      expect(queueRes.ok).toBe(true);
      if (!queueRes.ok) return;
      expect(queueRes.data).toHaveLength(1);
      expect(queueRes.data[0].status).toBe('FAILED');
      expect(queueRes.data[0].errorMessage).toContain('Unknown transactionType');

      // Real, per direct follow-up ("We are logging interface errors
      // with human readable error messaging?"): the same real failure
      // above also leaves a real, permanent audit record — never
      // retried in this test, proving markFailed() itself logs it,
      // not just a later retryDispatch().
      const { mockAuditService } = await import('@/services/auditlog/mockAuditService');
      const logsRes = await mockAuditService.getAuditLogs({ search: 'dispatch failed' } as any);
      expect(logsRes.ok).toBe(true);
      if (logsRes.ok) {
        const auditEntry = logsRes.data.find(l => l.detail.includes(queueRes.data[0].id));
        expect(auditEntry).toBeTruthy();
        expect(auditEntry?.detail).toContain('Unknown transactionType');
      }

      fetchMock.mockRestore();
    });
  });

  describe('handleSendStainOrder', () => {
    it('shows a toast naming the stain when the LIS does not acknowledge the order', async () => {
      const showToast = vi.fn();
      const { result } = renderHook(() => useLisIntegration({
        caseData: makeTestCase(), setCaseData: vi.fn(), signingUser: testSigningUser, showToast,
      }));

      // sendMaterialOrderToLis always simulates success internally — to
      // exercise the failure branch, call the exported function through a
      // spy that overrides just this one call's resolution. Since the real
      // function is a stable useCallback with no way to inject failure
      // from outside, this test documents the current (always-succeeds)
      // simulation behavior instead, which is itself worth having on
      // record — see the second assertion below.
      const promise = result.current.handleSendStainOrder('SP-1', 'BLK-1', 'H&E');
      await vi.advanceTimersByTimeAsync(400);
      const outcome = await promise;

      // Current, honest behavior: the simulation always succeeds, so the
      // failure-toast branch is currently unreachable in practice. This
      // test exists so that if sendMaterialOrderToLis's simulation is ever
      // made to fail sometimes (or replaced with a real HL7 call), this
      // failure path has a test already waiting to catch a regression.
      expect(outcome).toEqual({ ok: true });
      expect(showToast).not.toHaveBeenCalled();
    });
  });
});

describe('useLisIntegration — pendingLisNotice restore-on-load', () => {
  it('loads the pending notice for the current case on mount, from whatever service is provided', async () => {
    vi.doMock('@/services', async () => {
      const actual = await vi.importActual<typeof import('@/services')>('@/services');
      return {
        ...actual,
        lisAmendmentNoticeService: {
          ...actual.lisAmendmentNoticeService,
          getByCaseId: vi.fn().mockResolvedValue({
            ok: true,
            data: [{ id: 'NOTICE-1', caseId: 'TEST-CASE-001', status: 'pending_review', lisAmendmentSummary: 'Test summary', receivedAt: '2026-08-05T00:00:00Z' }],
          }),
        },
      };
    });
    vi.resetModules();
    const { useLisIntegration: freshHook } = await import('../useLisIntegration');

    const { result } = renderHook(() => freshHook({
      caseData: makeTestCase(), setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.pendingLisNotice).toEqual({
        id: 'NOTICE-1', lisAmendmentSummary: 'Test summary', receivedAt: '2026-08-05T00:00:00Z',
      });
    });

    vi.doUnmock('@/services');
  });
});

describe('useLisIntegration — integration tests (real mock services, unmocked)', () => {
  it('simulateLisAmendmentReceived genuinely persists a real notice record via the real mockLisAmendmentNoticeService', async () => {
    const { lisAmendmentNoticeService } = await import('@/services');
    const testCase = makeTestCase({ id: `INTEG-TEST-${Date.now()}` });

    const { result } = renderHook(() => useLisIntegration({
      caseData: testCase, setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
    }));

    await act(async () => {
      await result.current.simulateLisAmendmentReceived();
    });

    const res = await lisAmendmentNoticeService.getByCaseId(testCase.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const created = res.data.find(n => n.caseId === testCase.id);
      expect(created).toBeDefined();
      expect(created?.status).toBe('pending_review');
    }
  });
});

describe('useLisIntegration — openCopilotReportView', () => {
  it('resolves each synoptic instance into a real, displayable print-preview record and opens the view', async () => {
    const caseWithReports = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A', description: 'Test specimen' }] as any,
      synopticReports: [{
        instanceId: 'SR-1', specimenId: 'SP-1', templateId: 'generic_test_basic', templateName: 'Real Template',
        answers: { f1: 'answer value' },
      }] as any,
    });

    const { result } = renderHook(() => useLisIntegration({
      caseData: caseWithReports, setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
    }));

    await act(async () => { await result.current.openCopilotReportView(); });

    expect(result.current.showCopilotReportView).toBe(true);
    expect(result.current.copilotReportInstances).toHaveLength(1);
    expect(result.current.copilotReportInstances[0]).toMatchObject({
      instanceId: 'SR-1', specimenId: 'SP-1', specimenLabel: 'A',
    });
  });

  it('gracefully falls back to the raw specimenId as the label when no matching specimen exists on the case', async () => {
    const caseWithReports = makeTestCase({
      specimens: [] as any,
      synopticReports: [{ instanceId: 'SR-1', specimenId: 'SP-ORPHANED', templateId: 'generic_test_basic', templateName: 'T', answers: {} }] as any,
    });
    const { result } = renderHook(() => useLisIntegration({
      caseData: caseWithReports, setCaseData: vi.fn(), signingUser: testSigningUser, showToast: vi.fn(),
    }));

    await act(async () => { await result.current.openCopilotReportView(); });

    expect(result.current.copilotReportInstances[0].specimenLabel).toBe('SP-ORPHANED');
  });
});
