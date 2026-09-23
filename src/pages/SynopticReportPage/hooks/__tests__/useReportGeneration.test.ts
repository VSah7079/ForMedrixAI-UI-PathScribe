// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useReportGeneration.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// See useLisIntegration.test.ts's header for the unit/integration split
// rationale and the @vitest-environment override rationale.
//
// OrchestratorEngine and buildContext are mocked entirely, not exercised for
// real — this hook's actual responsibility is wiring the engine's streaming
// callbacks to React state correctly (the userEdited vs. not-yet-accepted
// branching in particular is real, subtle logic worth testing), and driving
// the auto-generate-once trigger's conditions. Testing whether the AI
// engine itself produces correct narrative text is a different concern
// entirely, well outside what a hook unit test should cover — there is no
// "integration test" variant of this file for that reason; there's no real,
// safe-to-call-in-CI service underneath this hook the way mockCaseService
// is for the case-write hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
// Initializes the real i18next instance so t() resolves to actual English
// text at test time — this hook's toast strings are now i18n-driven, and
// a few assertions below require exact-text equality, not just substring
// containment.
import '@/i18n/config';
import { useReportGeneration } from '../useReportGeneration';
import type { Case } from '@/types/case/Case';
import type { OrchestratorSection } from '../../components/OrchestratorSectionEditor';

// Captures the callbacks the hook hands to `new OrchestratorEngine(...)` so
// tests can invoke them directly, simulating a real streaming generation
// without actually running one.
let capturedCallbacks: any = null;
const mockRun = vi.fn().mockResolvedValue(undefined);
const mockRegenerateSection = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn();

vi.mock('@/orchestrator/orchestratorEngine', () => ({
  OrchestratorEngine: vi.fn().mockImplementation(function (_a: any, _ctx: any, callbacks: any) {
    capturedCallbacks = callbacks;
    return { run: mockRun, regenerateSection: mockRegenerateSection, cancel: mockCancel };
  }),
}));

vi.mock('@/orchestrator/contextBuilder', () => ({
  buildContext: vi.fn().mockResolvedValue({
    narrativeTemplate: { templateId: 'tmpl-1', templateName: 'Test Template' },
    routingResolvedBy: 'gold-standard',
  }),
}));

function baseParams(overrides: Partial<Parameters<typeof useReportGeneration>[0]> = {}) {
  return {
    caseData: { id: 'TEST-CASE' } as Case,
    signingUser: { id: 'PATH-001', name: 'Dr. Test' } as any,
    showToast: vi.fn(),
    orchSections: [] as OrchestratorSection[],
    setOrchSections: vi.fn(),
    overrideTemplateId: null,
    safeSetLeftTab: vi.fn(),
    leftTab: 'draft',
    isOrchestrationMode: true,
    synopticPanelRef: { current: { validateRequired: vi.fn().mockReturnValue([]) } } as any,
    caseId: 'TEST-CASE',
    setResolvedContext: vi.fn(),
    setResolvedTemplateId: vi.fn(),
    setResolvedTemplateName: vi.fn(),
    setResolvedBy: vi.fn(),
    setLastGeneratedAt: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  capturedCallbacks = null;
  mockRun.mockClear();
  mockRegenerateSection.mockClear();
  mockCancel.mockClear();
});

describe('useReportGeneration — buildOrchCallbacks state transitions', () => {
  it('onSectionStart creates a new streaming section when none exists yet for this id', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));

    await act(async () => { await result.current.handleGenerateReport(); });

    capturedCallbacks.onSectionStart('sec-1', 'Gross Description');
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater([]);
    expect(next).toEqual([{ id: 'sec-1', label: 'Gross Description', type: 'narrative', text: '', aiGenerated: '', userEdited: false, isStreaming: true }]);
  });

  it('onSectionStart on a REGENERATE of a not-yet-accepted section clears text (the live preview) to start clean', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: 'stale ai text', aiGenerated: 'stale ai text', userEdited: false } as any];
    capturedCallbacks.onSectionStart('sec-1', 'Gross');
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0]).toMatchObject({ isStreaming: true, pendingDraft: undefined, text: '' });
  });

  it('onSectionStart on a REGENERATE of an accepted (userEdited) section leaves the committed text untouched — only pendingDraft resets', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: 'pathologist final wording', aiGenerated: 'old ai draft', userEdited: true, pendingDraft: 'leftover from a previous regenerate' } as any];
    capturedCallbacks.onSectionStart('sec-1', 'Gross');
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0]).toMatchObject({ isStreaming: true, pendingDraft: '', text: 'pathologist final wording' });
  });

  it('onToken accumulates into pendingDraft for an accepted section, never touching the committed text', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: 'committed version', aiGenerated: 'x', userEdited: true, pendingDraft: 'New ' } as any];
    capturedCallbacks.onToken('sec-1', 'draft text');
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0].pendingDraft).toBe('New draft text');
    expect(next[0].text).toBe('committed version'); // unchanged
  });

  it('onToken accumulates directly into text for a not-yet-accepted section', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: 'Partial ', aiGenerated: '', userEdited: false } as any];
    capturedCallbacks.onToken('sec-1', 'token');
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0].text).toBe('Partial token');
  });

  it('onSectionComplete for an accepted section lands the finished result in pendingDraft, surfacing the "new draft available" choice — never silently overwrites the pathologist\'s committed text', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: 'pathologist final wording', aiGenerated: 'old', userEdited: true } as any];
    capturedCallbacks.onSectionComplete('sec-1', { text: 'freshly generated content' });
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0].text).toBe('pathologist final wording'); // untouched
    expect(next[0].pendingDraft).toContain('freshly generated content');
  });

  it('onSectionComplete for a not-yet-accepted section commits directly into both text and aiGenerated', async () => {
    const setOrchSections = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setOrchSections })));
    await act(async () => { await result.current.handleGenerateReport(); });

    const existing: OrchestratorSection[] = [{ id: 'sec-1', label: 'Gross', type: 'narrative', text: '', aiGenerated: '', userEdited: false } as any];
    capturedCallbacks.onSectionComplete('sec-1', { text: 'generated content' });
    const calls = setOrchSections.mock.calls; const updater = calls[calls.length - 1][0];
    const next = updater(existing);
    expect(next[0].text).toContain('generated content');
    expect(next[0].aiGenerated).toBe(next[0].text);
  });

  it('onComplete stops the orchestrating flag and stamps lastGeneratedAt', async () => {
    const setLastGeneratedAt = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ setLastGeneratedAt })));
    await act(async () => { await result.current.handleGenerateReport(); });

    act(() => { capturedCallbacks.onComplete(); });
    expect(result.current.isOrchestrating).toBe(false);
    expect(setLastGeneratedAt).toHaveBeenCalledWith(expect.any(Date));
  });

  it('onError stops orchestrating and shows a real toast naming the error, rather than failing silently', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ showToast })));
    await act(async () => { await result.current.handleGenerateReport(); });

    act(() => { capturedCallbacks.onError('sec-1', 'model timed out'); });
    expect(result.current.isOrchestrating).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('model timed out'));
  });
});

describe('useReportGeneration — handleGenerateReport / handleAbortGenerate', () => {
  it('sets isOrchestrating true, switches to the draft tab, and resolves the template through buildContext including a pathologist override', async () => {
    const safeSetLeftTab = vi.fn();
    const setResolvedBy = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ safeSetLeftTab, setResolvedBy, overrideTemplateId: 'tmpl-override' })));

    await act(async () => { await result.current.handleGenerateReport(); });

    expect(safeSetLeftTab).toHaveBeenCalledWith('draft');
    expect(setResolvedBy).toHaveBeenCalledWith('pathologist-override');
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all if there is no caseData — no engine, no tab switch, no context resolution', async () => {
    const safeSetLeftTab = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ caseData: null, safeSetLeftTab })));

    await act(async () => { await result.current.handleGenerateReport(); });

    expect(safeSetLeftTab).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('shows a real failure toast with the real error message when the engine genuinely throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('model timed out'));
    const showToast = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ showToast })));

    await act(async () => { await result.current.handleGenerateReport(); });

    expect(showToast).toHaveBeenCalledWith('Generation failed: model timed out');
    expect(result.current.isOrchestrating).toBe(false);
  });

  it('shows NO failure toast for a genuine AbortError — an intentional cancellation, not a failure', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockRun.mockRejectedValueOnce(abortError);
    const showToast = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ showToast })));

    await act(async () => { await result.current.handleGenerateReport(); });

    expect(showToast).not.toHaveBeenCalled();
  });

  it('handleAbortGenerate cancels the real engine instance and shows a real cancellation toast', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useReportGeneration(baseParams({ showToast })));
    await act(async () => { await result.current.handleGenerateReport(); });

    act(() => { result.current.handleAbortGenerate(); });

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(result.current.isOrchestrating).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Generation cancelled');
  });
});

describe('useReportGeneration — handleRegenerateSection', () => {
  it('refuses to start a regenerate while a generation is already in flight', async () => {
    const { result } = renderHook(() => useReportGeneration(baseParams()));
    await act(async () => { await result.current.handleGenerateReport(); }); // starts, isOrchestrating stays true until onComplete/onError fires

    mockRegenerateSection.mockClear();
    await act(async () => { await result.current.handleRegenerateSection('sec-1'); });

    expect(mockRegenerateSection).not.toHaveBeenCalled();
  });
});

describe('useReportGeneration — auto-generate-once trigger', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires handleGenerateReport after the 2s cancelable window when every real condition holds', async () => {
    const validateRequired = vi.fn().mockReturnValue([]);
    renderHook(() => useReportGeneration(baseParams({
      leftTab: 'draft', isOrchestrationMode: true, orchSections: [],
      synopticPanelRef: { current: { validateRequired } } as any,
    })));

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire if required synoptic fields are still missing — stays quiet, no nag', async () => {
    const validateRequired = vi.fn().mockReturnValue(['field-1']);
    renderHook(() => useReportGeneration(baseParams({
      leftTab: 'draft', isOrchestrationMode: true, orchSections: [],
      synopticPanelRef: { current: { validateRequired } } as any,
    })));

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('does NOT fire when a draft already exists — never clobbers existing work', async () => {
    const validateRequired = vi.fn().mockReturnValue([]);
    renderHook(() => useReportGeneration(baseParams({
      leftTab: 'draft', isOrchestrationMode: true,
      orchSections: [{ id: 'sec-1', label: 'x', type: 'narrative', text: 'already here', aiGenerated: '', userEdited: false } as any],
      synopticPanelRef: { current: { validateRequired } } as any,
    })));

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('cancelAutoGenerate clears the pending timer before it fires', async () => {
    const validateRequired = vi.fn().mockReturnValue([]);
    const { result } = renderHook(() => useReportGeneration(baseParams({
      leftTab: 'draft', isOrchestrationMode: true, orchSections: [],
      synopticPanelRef: { current: { validateRequired } } as any,
    })));

    expect(result.current.pendingAutoGenerate).toBe(true);
    act(() => { result.current.cancelAutoGenerate(); });
    expect(result.current.pendingAutoGenerate).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mockRun).not.toHaveBeenCalled();
  });
});
