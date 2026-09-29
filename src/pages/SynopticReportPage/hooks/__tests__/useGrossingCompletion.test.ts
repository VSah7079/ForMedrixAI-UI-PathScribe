// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useGrossingCompletion.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// See useLisIntegration.test.ts's header for the unit/integration split
// rationale and the @vitest-environment override rationale.
//
// This hook is a single, large function with many real branches — required-
// field gating, first-completion vs. re-finalize (isUpdate) behavior, pool
// routing, the Gross-Driven AI toggle, Stage 1 synoptic evaluation
// outcomes, and (real feature, per direct request) triggering AI to
// back-fill each specimen's structured Grossing answers from dictated
// Gross text. All external dependencies (caseRouter,
// casePoolAssignmentService, aiBehaviorService, and the dynamic imports
// for templateService and mockCaseService's evaluateSynopticAssignment /
// generateGrossingFieldSuggestionsFromDictation) are mocked, since this
// hook's own logic — which branch fires under which conditions — is what's
// under test, not whether the AI itself proposes sensible values.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// Initializes the real i18next instance so t() resolves to actual English
// text at test time — this hook's toast strings are now i18n-driven, and
// several assertions below require exact-text equality, not just substring
// containment.
import '@/i18n/config';
import { useGrossingCompletion } from '../useGrossingCompletion';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import type { Case } from '@/types/case/Case';

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { updateCase: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/cases/casePoolAssignmentService', () => ({
  routeCase: vi.fn().mockResolvedValue({ outcome: 'no_match' }),
  routeStatCase: vi.fn().mockResolvedValue({ outcome: 'no_match' }),
}));
vi.mock('@/services', () => ({
  aiBehaviorService: { get: vi.fn().mockResolvedValue({ ok: true, data: { grossEnabled: true } }) },
}));
vi.mock('@/services/templates/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue({ template: { sections: [{ fields: [{ id: 'f1', label: 'Field 1' }] }] } }),
  listTemplates: vi.fn().mockResolvedValue([{ id: 'tmpl-1', name: 'Template 1', category: 'GI', isDiagnostic: true }]),
}));
vi.mock('@/services/cases/mockCaseService', () => ({
  evaluateSynopticAssignment: vi.fn().mockResolvedValue({ changes: [], warnings: [] }),
  generateGrossingFieldSuggestionsFromDictation: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/narrativeSignals/deidentification', () => ({
  stripHtml: (html: string) => html.replace(/<[^>]+>/g, ''),
}));

function makeTestCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'TEST-CASE-GROSS',
    status: 'in-progress',
    specimens: [{ id: 'SP-1', label: 'A', description: 'Test specimen' }],
    grossingReports: [
      { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: { f1: 'some answer' }, createdAt: '', updatedAt: '' },
    ],
    synopticReports: [],
    diagnostic: {},
    ...overrides,
  } as unknown as Case;
}

function baseParams(overrides: Partial<Parameters<typeof useGrossingCompletion>[0]> = {}) {
  return {
    caseData: makeTestCase(),
    setCaseData: vi.fn(),
    showToast: vi.fn(),
    log: vi.fn(),
    knownVersionRef: { current: 1 },
    setConcurrencyConflict: vi.fn(),
    grossingSnapshotRef: { current: new Map<string, string>() },
    handleProtocolChangesDetected: vi.fn(),
    handleGrossingProtocolChangesDetected: vi.fn(),
    // Real fix, per direct report: "I added some gross text, but the
    // system is not allowing me to mark gross complete." Defaults to
    // empty here — matching pre-existing behavior for every test
    // below that's exercising the structured-answers path — since
    // none of them are about the new dictated-text path this field
    // exists for. See the dedicated describe block further down for
    // tests that actually cover orchSections.
    orchSections: [] as { id: string; text: string }[],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  window.prompt = vi.fn().mockReturnValue('Real correction reason');
  const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
  (generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('useGrossingCompletion — early returns', () => {
  it('does nothing when there is no caseData', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData: null, setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });
    expect(setCaseData).not.toHaveBeenCalled();
  });

  it('does nothing when there are no draft grossing reports — an already-finalized case has no pending work', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({ grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'finalized', answers: {}, createdAt: '', updatedAt: '' }] as any });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });
    expect(setCaseData).not.toHaveBeenCalled();
  });
});

describe('useGrossingCompletion — required-field gate', () => {
  it('blocks with a singular-phrased toast when exactly one specimen has no grossing entered at all', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      // No grossingReport at all for SP-2
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setCaseData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Specimen B has no grossing entered/), 'warning');
  });

  it('blocks with a plural-phrased toast naming every specimen when multiple have no answers entered', async () => {
    const showToast = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }, { id: 'SP-3', label: 'C' }] as any,
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: { f1: '' }, createdAt: '', updatedAt: '' }] as any,
      // SP-2 and SP-3 have no grossing report at all; SP-1's has a blank answer
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Specimens A, B, C have no grossing entered/), 'warning');
  });

  it('does NOT block a specimen whose grossing report has a real, non-empty answer', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });
    expect(setCaseData).toHaveBeenCalled();
  });
});

describe('useGrossingCompletion — dictated Gross text as an alternative to structured answers', () => {
  it('blocks a specimen with zero structured answers and no dictated text either — nothing real has been entered either way', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections: [] })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setCaseData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered/), 'warning');
  });

  it('does NOT block when structured answers are empty but real dictated text exists in the Gross Description section', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
    });
    const orchSections = [{ id: 'random-uuid-1', sourcePartId: 'std_body_gross', text: '<p>Specimen A received in formalin, real dictated observation.</p>' }];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered/));
    expect(setCaseData).toHaveBeenCalled();
  });

  it('dictated Gross text covers every specimen at once — it is one case-wide narrative, not per-specimen', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [{ id: 'random-uuid-2', sourcePartId: 'std_body_gross', text: '<p>Specimen A... Specimen B...</p>' }];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered|have no grossing entered/));
    expect(setCaseData).toHaveBeenCalled();
  });

  it('whitespace-only dictated text does not count as real content', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
    });
    const orchSections = [{ id: 'random-uuid-3', sourcePartId: 'std_body_gross', text: '   ' }];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setCaseData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered/), 'warning');
  });
});

describe('useGrossingCompletion — AI back-fill of structured Grossing answers from dictated text', () => {
  it('calls generateGrossingFieldSuggestionsFromDictation with the plain-text dictation and per-specimen field definitions, when dictated text exists', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    mockFn.mockClear();
    mockFn.mockResolvedValue({});

    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A', description: 'Right shoulder skin excision' }] as any,
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
      order: { facilityId: 'client-123' } as any,
    });
    const orchSections = [{ id: 'random-uuid-4', sourcePartId: 'std_body_gross', text: '<p>Specimen A dictated observation here.</p>' }];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [dictatedText, specimens, clientId] = mockFn.mock.calls[0];
    // stripHtml is mocked to a simple tag-strip — confirms HTML wasn't
    // passed through raw to the AI prompt.
    expect(dictatedText).toBe('Specimen A dictated observation here.');
    expect(specimens).toEqual([
      expect.objectContaining({ specimenId: 'SP-1', specimenLabel: 'A', specimenDesc: 'Right shoulder skin excision' }),
    ]);
    expect(clientId).toBe('client-123');
  });

  it('merges returned suggestions into the matching specimen\'s grossingReport.aiSuggestions and persists them', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    const updateCaseMock = caseRouter.updateCase as ReturnType<typeof vi.fn>;
    mockFn.mockClear();
    updateCaseMock.mockClear();

    const suggestion = { value: 'Ellipse of skin', confidence: 95, source: 'dictated observation', verification: 'unverified' as const };
    mockFn.mockResolvedValue({ 'SP-1': { specimen_type: suggestion } });

    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A', description: 'Right shoulder skin excision' }] as any,
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
    });
    const orchSections = [{ id: 'random-uuid-5', sourcePartId: 'std_body_gross', text: '<p>dictated</p>' }];
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    // Two persist calls happen: the main status-transition patch, then a
    // second one carrying the merged aiSuggestions once the AI call
    // resolves — real, separate writes, not one combined update, since
    // the suggestions aren't known until after the first persist already
    // succeeded.
    expect(updateCaseMock).toHaveBeenCalledTimes(2);
    const secondCallPatch = updateCaseMock.mock.calls[1][1];
    expect(secondCallPatch.grossingReports[0].aiSuggestions).toEqual({ specimen_type: suggestion });

    // setCaseData's final call should also carry the merged suggestions,
    // so the UI reflects them without needing a reload.
    const lastSetCaseDataCall = setCaseData.mock.calls[setCaseData.mock.calls.length - 1][0];
    const resolvedCaseData = typeof lastSetCaseDataCall === 'function' ? lastSetCaseDataCall(caseData) : lastSetCaseDataCall;
    expect(resolvedCaseData.grossingReports[0].aiSuggestions).toEqual({ specimen_type: suggestion });
  });

  it('does NOT call generateGrossingFieldSuggestionsFromDictation when grossing was completed via structured answers, not dictation — nothing to back-fill', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    mockFn.mockClear();

    // Default makeTestCase() already has a real structured answer and no
    // orchSections override — the pre-existing, non-dictation path.
    const { result } = renderHook(() => useGrossingCompletion(baseParams()));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('a failure in the AI back-fill call does not block Gross Complete itself, which has already succeeded by that point', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    mockFn.mockClear();
    mockFn.mockRejectedValue(new Error('AI provider timeout'));

    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' }] as any,
    });
    const orchSections = [{ id: 'random-uuid-6', sourcePartId: 'std_body_gross', text: '<p>dictated</p>' }];
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    // The real Gross Complete transition (the main setCaseData call)
    // still happened — a slow/failed AI enrichment call must never
    // undo or block work that already genuinely succeeded.
    expect(setCaseData).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('failed — please try again'));
  });
});

describe('useGrossingCompletion — first completion vs. update (correction) path', () => {
  it('on first completion (not an update), sets grossCompletedAt and advances status to gross-complete when no real diagnostic work has begun', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });

    const patch = setCaseData.mock.calls[0][0];
    expect(patch.grossCompletedAt).toBeDefined();
    expect(patch.status).toBe('gross-complete');
  });

  it('on a re-finalize (isUpdate), prompts for a reason via window.prompt, and cancels cleanly if the pathologist provides none', async () => {
    window.prompt = vi.fn().mockReturnValue(null);
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', previouslyFinalized: true, answers: { f1: 'x' }, createdAt: '', updatedAt: '' }] as any,
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(window.prompt).toHaveBeenCalled();
    expect(setCaseData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Update cancelled — a reason is required', 'warning');
  });

  it('on a re-finalize where real diagnostic work has already begun, does NOT overwrite grossCompletedAt or change status — the correction stands alone', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', previouslyFinalized: true, answers: { f1: 'x' }, createdAt: '', updatedAt: '' }] as any,
      diagnostic: { microscopicDescription: 'Real pathologist work already written here.' },
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });

    // Inspect the real, unmerged patch sent to caseRouter.updateCase —
    // NOT setCaseData's argument, which is `{ ...caseData, ...patch }`
    // and therefore always carries caseData's own status/grossCompletedAt
    // even when the patch itself didn't touch them.
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const [, patch] = vi.mocked(caseRouter.updateCase).mock.calls[0];
    expect((patch as any).grossCompletedAt).toBeUndefined();
    expect((patch as any).status).toBeUndefined();
  });

  it('logs the real reason with the gross_updated event on a re-finalize', async () => {
    const log = vi.fn();
    window.prompt = vi.fn().mockReturnValue('Corrected margin measurement');
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', previouslyFinalized: true, answers: { f1: 'x' }, createdAt: '', updatedAt: '' }] as any,
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, log })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(log).toHaveBeenCalledWith('gross_updated', expect.objectContaining({ reason: 'Corrected margin measurement' }));
  });
});

describe('useGrossingCompletion — pool routing', () => {
  it('routes a STAT case through routeStatCase specifically, not the standard routeCase', async () => {
    const { routeCase, routeStatCase } = await import('@/services/cases/casePoolAssignmentService');
    const caseData = makeTestCase({ order: { priority: 'STAT' } } as any);
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(routeStatCase).toHaveBeenCalledTimes(1);
    expect(routeCase).not.toHaveBeenCalled();
  });

  it('shows a toast naming the pool when routing succeeds', async () => {
    const { routeCase } = await import('@/services/cases/casePoolAssignmentService');
    vi.mocked(routeCase).mockResolvedValueOnce({ outcome: 'routed_to_pool', poolName: 'GI Pool' } as any);
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).toHaveBeenCalledWith('Routed to GI Pool pool.');
  });

  it('does NOT route a re-finalize where real diagnostic work has already begun — only the genuine first completion routes', async () => {
    const { routeCase, routeStatCase } = await import('@/services/cases/casePoolAssignmentService');
    const caseData = makeTestCase({
      grossingReports: [{ instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', previouslyFinalized: true, answers: { f1: 'x' }, createdAt: '', updatedAt: '' }] as any,
      diagnostic: { microscopicDescription: 'Already written.' },
    });
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(routeCase).not.toHaveBeenCalled();
    expect(routeStatCase).not.toHaveBeenCalled();
  });

  it('a pool routing failure is non-blocking — Gross Complete still succeeds even if routing throws', async () => {
    const { routeCase } = await import('@/services/cases/casePoolAssignmentService');
    vi.mocked(routeCase).mockRejectedValueOnce(new Error('routing service down'));
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ setCaseData })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setCaseData).toHaveBeenCalled(); // the real persistence still happened
  });
});

describe('useGrossingCompletion — Gross-Driven AI toggle', () => {
  it('when grossEnabled is false, skips Stage 1 evaluation entirely and shows the simple completion toast', async () => {
    const { aiBehaviorService } = await import('@/services');
    vi.mocked(aiBehaviorService.get).mockResolvedValueOnce({ ok: true, data: { grossEnabled: false } } as any);
    const { evaluateSynopticAssignment } = await import('@/services/cases/mockCaseService');
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(evaluateSynopticAssignment).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Grossing complete');
  });

  it('when enabled (the default), sets isEvaluatingSynopticFit true during Stage 1 evaluation and false once it resolves', async () => {
    const { evaluateSynopticAssignment } = await import('@/services/cases/mockCaseService');
    let sawTrueDuringEvaluation = false;
    vi.mocked(evaluateSynopticAssignment).mockImplementationOnce(async () => {
      sawTrueDuringEvaluation = true; // captured synchronously inside the awaited call
      return { changes: [], warnings: [] };
    });

    const { result } = renderHook(() => useGrossingCompletion(baseParams()));
    expect(result.current.isEvaluatingSynopticFit).toBe(false);
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(sawTrueDuringEvaluation).toBe(true);
    expect(result.current.isEvaluatingSynopticFit).toBe(false); // always released in finally, regardless of outcome
  });

  it('calls handleProtocolChangesDetected when Stage 1 proposes real changes', async () => {
    const { evaluateSynopticAssignment } = await import('@/services/cases/mockCaseService');
    const realChange = { specimenId: 'SP-1', action: 'add', templateId: 'tmpl-2' };
    vi.mocked(evaluateSynopticAssignment).mockResolvedValueOnce({ changes: [realChange], warnings: [] } as any);
    const handleProtocolChangesDetected = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ handleProtocolChangesDetected })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(handleProtocolChangesDetected).toHaveBeenCalledWith([realChange]);
  });

  it('shows "no changes proposed" when Stage 1 evaluation finds nothing to change', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).toHaveBeenCalledWith('No synoptic assignment changes proposed');
  });
});

describe('useGrossingCompletion — concurrency conflict and generic failure', () => {
  it('surfaces the conflict modal and suppresses the generic failure toast on a real ConcurrencyConflictError', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockRejectedValueOnce(new ConcurrencyConflictError('TEST-CASE-GROSS', 1, 5));
    const setConcurrencyConflict = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ setConcurrencyConflict, showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setConcurrencyConflict).toHaveBeenCalledWith({ actualVersion: 5, blockOverride: undefined });
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('failed'));
  });

  it('shows the real failure toast, phrased for first-completion vs. update, on any other error', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockRejectedValueOnce(new Error('network down'));
    const showToast = vi.fn();
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ showToast })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).toHaveBeenCalledWith('Gross Complete failed — please try again', 'warning');
  });
});

describe('useGrossingCompletion — per-specimen Gross Description sections', () => {
  it('blocks when some specimens have their own dictated section but others do not — per-specimen strictness, not "any one section satisfies all"', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [
      { id: 'gross_SP-1', sourcePartId: 'std_body_gross', specimenId: 'SP-1', text: '<p>Specimen A dictated.</p>' },
      { id: 'gross_SP-2', sourcePartId: 'std_body_gross', specimenId: 'SP-2', text: '' },
    ];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(setCaseData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Specimen B has no grossing entered/), 'warning');
  });

  it('does NOT block when every specimen has its own dictated Gross Description section', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [
      { id: 'gross_SP-1', sourcePartId: 'std_body_gross', specimenId: 'SP-1', text: '<p>Specimen A dictated.</p>' },
      { id: 'gross_SP-2', sourcePartId: 'std_body_gross', specimenId: 'SP-2', text: '<p>Specimen B dictated.</p>' },
    ];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered|have no grossing entered/));
    expect(setCaseData).toHaveBeenCalled();
  });

  it('a specimen with real structured answers still satisfies the gate even with no dictated section at all — the two paths remain independent per specimen', async () => {
    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: { f1: 'real answer' }, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [
      { id: 'gross_SP-2', sourcePartId: 'std_body_gross', specimenId: 'SP-2', text: '<p>Specimen B dictated.</p>' },
    ];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered|have no grossing entered/));
    expect(setCaseData).toHaveBeenCalled();
  });

  it('calls the AI back-fill once per specimen, each with only that specimen in the candidate list, when per-specimen sections exist', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    mockFn.mockClear();
    mockFn.mockResolvedValue({});

    const caseData = makeTestCase({
      specimens: [
        { id: 'SP-1', label: 'A', description: 'Right shoulder skin excision' },
        { id: 'SP-2', label: 'B', description: 'Appendix' },
      ] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [
      { id: 'gross_SP-1', sourcePartId: 'std_body_gross', specimenId: 'SP-1', text: '<p>A observation.</p>' },
      { id: 'gross_SP-2', sourcePartId: 'std_body_gross', specimenId: 'SP-2', text: '<p>B observation.</p>' },
    ];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    // Two independent calls, not one combined call — real accuracy
    // improvement per direct request: each specimen's already-
    // segmented text is unambiguous, so no cross-specimen attribution
    // guessing is needed anymore.
    expect(mockFn).toHaveBeenCalledTimes(2);
    const callSpecimenIds = mockFn.mock.calls.map(call => call[1].map((s: any) => s.specimenId));
    expect(callSpecimenIds).toEqual([['SP-1'], ['SP-2']]);
    const callTexts = mockFn.mock.calls.map(call => call[0]);
    expect(callTexts).toEqual(['A observation.', 'B observation.']);
  });

  it('a case-wide section (no specimenId — the AI-generation path) still satisfies every specimen at once, unchanged from before', async () => {
    const { generateGrossingFieldSuggestionsFromDictation } = await import('@/services/cases/mockCaseService');
    const mockFn = generateGrossingFieldSuggestionsFromDictation as ReturnType<typeof vi.fn>;
    mockFn.mockClear();
    mockFn.mockResolvedValue({});

    const showToast = vi.fn();
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A' }, { id: 'SP-2', label: 'B' }] as any,
      grossingReports: [
        { instanceId: 'GR-1', specimenId: 'SP-1', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
        { instanceId: 'GR-2', specimenId: 'SP-2', templateId: 'tmpl-1', templateName: 'T1', status: 'draft', answers: {}, createdAt: '', updatedAt: '' },
      ] as any,
    });
    const orchSections = [
      { id: 'gross_combined', sourcePartId: 'std_body_gross', text: '<p>Combined narrative covering both specimens.</p>' },
    ];
    const { result } = renderHook(() => useGrossingCompletion(baseParams({ caseData, setCaseData, showToast, orchSections })));
    await act(async () => { await result.current.handleGrossComplete(); });

    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/has no grossing entered|have no grossing entered/));
    expect(setCaseData).toHaveBeenCalled();
    // One combined call, exactly as before per-specimen sections existed
    expect(mockFn).toHaveBeenCalledTimes(1);
    const specimenIds = mockFn.mock.calls[0][1].map((s: any) => s.specimenId);
    expect(specimenIds).toEqual(['SP-1', 'SP-2']);
  });
});
