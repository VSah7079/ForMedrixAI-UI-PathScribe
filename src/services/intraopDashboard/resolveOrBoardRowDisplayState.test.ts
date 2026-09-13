import { describe, it, expect } from 'vitest';
import { resolveOrBoardRowDisplayState } from './resolveOrBoardRowDisplayState';
import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';

const baseReq = (over: Partial<ActiveIntraopRequest>): ActiveIntraopRequest => ({
  sessionId: 's1', locationId: 'loc-1', patientName: 'Jane Roe', mrn: 'MRN-1', surgeon: 'Dr. Patel',
  orNumber: 'OR-1', specimenId: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-01-01T00:00:00.000Z',
  pathologistName: 'Dr. Kim', diagnosisRendered: false, currentWorkflowStep: 'Grossing',
  dismissed: false, tat: { status: 'normal', elapsedMinutes: 0, remainingMinutes: 20 } as any,
  ...over,
});

describe('resolveOrBoardRowDisplayState', () => {
  it('a real, in-progress row is never flagged completed or flashing', () => {
    const result = resolveOrBoardRowDisplayState(baseReq({}), '2026-01-01T00:05:00.000Z', false, false);
    expect(result.isCompleted).toBe(false);
    expect(result.isFlashing).toBe(false);
    expect(result.rowClass).toContain('ps-orboard-row--normal');
  });

  it('the real elapsed display counts up to "now" for an in-progress row, per the real live-timer requirement', () => {
    const result = resolveOrBoardRowDisplayState(baseReq({}), '2026-01-01T00:05:30.000Z', false, false);
    expect(result.elapsedDisplay).toBe('5:30');
  });

  it('a real, newly-completed row (never flashed before) is flagged to flash exactly once', () => {
    const result = resolveOrBoardRowDisplayState(
      baseReq({ diagnosisRendered: true, frozenDiagnosisRenderedAt: '2026-01-01T00:18:00.000Z' }), '2026-01-01T00:20:00.000Z', false, false,
    );
    expect(result.isCompleted).toBe(true);
    expect(result.isFlashing).toBe(true);
    expect(result.rowClass).toContain('ps-orboard-row--flashing');
  });

  it('a real, already-flashed completed row never flashes again on a later poll', () => {
    const result = resolveOrBoardRowDisplayState(
      baseReq({ diagnosisRendered: true, frozenDiagnosisRenderedAt: '2026-01-01T00:18:00.000Z' }), '2026-01-01T00:25:00.000Z', true, false,
    );
    expect(result.isFlashing).toBe(false);
  });

  it('a real, completed row\'s elapsed display freezes at the real sign-off moment, never keeps counting past it', () => {
    const result = resolveOrBoardRowDisplayState(
      baseReq({ diagnosisRendered: true, frozenDiagnosisRenderedAt: '2026-01-01T00:18:05.000Z' }), '2026-01-01T00:45:00.000Z', true, false,
    );
    expect(result.elapsedDisplay).toBe('18:05'); // frozen at sign-off, not the real 45-minute "now"
  });

  it('a real, dismissing row carries the real dismissing class for its exit animation', () => {
    const result = resolveOrBoardRowDisplayState(
      baseReq({ diagnosisRendered: true, frozenDiagnosisRenderedAt: '2026-01-01T00:18:00.000Z' }), '2026-01-01T00:19:00.000Z', true, true,
    );
    expect(result.rowClass).toContain('ps-orboard-row--dismissing');
  });

  it('a real overdue row\'s class reflects its real TAT status', () => {
    const result = resolveOrBoardRowDisplayState(baseReq({ tat: { status: 'overdue', elapsedMinutes: 25, remainingMinutes: -5 } as any }), '2026-01-01T00:25:00.000Z', false, false);
    expect(result.rowClass).toContain('ps-orboard-row--overdue');
  });
});
