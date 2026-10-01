// PS-262 (Batch 342): the OR board decisions moved out of the page.
import { describe, it, expect, vi } from 'vitest';
import { resolveBoardLocationIds, resolveFlashState } from './resolveOrBoardLiveView';
import { dismissFromBoardWithAudit } from './dismissFromBoardWithAudit';
import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';

const terminal = { locationId: 'loc-own', canViewMultiSuite: true };

describe('resolveBoardLocationIds', () => {
  it("shows the terminal's own location unless Multi-Suite is on, allowed and has picks", () => {
    expect(resolveBoardLocationIds({ terminal: null, multiSuiteOn: true, multiSuiteLocationIds: ['x'] })).toEqual([]);
    expect(resolveBoardLocationIds({ terminal, multiSuiteOn: false, multiSuiteLocationIds: ['a'] })).toEqual(['loc-own']);
    expect(resolveBoardLocationIds({ terminal, multiSuiteOn: true, multiSuiteLocationIds: [] })).toEqual(['loc-own']);
    expect(resolveBoardLocationIds({ terminal, multiSuiteOn: true, multiSuiteLocationIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(resolveBoardLocationIds({ terminal: { ...terminal, canViewMultiSuite: false }, multiSuiteOn: true, multiSuiteLocationIds: ['a'] })).toEqual(['loc-own']);
  });
});

describe('resolveFlashState', () => {
  const req = (specimenId: string, diagnosisRendered: boolean) => ({ specimenId, diagnosisRendered }) as ActiveIntraopRequest;
  it('re-arms the flash only for a diagnosis that is new since the last read', () => {
    const { flashed, rendered } = resolveFlashState(new Set(['old']), [req('old', true), req('new', true), req('pending', false)], new Set(['old', 'new']));
    expect([...flashed]).toEqual(['old']);
    expect([...rendered].sort()).toEqual(['new', 'old']);
  });
});

describe('dismissFromBoardWithAudit', () => {
  const request = {
    sessionId: 's1', specimenId: 'sp1', locationId: 'loc-own', orNumber: 'OR-1', locationDisplay: 'OR 4',
    frozenDiagnosisRenderedAt: '2026-09-26T19:58:00Z', frozenSectionDiagnosis: 'Benign.', arrivalTimestamp: '2026-09-26T19:40:00Z',
  } as unknown as ActiveIntraopRequest;
  const staff = { id: 'staff-1', name: 'Sarah Jenkins' };

  it('dismisses, then logs who did it with the read-back and turnaround', async () => {
    const dismissFromBoard = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const record = vi.fn().mockResolvedValue({ ok: true, data: {} });
    expect(await dismissFromBoardWithAudit(request, staff, { intraoperativeService: { dismissFromBoard }, orEventLogService: { record } })).toEqual({ outcome: 'dismissed' });
    expect(dismissFromBoard).toHaveBeenCalledWith('s1', 'sp1', 'staff-1', 'Sarah Jenkins', true);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'case_dismissed', staffUserId: 'staff-1', surgeonReadbackConfirmed: true, finalPreliminaryText: 'Benign.' }));
  });

  it('a refused dismissal is not logged', async () => {
    const record = vi.fn();
    const r = await dismissFromBoardWithAudit(request, staff, { intraoperativeService: { dismissFromBoard: vi.fn().mockResolvedValue({ ok: false, error: 'no diagnosis' }) }, orEventLogService: { record } });
    expect(r).toEqual({ outcome: 'refused', detail: 'no diagnosis' });
    expect(record).not.toHaveBeenCalled();
  });

  it('reports a dismissal whose log write failed instead of ignoring it', async () => {
    const r = await dismissFromBoardWithAudit(request, staff, {
      intraoperativeService: { dismissFromBoard: vi.fn().mockResolvedValue({ ok: true, data: {} }) },
      orEventLogService: { record: vi.fn().mockResolvedValue({ ok: false, error: 'disk full' }) },
    });
    expect(r).toEqual({ outcome: 'dismissedLogFailed', detail: 'disk full' });
  });
});
