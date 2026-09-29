// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/hooks/__tests__/useSpecimenBlockManagement.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// See useLisIntegration.test.ts's header for the unit/integration split
// rationale and the @vitest-environment override rationale.
//
// This hook has different testing surface than useLisIntegration:
// a useMemo-derived value (allBlocks), local useState (focusedBlockIndex)
// with a self-correcting effect, and four write operations that share the
// same caseRouter.updateCase + concurrency-conflict pattern except one
// (handleAddBlock) which deliberately does NOT — it force-writes through a
// conflict rather than surfacing the modal, since the LIS has already
// acknowledged the physical order by that point. That intentional
// difference is exactly the kind of thing worth a dedicated test, not an
// assumption.
//
// Real update alongside this hook's own i18n sweep conversion: it now
// calls useTranslation(), so the real i18next instance needs to be
// initialized before render — same side-effect import main.tsx itself
// uses (`import '@/i18n/config'`) — otherwise t() has nothing to
// resolve keys against and every showToast(...) assertion below would
// see the raw key string instead of its English text.
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook as rtlRenderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/contexts/AuthContext';
import { useSpecimenBlockManagement } from '../useSpecimenBlockManagement';
import { ConcurrencyConflictError } from '@/services/cases/ConcurrencyConflictError';
import type { Case } from '@/types/case/Case';

// Real, per PS-55 gap-closing pass: the printed-label path
// (attemptPrintedLabel, above) was already real and already routed
// through the real QZ Tray dispatch (dispatchZplLabel.ts) whenever a
// station's configured printer profile has bridgeType 'qz_tray' — but
// nothing at THIS integration layer (station lookup → printer profile
// lookup → printCassetteLabel/printSlideLabel call) was ever actually
// exercised by a test; only the lower-level units
// (printCassetteSlideLabel.test.ts, dispatchZplLabel's own real
// routing) were. Mocking only the true external boundary
// (qzTrayBridge.ts's own qz-tray calls), same real, established
// pattern printCassetteSlideLabel.test.ts already uses — everything
// above it (mockScanStationService, printerProfileService,
// printSettingsService) is the app's own real, seeded mock services,
// exercised for real here.
vi.mock('@/utils/labels/qzTrayBridge', () => ({
  printZplViaQzTray: vi.fn(),
}));
import { printZplViaQzTray } from '@/utils/labels/qzTrayBridge';
import { printSettingsService } from '@/services/index';

// Real fix, per direct follow-up: "I would like to support both slide
// engraving and printed labels." useSpecimenBlockManagement now calls
// useEffectiveScanStation (for the real, additive printed-label path —
// see attemptPrintedLabel's own doc comment there), which itself calls
// useAuth — genuinely correct, since real, production usage of this
// hook always sits inside AuthProvider. This file's own renderHook
// calls didn't, since that dependency didn't exist until now. A single,
// shared wrapper here, rather than editing dozens of individual call
// sites — every renderHook( call below is renderHook( from this
// import, not @testing-library/react's own, unwrapped version.
const renderHook: typeof rtlRenderHook = (callback, options) =>
  rtlRenderHook(callback, { ...options, wrapper: ({ children }) => React.createElement(AuthProvider, null, children) });

vi.mock('@/services/cases/CaseRouter', () => ({
  caseRouter: { updateCase: vi.fn() },
}));

function makeTestCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'TEST-CASE-BLOCKS',
    status: 'in-progress',
    accession: { fullAccession: 'TEST-CASE-BLOCKS' } as Case['accession'],
    // Real, minimal patient — added per direct follow-up: "I would
    // like to support both slide engraving and printed labels." The
    // real, additive printed-label path (attemptPrintedLabel, in
    // printCassetteForBlock/printMatrixCassette/handleBatchPrintCassettes/
    // handleBatchPrintSlides) needs a real patient name for the ZPL
    // label text — this fixture was genuinely missing one before,
    // not something worth hiding with a defensive fallback in the
    // real, production code, since a real case always has a patient.
    patient: { givenNames: 'Test', familyNames: 'Patient' } as Case['patient'],
    specimens: [
      {
        id: 'SP-1', label: 'A', description: 'Test specimen',
        blocks: [
          { id: 'BLK-1', label: '1', status: 'Pending', stains: [] },
          { id: 'BLK-2', label: '2', status: 'Grossed', stains: [] },
        ],
      },
      {
        id: 'SP-2', label: 'B', description: 'Second specimen',
        blocks: [{ id: 'BLK-3', label: '1', status: 'Embedded', stains: [] }],
      },
    ],
    ...overrides,
  } as unknown as Case;
}

const testSigningUser = { id: 'PATH-001', name: 'Dr. Test Pathologist' } as any;
const knownVersionRef = { current: 1 };

function baseParams(overrides: Partial<Parameters<typeof useSpecimenBlockManagement>[0]> = {}) {
  return {
    caseData: makeTestCase(),
    setCaseData: vi.fn(),
    signingUser: testSigningUser,
    markDirty: vi.fn(),
    knownVersionRef,
    setConcurrencyConflict: vi.fn(),
    sendMaterialOrderToLis: vi.fn().mockResolvedValue({ ok: true }),
    showToast: vi.fn(),
    ...overrides,
  };
}

describe('useSpecimenBlockManagement — allBlocks / focused-block derivation', () => {
  it('flattens blocks across every specimen into one sequence, in specimen order', () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
    expect(result.current.allBlocks.map(b => b.block.id)).toEqual(['BLK-1', 'BLK-2', 'BLK-3']);
    expect(result.current.allBlocks[0].specimenLabel).toBe('A');
    expect(result.current.allBlocks[2].specimenLabel).toBe('B');
  });

  it('defaults focusedBlockEntry to the first block in the flattened sequence', () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
    expect(result.current.focusedBlockEntry?.block.id).toBe('BLK-1');
  });

  it('self-corrects focusedBlockIndex back into range when the case shrinks to fewer blocks than the current index', () => {
    const params = baseParams();
    const { result, rerender } = renderHook(
      (p: any) => useSpecimenBlockManagement(p),
      { initialProps: params },
    );

    act(() => { result.current.setFocusedBlockIndex(2); }); // points at BLK-3
    expect(result.current.focusedBlockEntry?.block.id).toBe('BLK-3');

    // Re-render with a case that now has only one block total
    const shrunkCase = makeTestCase({
      specimens: [{ id: 'SP-1', label: 'A', description: 'x', blocks: [{ id: 'BLK-1', label: '1', status: 'Pending', stains: [] }] }] as any,
    });
    rerender({ ...params, caseData: shrunkCase });

    expect(result.current.focusedBlockIndex).toBe(0);
    expect(result.current.focusedBlockEntry?.block.id).toBe('BLK-1');
  });
});

describe('useSpecimenBlockManagement — handleAdvanceFocusedBlockStatus', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('advances Pending → Grossed for the currently-focused block only, leaving other blocks untouched', async () => {
    const setCaseData = vi.fn();
    const markDirty = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData, markDirty })));

    // focusedBlockEntry defaults to BLK-1, status Pending
    await act(async () => { await result.current.handleAdvanceFocusedBlockStatus(); });

    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const [, patch] = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const patchedBlock1 = (patch as any).specimens[0].blocks.find((b: any) => b.id === 'BLK-1');
    const untouchedBlock2 = (patch as any).specimens[0].blocks.find((b: any) => b.id === 'BLK-2');
    expect(patchedBlock1.status).toBe('Grossed');
    expect(untouchedBlock2.status).toBe('Grossed'); // BLK-2 was already Grossed and unrelated to this call
    expect(markDirty).toHaveBeenCalledWith('Block status');
  });

  it('does nothing for a terminal status (Embedded) — not voice-advanceable, matching the real nextStatus map having no entry for it', async () => {
    const setCaseData = vi.fn();
    const params = baseParams({ setCaseData });
    const { result } = renderHook(() => useSpecimenBlockManagement(params));

    act(() => { result.current.setFocusedBlockIndex(2); }); // BLK-3, status Embedded
    await act(async () => { await result.current.handleAdvanceFocusedBlockStatus(); });

    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
    expect(setCaseData).not.toHaveBeenCalled();
  });

  it('surfaces the conflict modal via setConcurrencyConflict on a real ConcurrencyConflictError, without blockOverride (routine edit, not a high-stakes write)', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockRejectedValueOnce(new ConcurrencyConflictError('TEST-CASE-BLOCKS', 1, 7));
    const setConcurrencyConflict = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setConcurrencyConflict })));

    await act(async () => { await result.current.handleAdvanceFocusedBlockStatus(); });

    expect(setConcurrencyConflict).toHaveBeenCalledWith({ actualVersion: 7, blockOverride: undefined });
  });
});

describe('useSpecimenBlockManagement — handleConfirmTriage / handleOverrideTriage / handleConfirmTriageChecklistItem / triage release gate', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  const withTriage = (overrideReason?: string) => makeTestCase({
    specimens: [
      {
        id: 'SP-1', label: 'A', description: 'Test specimen',
        blocks: [{ id: 'BLK-1', label: '1', status: 'Pending', stains: [] }],
        triage: {
          requiredAt: '2026-09-01T00:00:00.000Z',
          checklistItems: [{ item: 'Split core into LM/IF/EM portions', confirmed: false }],
          overrideReason,
        },
      },
    ],
  } as any);

  it('handleConfirmTriage is a real no-op when the focused specimen has no SpecimenTriage at all — nothing to confirm', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
    await act(async () => { await result.current.handleConfirmTriage(); });
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('handleConfirmTriage marks every real checklist item confirmed and stamps completedAt/By, attributed to the real signing user', async () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: withTriage() })));
    await act(async () => { await result.current.handleConfirmTriage(); });

    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const [, patch] = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const patchedSpecimen = (patch as any).specimens.find((s: any) => s.id === 'SP-1');
    expect(patchedSpecimen.triage.checklistItems.every((ci: any) => ci.confirmed)).toBe(true);
    expect(patchedSpecimen.triage.completedBy).toBe('PATH-001');
    expect(typeof patchedSpecimen.triage.completedAt).toBe('string');
  });

  it('handleConfirmTriageChecklistItem confirms one real item without touching the others, and only stamps completedAt/By once every item is confirmed', async () => {
    const caseData = withTriage();
    (caseData.specimens![0] as any).triage.checklistItems = [
      { item: 'Split core into LM/IF/EM portions', confirmed: false },
      { item: 'Confirm laterality on the requisition', confirmed: false },
    ];
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData })));

    await act(async () => { await result.current.handleConfirmTriageChecklistItem('SP-1', 0, true); });
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    let patch = vi.mocked(caseRouter.updateCase).mock.calls[0][1] as any;
    let sp = patch.specimens.find((s: any) => s.id === 'SP-1');
    expect(sp.triage.checklistItems[0].confirmed).toBe(true);
    expect(sp.triage.checklistItems[1].confirmed).toBe(false);
    expect(sp.triage.completedAt).toBeUndefined();

    vi.mocked(caseRouter.updateCase).mockClear();
    const { result: result2 } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: { ...caseData, specimens: patch.specimens } })));
    await act(async () => { await result2.current.handleConfirmTriageChecklistItem('SP-1', 1, true); });
    patch = vi.mocked(caseRouter.updateCase).mock.calls[0][1] as any;
    sp = patch.specimens.find((s: any) => s.id === 'SP-1');
    expect(sp.triage.checklistItems.every((ci: any) => ci.confirmed)).toBe(true);
    expect(typeof sp.triage.completedAt).toBe('string');
  });

  it('handleOverrideTriage requires a real, non-empty reason — a blank reason is a genuine no-op', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: withTriage() })));
    await act(async () => { await result.current.handleOverrideTriage('SP-1', '   '); });
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
  });

  it('handleOverrideTriage records the real reason and stamps completedAt/By, even with the checklist still incomplete', async () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: withTriage() })));
    await act(async () => { await result.current.handleOverrideTriage('SP-1', 'Urgent STAT case — supervisor override.'); });

    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const [, patch] = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const sp = (patch as any).specimens.find((s: any) => s.id === 'SP-1');
    expect(sp.triage.overrideReason).toBe('Urgent STAT case — supervisor override.');
    expect(sp.triage.checklistItems[0].confirmed).toBe(false); // never silently marks the checklist itself confirmed
    expect(typeof sp.triage.completedAt).toBe('string');
  });

  describe('handleReleaseGrossingBlocks — real triage gate', () => {
    it('blocks release and shows a real, clear error when triage is required and genuinely incomplete', async () => {
      const showToast = vi.fn();
      const { caseRouter } = await import('@/services/cases/CaseRouter');
      const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: withTriage(), showToast })));
      await act(async () => { await result.current.handleReleaseGrossingBlocks('SP-1', ['BLK-1']); });
      expect(showToast).toHaveBeenCalledWith('Cannot release blocks: Specimen triage is incomplete.', 'warning');
      expect(caseRouter.updateCase).not.toHaveBeenCalled();
    });

    it('releases normally once an override reason is recorded, even with the checklist still unconfirmed', async () => {
      const { caseRouter } = await import('@/services/cases/CaseRouter');
      const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: withTriage('Urgent — supervisor override.') })));
      await act(async () => { await result.current.handleReleaseGrossingBlocks('SP-1', ['BLK-1']); });
      expect(caseRouter.updateCase).toHaveBeenCalledTimes(1);
    });

    it('releases normally once every checklist item is genuinely confirmed', async () => {
      const caseData = withTriage();
      (caseData.specimens![0] as any).triage.checklistItems[0].confirmed = true;
      const { caseRouter } = await import('@/services/cases/CaseRouter');
      const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData })));
      await act(async () => { await result.current.handleReleaseGrossingBlocks('SP-1', ['BLK-1']); });
      expect(caseRouter.updateCase).toHaveBeenCalledTimes(1);
    });

    it('a specimen with no SpecimenTriage at all (protocol never required it) releases exactly as before — never gated', async () => {
      const { caseRouter } = await import('@/services/cases/CaseRouter');
      const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
      await act(async () => { await result.current.handleReleaseGrossingBlocks('SP-1', ['BLK-1']); });
      expect(caseRouter.updateCase).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useSpecimenBlockManagement — handleUpdateBlock', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('applies arbitrary changes to a specific block by id, regardless of focus state', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => {
      await result.current.handleUpdateBlock('SP-2', 'BLK-3', { status: 'Exhausted', coding: { cpt: [{ code: '88305' }] } });
    });

    const { caseRouter } = await import('@/services/cases/CaseRouter');
    const [, patch] = vi.mocked(caseRouter.updateCase).mock.calls[0];
    const updatedBlock = (patch as any).specimens.find((s: any) => s.id === 'SP-2').blocks[0];
    expect(updatedBlock.status).toBe('Exhausted');
    expect(updatedBlock.coding.cpt).toEqual([{ code: '88305' }]);
  });
});

describe('useSpecimenBlockManagement — handleAddBlock', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('adds the block optimistically as "pending" immediately, then flags it "rejected" in place if the LIS declines — never silently removes it (real, per-turn follow-up: optimistic UI + never-silently-drop-a-rejection)', async () => {
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: false });
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ sendMaterialOrderToLis, setCaseData, showToast })));

    await act(async () => { await result.current.handleAddBlock('SP-1'); });

    // Phase 1 (optimistic add) really did persist — the block exists,
    // it's just flagged, not absent.
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).toHaveBeenCalled();
    expect(setCaseData).toHaveBeenCalled();

    // First call: the optimistic add, marked pending.
    const optimisticCase = setCaseData.mock.calls[0][0];
    const optimisticBlock = optimisticCase.specimens.find((s: any) => s.id === 'SP-1').blocks[2];
    expect(optimisticBlock.lisRequestStatus).toBe('pending');

    // Last call: the SAME block, now flagged rejected — never removed.
    const lastSetCaseDataArg = setCaseData.mock.calls[setCaseData.mock.calls.length - 1][0];
    const finalSpecimens = typeof lastSetCaseDataArg === 'function'
      ? lastSetCaseDataArg(optimisticCase).specimens
      : lastSetCaseDataArg.specimens;
    const finalBlock = finalSpecimens.find((s: any) => s.id === 'SP-1').blocks[2];
    expect(finalBlock.id).toBe(optimisticBlock.id);
    expect(finalBlock.lisRequestStatus).toBe('rejected');

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('awaiting LIS confirmation'));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('LIS rejected'), 'warning');
  });

  it('adds a real block with the next sequential label once the LIS acknowledges', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => { await result.current.handleAddBlock('SP-1'); });

    // SP-1 already had BLK-1, BLK-2 — the third block should be labeled "3"
    const updatedCase = setCaseData.mock.calls[0][0];
    const sp1 = updatedCase.specimens.find((s: any) => s.id === 'SP-1');
    expect(sp1.blocks).toHaveLength(3);
    expect(sp1.blocks[2].label).toBe('3');
    expect(sp1.blocks[2].status).toBe('Grossed');
  });

  it('defaults every new block to a real, pending H&E stain order — per direct confirmation, not an empty one', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => { await result.current.handleAddBlock('SP-1'); });

    const updatedCase = setCaseData.mock.calls[0][0];
    const newBlock = updatedCase.specimens.find((s: any) => s.id === 'SP-1').blocks[2];
    expect(newBlock.stains).toHaveLength(1);
    expect(newBlock.stains[0].stainName).toBe('H&E');
    expect(newBlock.stains[0].status).toBe('Pending Cut');
  });

  it('deliberately FORCES the write through on a conflict rather than surfacing the modal — the LIS already has the physical order by this point, so there is no safe "discard" option', async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase)
      .mockRejectedValueOnce(new ConcurrencyConflictError('TEST-CASE-BLOCKS', 1, 9)) // Phase 1 initial: conflict
      .mockResolvedValueOnce(undefined) // Phase 1 retry: succeeds
      .mockResolvedValueOnce(undefined); // Phase 2 (confirm/reject): succeeds
    const setConcurrencyConflict = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setConcurrencyConflict, showToast })));

    await act(async () => { await result.current.handleAddBlock('SP-1'); });

    // The conflict modal must NOT be shown for this specific write
    expect(setConcurrencyConflict).not.toHaveBeenCalled();
    // Real, genuinely different count from before this session's
    // optimistic-UI rewrite: Phase 1's own initial-conflict + retry,
    // plus Phase 2's own separate write (confirm/reject) — a real,
    // additional persisted write that didn't exist in the old,
    // single-phase flow, not a regression in this count.
    expect(caseRouter.updateCase).toHaveBeenCalledTimes(3);
    // The pathologist must be told this happened, even though it succeeded
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('unsaved changes elsewhere'), 'warning');
  });
});

describe('useSpecimenBlockManagement — handleBatchPrintCassettes / batchPrintBlocked (real fix: enforceOnDemandGuardrails now actually enforced)', () => {
  beforeEach(async () => {
    const { printSettingsService } = await import('@/services/index');
    await printSettingsService.reset();
  });

  it('batchPrintBlocked is false by default (guardrail off), and batch printing proceeds normally', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ showToast })));
    // Let the async printSettingsService.get() in the hook's own effect resolve.
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });

    expect(result.current.batchPrintBlocked).toBe(false);
    act(() => { result.current.handleBatchPrintCassettes(); });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Printing'), 'info', { containsPhi: true });
  });

  it('batchPrintBlocked is genuinely true when the lab default is on_demand AND the guardrail is enforced', async () => {
    const { printSettingsService } = await import('@/services/index');
    await printSettingsService.update({ defaultPrintBehavior: 'on_demand', enforceOnDemandGuardrails: true });
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ showToast })));
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });

    expect(result.current.batchPrintBlocked).toBe(true);
    act(() => { result.current.handleBatchPrintCassettes(); });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Batch printing is disabled'), 'warning');
  });

  it('the guardrail only applies when the default is genuinely on_demand — a batch-default lab is never blocked by this flag', async () => {
    const { printSettingsService } = await import('@/services/index');
    await printSettingsService.update({ defaultPrintBehavior: 'batch', enforceOnDemandGuardrails: true });
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });

    expect(result.current.batchPrintBlocked).toBe(false);
  });

  it('enforceOnDemandGuardrails alone, without on_demand as the default, does not block batch printing', async () => {
    const { printSettingsService } = await import('@/services/index');
    await printSettingsService.update({ defaultPrintBehavior: 'on_demand', enforceOnDemandGuardrails: false });
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams()));
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });

    expect(result.current.batchPrintBlocked).toBe(false);
  });
});

describe('useSpecimenBlockManagement — attemptPrintedLabel real, end-to-end QZ Tray dispatch (PS-55 gap-closing pass)', () => {
  beforeEach(async () => {
    vi.mocked(printZplViaQzTray).mockReset().mockResolvedValue({ ok: true, data: undefined } as any);
    // Real, seeded station 'station-gross-1' → real, seeded printer
    // profile 'printer-zt411-example' (bridgeType 'qz_tray', per this
    // pass's own fix in mockPrinterProfileService.ts) — never a second,
    // parallel fixture duplicating what the app's own real mock
    // services already seed. A real GTIN is required here —
    // printCassetteLabel/printSlideLabel refuse cleanly before ever
    // reaching bridge dispatch when gs1Gtin is empty (the real default).
    await printSettingsService.update({ gs1Gtin: '00850000000000' });
  });

  it('printCassetteForBlock reaches the real QZ Tray dispatch when the effective station is configured for printing', async () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ effectiveStationId: 'station-gross-1' })));
    act(() => { result.current.printCassetteForBlock('A', '1'); });
    await waitFor(() => expect(printZplViaQzTray).toHaveBeenCalled());
    expect(printZplViaQzTray).toHaveBeenCalledWith('ZEBRA-192.168.12.85', expect.any(String), 1);
  });

  it('printMatrixCassette reaches the real QZ Tray dispatch the same way, for a real matrix block', async () => {
    const caseWithMatrix = makeTestCase({
      matrixBlocks: [{ id: 'MB-1', label: 'M1', participants: [{ specimenId: 'SP-1' }, { specimenId: 'SP-2' }] }],
    } as any);
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData: caseWithMatrix, effectiveStationId: 'station-gross-1' })));
    act(() => { result.current.printMatrixCassette('MB-1'); });
    await waitFor(() => expect(printZplViaQzTray).toHaveBeenCalled());
    expect(printZplViaQzTray).toHaveBeenCalledWith('ZEBRA-192.168.12.85', expect.any(String), 1);
  });

  it('never attempts a printed-label dispatch when no effective station is configured — the engrave-stub path alone still runs', async () => {
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ effectiveStationId: undefined })));
    act(() => { result.current.printCassetteForBlock('A', '1'); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(printZplViaQzTray).not.toHaveBeenCalled();
  });

  it('never attempts a printed-label dispatch at a real station that does not support printing', async () => {
    // 'station-gross-2' is a real, seeded station with supportsPrinting: false.
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ effectiveStationId: 'station-gross-2' })));
    act(() => { result.current.printCassetteForBlock('A', '1'); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(printZplViaQzTray).not.toHaveBeenCalled();
  });

  it('shows a real, honest toast (never a silent failure) when the real QZ Tray dispatch itself fails', async () => {
    vi.mocked(printZplViaQzTray).mockResolvedValue({ ok: false, message: 'Printer jammed' } as any);
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ showToast, effectiveStationId: 'station-gross-1' })));
    act(() => { result.current.printCassetteForBlock('A', '1'); });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Printer jammed'), 'warning'));
  });
});

describe('useSpecimenBlockManagement — handleCancelBlock', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  function makeCancelCase() {
    return makeTestCase({
      specimens: [{
        id: 'SP-1', label: 'A', description: 'Spec A',
        blocks: [{
          id: 'BLK-1', label: '1', status: 'Grossed', sharedCassetteId: 'MB1', positionInBlock: 2,
          stains: [
            { id: 'STN-1', stainName: 'H&E', status: 'Pending Cut' },
            { id: 'STN-2', stainName: 'ER', status: 'Coverslipped' },
          ],
        }],
      }] as any,
    });
  }

  it('does nothing without a real, non-empty reason', async () => {
    const setCaseData = vi.fn();
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', '   '); });

    expect(setCaseData).not.toHaveBeenCalled();
  });

  it('records who, when, and why — grounded in CAP ANP.11600 / CLIA 493.1105 / ISO 15189:2012 5.8', async () => {
    const setCaseData = vi.fn();
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', 'Wrong specimen assigned to this block'); });

    // handleCancelBlock calls setCaseData with the React function-updater
    // form (prev => ...), not a plain value — apply it manually the same
    // way React would, rather than reading the raw function argument.
    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    const block = updatedCase.specimens[0].blocks[0];
    expect(block.status).toBe('Cancelled');
    expect(block.cancelReason).toBe('Wrong specimen assigned to this block');
    expect(block.cancelledBy).toBe(testSigningUser.id);
    expect(block.cancelledAt).toBeTruthy();
  });

  it('keeps the block record — cancellation is a real status, never deletion', async () => {
    const setCaseData = vi.fn();
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', 'Duplicate block created in error'); });

    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    expect(updatedCase.specimens[0].blocks).toHaveLength(1);
    expect(updatedCase.specimens[0].blocks[0].id).toBe('BLK-1');
  });

  it('clears Biopsy Array membership — a cancelled block no longer occupies a real position', async () => {
    const setCaseData = vi.fn();
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', 'Wrong block for this tissue'); });

    const block = setCaseData.mock.calls[0][0](caseData).specimens[0].blocks[0];
    expect(block.sharedCassetteId).toBeUndefined();
    expect(block.positionInBlock).toBeUndefined();
  });

  it('cascade-cancels non-terminal stain orders but leaves completed ones alone — the real record of what was prevented', async () => {
    const setCaseData = vi.fn();
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', 'Insufficient tissue for this block'); });

    const stains = setCaseData.mock.calls[0][0](caseData).specimens[0].blocks[0].stains;
    const pendingHE = stains.find((s: any) => s.id === 'STN-1');
    const completedER = stains.find((s: any) => s.id === 'STN-2');
    expect(pendingHE.status).toBe('Cancelled'); // was 'Pending Cut' — real work prevented
    expect(completedER.status).toBe('Coverslipped'); // already finished — not retroactively undone
  });

  it('sends a real LIS cancel order — if declined, nothing is recorded', async () => {
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: false });
    const caseData = makeCancelCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData, showToast, sendMaterialOrderToLis })));

    await act(async () => { await result.current.handleCancelBlock('SP-1', 'BLK-1', 'Wrong stain ordered'); });

    expect(sendMaterialOrderToLis).toHaveBeenCalledWith({ kind: 'cancel', specimenId: 'SP-1', label: '1' });
    expect(setCaseData).not.toHaveBeenCalled();
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('did not acknowledge'), 'warning');
  });
});

describe('useSpecimenBlockManagement — handleCreateSpareSlide', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('creates a real spare with stainName UNSTAINED_LABEL and status "Cut & Placed" — the cutting already happened, only the stain hasn\'t', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCreateSpareSlide('SP-1', 'BLK-1'); });

    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    const sp1Block = updatedCase.specimens.find((s: any) => s.id === 'SP-1').blocks.find((b: any) => b.id === 'BLK-1');
    const newSpare = sp1Block.stains[sp1Block.stains.length - 1];
    expect(newSpare.stainName).toBe('Unstained');
    expect(newSpare.status).toBe('Cut & Placed');
  });

  it('sends no LIS order — the tissue was already physically cut, nothing new happens in the physical world yet', async () => {
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ sendMaterialOrderToLis })));

    await act(async () => { await result.current.handleCreateSpareSlide('SP-1', 'BLK-1'); });

    expect(sendMaterialOrderToLis).not.toHaveBeenCalled();
  });

  it('keeps every existing stain on the block untouched', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleCreateSpareSlide('SP-1', 'BLK-1'); });

    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    const sp1Block = updatedCase.specimens.find((s: any) => s.id === 'SP-1').blocks.find((b: any) => b.id === 'BLK-1');
    expect(sp1Block.stains).toHaveLength(1); // the new spare, added to whatever was already there (none, in the default fixture)
  });
});

describe('useSpecimenBlockManagement — handleOrderRestain', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  function makeRestainCase() {
    return makeTestCase({
      specimens: [{
        id: 'SP-1', label: 'A', description: 'Spec A',
        blocks: [{
          id: 'BLK-1', label: '1', status: 'Grossed',
          stains: [
            { id: 'STN-HE', stainName: 'H&E', status: 'Coverslipped' },
            { id: 'STN-SPARE', stainName: 'Unstained', status: 'Cut & Placed' },
          ],
        }],
      }] as any,
    });
  }

  it('converts an Unstained spare in place — same slide id, moves straight to "Staining" since it was already cut and placed', async () => {
    const setCaseData = vi.fn();
    const caseData = makeRestainCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => {
      await result.current.handleOrderRestain('SP-1', 'BLK-1', { targetSlideId: 'STN-SPARE', stainName: 'ER', reason: 'Weak stain' });
    });

    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    const stains = updatedCase.specimens[0].blocks[0].stains;
    expect(stains).toHaveLength(2); // no new slide — the spare converted, not a third one added
    const converted = stains.find((s: any) => s.id === 'STN-SPARE');
    expect(converted.stainName).toBe('ER');
    expect(converted.status).toBe('Staining');
    expect(converted.restainReason).toBe('Weak stain');
    expect(converted.restainOrderedBy).toBe(testSigningUser.id);
    expect(converted.restainOrderedAt).toBeTruthy();
  });

  it('never converts an already-stained slide — creates a genuinely new one instead, original completely untouched', async () => {
    const setCaseData = vi.fn();
    const caseData = makeRestainCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => {
      await result.current.handleOrderRestain('SP-1', 'BLK-1', { targetSlideId: 'STN-HE', stainName: 'H&E', reason: 'Artifact' });
    });

    const updatedCase = setCaseData.mock.calls[0][0](caseData);
    const stains = updatedCase.specimens[0].blocks[0].stains;
    expect(stains).toHaveLength(3); // a real, new third slide
    const original = stains.find((s: any) => s.id === 'STN-HE');
    expect(original.status).toBe('Coverslipped'); // completely untouched
    expect(original.restainReason).toBeUndefined();
    const newRestain = stains.find((s: any) => s.restainOfSlideId === 'STN-HE');
    expect(newRestain).toBeDefined();
    expect(newRestain.stainName).toBe('H&E');
    expect(newRestain.status).toBe('Pending Cut'); // a real new cut, not yet placed
    expect(newRestain.restainReason).toBe('Artifact');
  });

  it('does nothing without a real stain name or a real reason', async () => {
    const setCaseData = vi.fn();
    const caseData = makeRestainCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => {
      await result.current.handleOrderRestain('SP-1', 'BLK-1', { targetSlideId: 'STN-SPARE', stainName: '  ', reason: 'Weak stain' });
    });
    await act(async () => {
      await result.current.handleOrderRestain('SP-1', 'BLK-1', { targetSlideId: 'STN-SPARE', stainName: 'ER', reason: '  ' });
    });

    expect(setCaseData).not.toHaveBeenCalled();
  });

  it('sends a real LIS restain order — if declined, nothing is recorded', async () => {
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: false });
    const caseData = makeRestainCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData, showToast, sendMaterialOrderToLis })));

    await act(async () => {
      await result.current.handleOrderRestain('SP-1', 'BLK-1', { targetSlideId: 'STN-SPARE', stainName: 'ER', reason: 'Weak stain' });
    });

    expect(sendMaterialOrderToLis).toHaveBeenCalledWith({ kind: 'restain', specimenId: 'SP-1', label: '1: ER' });
    expect(setCaseData).not.toHaveBeenCalled();
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('did not acknowledge'), 'warning');
  });
});

describe('useSpecimenBlockManagement — handleCreateBiopsyArray', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('does nothing with fewer than 2 specimens — a Biopsy Array is inherently a multi-specimen concept', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => { await result.current.handleCreateBiopsyArray(['SP-1'], 'C3'); });

    expect(setCaseData).not.toHaveBeenCalled();
  });

  it('creates exactly one real MatrixBlock on Case.matrixBlocks, with a real participant entry per selected specimen', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => { await result.current.handleCreateBiopsyArray(['SP-1', 'SP-2'], 'C3'); });

    const updatedCase = setCaseData.mock.calls[0][0];
    expect(updatedCase.matrixBlocks).toHaveLength(1);
    const matrixBlock = updatedCase.matrixBlocks[0];
    expect(matrixBlock.label).toBe('C3');
    expect(matrixBlock.status).toBe('Grossed');
    expect(matrixBlock.participants).toHaveLength(2);
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-1').positionInBlock).toBe(1);
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-2').positionInBlock).toBe(2);
    // Real feature, per direct confirmation: every new matrix block
    // defaults to a real, pending H&E stain order, same as an
    // ordinary block.
    expect(matrixBlock.slides).toHaveLength(1);
    expect(matrixBlock.slides[0].stainName).toBe('H&E');
    expect(matrixBlock.slides[0].status).toBe('Pending Cut');

    // Each participating specimen gets a real, lightweight reference
    // — never its own competing copy of the block's own state.
    const sp1 = updatedCase.specimens.find((s: any) => s.id === 'SP-1');
    const sp2 = updatedCase.specimens.find((s: any) => s.id === 'SP-2');
    expect(sp1.matrixBlockIds).toEqual([matrixBlock.id]);
    expect(sp2.matrixBlockIds).toEqual([matrixBlock.id]);
    // Each specimen's own, ordinary blocks are completely untouched.
    expect(sp1.blocks).toHaveLength(2);
    expect(sp2.blocks).toHaveLength(1);
  });

  it('position order matches the order specimens were passed in, not specimen array order', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    // SP-2 passed first, SP-1 second — reversed from caseData.specimens order
    await act(async () => { await result.current.handleCreateBiopsyArray(['SP-2', 'SP-1'], 'C3'); });

    const matrixBlock = setCaseData.mock.calls[0][0].matrixBlocks[0];
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-2').positionInBlock).toBe(1);
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-1').positionInBlock).toBe(2);
  });

  it('sends one real LIS order per specimen, all referencing the same cassette label', async () => {
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ sendMaterialOrderToLis })));

    await act(async () => { await result.current.handleCreateBiopsyArray(['SP-1', 'SP-2'], 'C3'); });

    expect(sendMaterialOrderToLis).toHaveBeenCalledTimes(2);
    expect(sendMaterialOrderToLis).toHaveBeenCalledWith({ kind: 'block_recut', specimenId: 'SP-1', label: 'C3' });
    expect(sendMaterialOrderToLis).toHaveBeenCalledWith({ kind: 'block_recut', specimenId: 'SP-2', label: 'C3' });
  });

  it('requires every specimen\'s LIS order to be acknowledged — if any one is declined, nothing is added and no persistence happens', async () => {
    const sendMaterialOrderToLis = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ sendMaterialOrderToLis, setCaseData, showToast })));

    await act(async () => { await result.current.handleCreateBiopsyArray(['SP-1', 'SP-2'], 'C3'); });

    expect(setCaseData).not.toHaveBeenCalled();
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('did not acknowledge'), 'warning');
  });
});

describe('useSpecimenBlockManagement — handleUpdateBiopsyArray', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  // Real, architectural fix, per direct follow-up: the real matrix
  // block lives on Case.matrixBlocks — 'MB1' is its real, internal,
  // stable id; 'C3' is its separate, human-facing label (what the PA
  // actually typed). Every real participant holds only a lightweight
  // matrixBlockIds reference — never its own competing copy of the
  // block's own status/participants.
  function makeArrayCase() {
    return makeTestCase({
      specimens: [
        { id: 'SP-1', label: 'A', description: 'Spec A', blocks: [], matrixBlockIds: ['MB1'] },
        { id: 'SP-2', label: 'B', description: 'Spec B', blocks: [], matrixBlockIds: ['MB1'] },
        { id: 'SP-3', label: 'C', description: 'Spec C', blocks: [], matrixBlockIds: ['MB1'] },
        { id: 'SP-4', label: 'D', description: 'Spec D', blocks: [] },
      ] as any,
      matrixBlocks: [{
        id: 'MB1', label: 'C3', status: 'Grossed',
        participants: [
          { specimenId: 'SP-1', positionInBlock: 1 },
          { specimenId: 'SP-2', positionInBlock: 2 },
          { specimenId: 'SP-3', positionInBlock: 3 },
        ],
        slides: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'PATH-001',
      }] as any,
    });
  }

  it('removes a specimen from the real matrix block\'s own participants, and gives that specimen a real, new, ordinary block of its own', async () => {
    const setCaseData = vi.fn();
    const caseData = makeArrayCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    // Remove SP-2 (B) — new selection is just SP-1, SP-3
    await act(async () => { await result.current.handleUpdateBiopsyArray('MB1', ['SP-1', 'SP-3']); });

    const updatedCase = setCaseData.mock.calls[0][0];
    const matrixBlock = updatedCase.matrixBlocks.find((m: any) => m.id === 'MB1');
    expect(matrixBlock.participants.map((p: any) => p.specimenId)).toEqual(['SP-1', 'SP-3']);

    const sp2 = updatedCase.specimens.find((s: any) => s.id === 'SP-2');
    expect(sp2.matrixBlockIds).toEqual([]);
    // Real, new, ordinary block — nothing about the physical tissue
    // changed, it just needs a real block of its own now.
    expect(sp2.blocks).toHaveLength(1);
    expect(sp2.blocks[0].status).toBe('Grossed'); // inherited from the matrix block's own status
  });

  it('adds a newly-selected specimen as a real participant, sending a real LIS order', async () => {
    const setCaseData = vi.fn();
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: true });
    const caseData = makeArrayCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData, sendMaterialOrderToLis })));

    // Add SP-4 (D) — new selection is SP-1, SP-2, SP-3, SP-4
    await act(async () => { await result.current.handleUpdateBiopsyArray('MB1', ['SP-1', 'SP-2', 'SP-3', 'SP-4']); });

    expect(sendMaterialOrderToLis).toHaveBeenCalledTimes(1);
    expect(sendMaterialOrderToLis).toHaveBeenCalledWith({ kind: 'block_recut', specimenId: 'SP-4', label: 'C3' });

    const updatedCase = setCaseData.mock.calls[0][0];
    const matrixBlock = updatedCase.matrixBlocks.find((m: any) => m.id === 'MB1');
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-4').positionInBlock).toBe(4);
    const sp4 = updatedCase.specimens.find((s: any) => s.id === 'SP-4');
    expect(sp4.matrixBlockIds).toEqual(['MB1']);
  });

  it('renumbers remaining participants to match the new position order when the order changes', async () => {
    const setCaseData = vi.fn();
    const caseData = makeArrayCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    // Remove B (was position 2) — A and C should renumber to 1, 2
    await act(async () => { await result.current.handleUpdateBiopsyArray('MB1', ['SP-1', 'SP-3']); });

    const matrixBlock = setCaseData.mock.calls[0][0].matrixBlocks.find((m: any) => m.id === 'MB1');
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-1').positionInBlock).toBe(1);
    expect(matrixBlock.participants.find((p: any) => p.specimenId === 'SP-3').positionInBlock).toBe(2); // renumbered from 3 to 2
  });

  it('dissolves the whole array instead when the new selection drops below 2 specimens', async () => {
    const setCaseData = vi.fn();
    const caseData = makeArrayCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleUpdateBiopsyArray('MB1', ['SP-1']); });

    const updatedCase = setCaseData.mock.calls[0][0];
    // The real matrix block record is gone entirely.
    expect(updatedCase.matrixBlocks).toHaveLength(0);
    // Every real, former participant now has a real, new, ordinary
    // block of its own, and no longer references the dissolved id.
    for (const id of ['SP-1', 'SP-2', 'SP-3']) {
      const sp = updatedCase.specimens.find((s: any) => s.id === id);
      expect(sp.matrixBlockIds).toEqual([]);
      expect(sp.blocks).toHaveLength(1);
    }
  });

  it('requires the newly-added specimen\'s LIS order to be acknowledged — if declined, nothing is added and no persistence happens', async () => {
    const setCaseData = vi.fn();
    const showToast = vi.fn();
    const sendMaterialOrderToLis = vi.fn().mockResolvedValue({ ok: false });
    const caseData = makeArrayCase();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData, showToast, sendMaterialOrderToLis })));

    await act(async () => { await result.current.handleUpdateBiopsyArray('MB1', ['SP-1', 'SP-2', 'SP-3', 'SP-4']); });

    expect(setCaseData).not.toHaveBeenCalled();
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    expect(caseRouter.updateCase).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('did not acknowledge'), 'warning');
  });
});

describe('useSpecimenBlockManagement — handleDissolveBiopsyArray', () => {
  beforeEach(async () => {
    const { caseRouter } = await import('@/services/cases/CaseRouter');
    vi.mocked(caseRouter.updateCase).mockReset().mockResolvedValue(undefined);
  });

  it('removes the real matrix block record and gives every former participant a real, new, ordinary block of its own', async () => {
    const setCaseData = vi.fn();
    const caseData = makeTestCase({
      specimens: [
        { id: 'SP-1', label: 'A', description: 'Spec A', blocks: [], matrixBlockIds: ['MB1'] },
        { id: 'SP-2', label: 'B', description: 'Spec B', blocks: [], matrixBlockIds: ['MB1'] },
      ] as any,
      matrixBlocks: [{
        id: 'MB1', label: 'C3', status: 'Grossed',
        participants: [
          { specimenId: 'SP-1', positionInBlock: 1 },
          { specimenId: 'SP-2', positionInBlock: 2 },
        ],
        slides: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'PATH-001',
      }] as any,
    });
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ caseData, setCaseData })));

    await act(async () => { await result.current.handleDissolveBiopsyArray('MB1'); });

    const updatedCase = setCaseData.mock.calls[0][0];
    expect(updatedCase.matrixBlocks).toHaveLength(0);
    for (const sp of updatedCase.specimens) {
      expect(sp.matrixBlockIds).toEqual([]);
      expect(sp.blocks).toHaveLength(1);
    }
  });

  it('does nothing when no matrix block exists with the given id', async () => {
    const setCaseData = vi.fn();
    const { result } = renderHook(() => useSpecimenBlockManagement(baseParams({ setCaseData })));

    await act(async () => { await result.current.handleDissolveBiopsyArray('NONEXISTENT'); });

    expect(setCaseData).not.toHaveBeenCalled();
  });
});

describe('useSpecimenBlockManagement — integration test (real mock case data, unmocked caseRouter)', () => {
  it('handleUpdateBlock genuinely persists through the real caseRouter against actual mock case data', async () => {
    vi.doUnmock('@/services/cases/CaseRouter');
    vi.resetModules();
    const { useSpecimenBlockManagement: freshHook } = await import('../useSpecimenBlockManagement');
    const { mockCaseService } = await import('@/services/cases/mockCaseService');

    const before = await mockCaseService.getCase('S26-4402-COLON-RES');
    expect(before).toBeDefined();
    if (!before) return;

    const setCaseData = vi.fn();
    // knownVersionRef.current left as undefined deliberately — passing no
    // expectedVersion to caseRouter.updateCase skips the version check
    // entirely (confirmed in mockCaseService.updateCase's own
    // implementation), so this test doesn't need to know or guess the
    // real current version to avoid a self-inflicted conflict.
    const { result } = renderHook(() => freshHook({
      caseData: before, setCaseData, signingUser: testSigningUser,
      markDirty: vi.fn(), knownVersionRef: { current: undefined as any },
      setConcurrencyConflict: vi.fn(), sendMaterialOrderToLis: vi.fn().mockResolvedValue({ ok: true }),
      showToast: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleUpdateBlock('S26-4402-SP-1', 'blk-4402-a3', { status: 'Exhausted' });
    });

    const after = await mockCaseService.getCase('S26-4402-COLON-RES');
    expect(after).toBeDefined();
    const block = (after!.specimens as any[]).find(s => s.id === 'S26-4402-SP-1').blocks.find((b: any) => b.id === 'blk-4402-a3');
    expect(block.status).toBe('Exhausted');

    // Restore the mock case's original state so this test doesn't leave
    // shared mock data permanently mutated for other tests / manual runs.
    await mockCaseService.updateCase('S26-4402-COLON-RES', { specimens: before.specimens } as any);
  });
});
