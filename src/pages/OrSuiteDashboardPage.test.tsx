// @vitest-environment happy-dom
//
// src/pages/OrSuiteDashboardPage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, closing the noted gap from the dismissal workflow build: no
// page-level render test existed for OrSuiteDashboardPage.tsx itself
// — only the resolver and service methods underneath it were tested.
//
// Same real mocking conventions as GrossingScreenPage.test.tsx: mocks
// react-i18next's useTranslation to return the raw key (+ interpolation
// values), mocks every service/hook the page imports, and uses fake
// timers pinned to a fixed real Date so the MM:SS timer display and
// the 15/20-minute TAT thresholds are deterministic, never flaky
// against real wall-clock time.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

const { setTerminalId } = vi.hoisted(() => ({ setTerminalId: vi.fn() }));
vi.mock('@/hooks/useCurrentOrTerminal', () => ({
  useCurrentOrTerminal: () => ({ terminalId: 'term-1', setTerminalId }),
}));

const { getById: terminalGetById, getActive: terminalGetActive } = vi.hoisted(() => ({ getById: vi.fn(), getActive: vi.fn() }));

const { record } = vi.hoisted(() => ({ record: vi.fn() }));

const { resolveStaffByQuickAuthPin } = vi.hoisted(() => ({ resolveStaffByQuickAuthPin: vi.fn() }));
vi.mock('@/services/intraopDashboard/resolveStaffByQuickAuthPin', () => ({ resolveStaffByQuickAuthPin }));

const { intraopGetAll, dismissFromBoard, seedOrBoardDemoData, advanceDemoSpecimen, locationGetById, locationListForFacility } = vi.hoisted(() => ({
  intraopGetAll: vi.fn(), dismissFromBoard: vi.fn(), seedOrBoardDemoData: vi.fn(), advanceDemoSpecimen: vi.fn(),
  locationGetById: vi.fn(), locationListForFacility: vi.fn(),
}));
// PS-262: the page reaches the terminal and event-log services through
// '@/services' now, and subscribes to live updates there too. The fake
// live service records subscriptions so the tests can push an event.
const { liveSubscribers } = vi.hoisted(() => ({ liveSubscribers: [] as { scope: unknown; onEvent: (e: unknown) => void }[] }));
vi.mock('@/services', () => ({
  intraoperativeService: { getAll: intraopGetAll, dismissFromBoard, seedOrBoardDemoData, advanceDemoSpecimen },
  locationService: { getById: locationGetById, listForFacility: locationListForFacility },
  orSuiteTerminalService: { getById: terminalGetById, getActive: terminalGetActive },
  orEventLogService: { record },
  liveUpdateService: {
    transport: 'local',
    subscribeIntraop: (scope: unknown, onEvent: (e: unknown) => void) => {
      const s = { scope, onEvent };
      liveSubscribers.push(s);
      return { unsubscribe: () => { liveSubscribers.splice(liveSubscribers.indexOf(s), 1); } };
    },
    getState: () => 'local',
    onStateChange: () => () => {},
    onResync: () => () => {},
  },
}));

const TERMINAL = { id: 'term-1', name: 'OR-04 Wall Display', locationId: 'loc-1', facilityId: 'fac-1', canViewMultiSuite: false, active: true };
const LOCATION = { id: 'loc-1', pointOfCare: 'Main OR', room: '4', facilityId: 'fac-1' };
const NOW = new Date('2026-09-10T12:00:00.000Z');

const inProgressEntry = () => ({
  id: 'intraop-1', locationId: 'loc-1', locationDisplay: 'OR-04', orNumber: 'OR-1234',
  patientMatch: { source: 'barcode', patientName: 'Jane Roe', mrn: 'MRN-555' },
  performedBy: { userId: 'path-1', userName: 'Dr. Kim' }, surgeon: 'Dr. Patel',
  specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-10T11:50:00.000Z', milestones: [] }],
  status: 'pending', createdAt: '2026-09-10T11:50:00.000Z',
});

const completedEntry = () => ({
  ...inProgressEntry(),
  specimens: [{
    id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-10T11:50:00.000Z', milestones: [{ milestone: 'frozen_section_cut' }],
    frozenSectionDiagnosis: 'Invasive carcinoma, margins negative', frozenDiagnosisRenderedAt: '2026-09-10T11:58:00.000Z',
  }],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  terminalGetById.mockResolvedValue({ ok: true, data: TERMINAL });
  terminalGetActive.mockResolvedValue({ ok: true, data: [TERMINAL] });
  locationGetById.mockResolvedValue({ ok: true, data: LOCATION });
  locationListForFacility.mockResolvedValue({ ok: true, data: [LOCATION] });
  record.mockResolvedValue({ ok: true, data: {} });
  // Real bug, confirmed directly by a real vitest run: the demo
  // interval (DEMO_ADVANCE_INTERVAL_MS) can genuinely fire during any
  // test using fake timers once "Start demo" has been clicked, not
  // just the one test that explicitly exercises it — an unmocked call
  // resolves to undefined, and advanceRes.ok throws. A real, honest
  // default here (already fully progressed, nothing left to advance)
  // means every test gets a real, defined response regardless of
  // whether it specifically cares about this call.
  advanceDemoSpecimen.mockResolvedValue({ ok: true, data: { entry: {}, advanced: false } });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

async function renderBoard(entry: unknown) {
  intraopGetAll.mockResolvedValue({ ok: true, data: [entry] });
  const { default: OrSuiteDashboardPage } = await import('./OrSuiteDashboardPage');
  const utils = render(<OrSuiteDashboardPage />);
  await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  return utils;
}

describe('OrSuiteDashboardPage — real render smoke test', () => {
  it('an in-progress specimen shows its real workflow step and a disabled "In progress" button', async () => {
    await renderBoard(inProgressEntry());
    expect(screen.getByText('Jane Roe')).not.toBeNull();
    // Real i18n-sweep fix: resolveCurrentWorkflowStep() now returns a
    // stable key ('grossing') instead of the display string ("Grossing")
    // directly, translated via OrBoardRow.tsx's own WORKFLOW_STEP_LABEL_KEY
    // map — this file's react-i18next mock returns the raw key, so the
    // rendered text is the key, not the old English literal.
    expect(screen.getByText('orSuiteDashboard.workflowStep.grossing')).not.toBeNull();
    const button = screen.getByText('orSuiteDashboard.inProgress').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('a completed specimen shows the real preliminary diagnosis and a "Dismiss case" button', async () => {
    await renderBoard(completedEntry());
    expect(screen.getByText(/orSuiteDashboard\.preliminaryLabel/)).not.toBeNull();
    expect(screen.getByText('orSuiteDashboard.dismissCase')).not.toBeNull();
  });

  it('the full dismiss flow: PIN → safety re-display → checkbox gates Confirm → calls dismissFromBoard with the real values', async () => {
    resolveStaffByQuickAuthPin.mockResolvedValue({ outcome: 'authenticated', staff: { id: 'staff-1', firstName: 'Sarah', lastName: 'Jenkins' } });
    dismissFromBoard.mockResolvedValue({ ok: true, data: {} });
    await renderBoard(completedEntry());

    fireEvent.click(screen.getByText('orSuiteDashboard.dismissCase'));
    const pinInput = document.querySelector('.ps-orboard-pin-input') as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: '1234' } });
    fireEvent.click(screen.getByText('orSuiteDashboard.continue'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    // Real safety re-display — patient/MRN/diagnosis shown again before
    // commit. Scoped to the modal's own safety-redisplay container —
    // the underlying board row is still in the DOM behind the real
    // dismiss-pending overlay (a real app behavior, not a bug), so an
    // unscoped query for the patient's name genuinely matches twice.
    const safetyRedisplay = document.querySelector('.ps-orboard-safety-redisplay') as HTMLElement;
    expect(within(safetyRedisplay).getByText('Jane Roe')).not.toBeNull();
    expect(screen.getByText('MRN-555')).not.toBeNull();
    expect(screen.getByText('Invasive carcinoma, margins negative')).not.toBeNull();

    const confirmBtn = screen.getByText('orSuiteDashboard.confirmAndDismiss').closest('button')!;
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    const checkbox = document.querySelector('.ps-orboard-readback-checkbox input') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(confirmBtn);
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    expect(dismissFromBoard).toHaveBeenCalledWith('intraop-1', 'sp-1', 'staff-1', 'Sarah Jenkins', true);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'case_dismissed', surgeonReadbackConfirmed: true }));
  });

  it('an invalid PIN shows a real error and never reaches the confirmation step', async () => {
    resolveStaffByQuickAuthPin.mockResolvedValue({ outcome: 'not-found' });
    await renderBoard(completedEntry());

    fireEvent.click(screen.getByText('orSuiteDashboard.dismissCase'));
    const pinInput = document.querySelector('.ps-orboard-pin-input') as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: '0000' } });
    fireEvent.click(screen.getByText('orSuiteDashboard.continue'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    expect(screen.getByText('orSuiteDashboard.pinNotRecognized')).not.toBeNull();
    expect(screen.queryByText('orSuiteDashboard.confirmAndDismiss')).toBeNull();
    expect(dismissFromBoard).not.toHaveBeenCalled();
  });

  it('starting the demo seeds real demo data and flips the button to "Stop demo" with the demo badge visible', async () => {
    const demoSession = { id: 'demo-orboard-0', specimens: [{ id: 'demo-orboard-0-sp' }] };
    seedOrBoardDemoData.mockResolvedValue({ ok: true, data: [demoSession, demoSession, demoSession, demoSession] });
    await renderBoard(inProgressEntry());

    fireEvent.click(screen.getByText('orSuiteDashboard.startDemo'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });

    expect(seedOrBoardDemoData).toHaveBeenCalledWith('loc-1', 'fac-1', 'DEMO');
    expect(screen.getByText('orSuiteDashboard.demoModeActive')).not.toBeNull();
    expect(screen.getByText('orSuiteDashboard.stopDemo')).not.toBeNull();

    fireEvent.click(screen.getByText('orSuiteDashboard.stopDemo'));
    expect(screen.queryByText('orSuiteDashboard.demoModeActive')).toBeNull();
  });
});

describe('OrSuiteDashboardPage — live updates (PS-262)', () => {
  it("subscribes for the terminal's own location, shows the connection badge, and re-reads the board when a change arrives", async () => {
    await renderBoard(inProgressEntry());
    expect(liveSubscribers.map(s => s.scope)).toEqual([{ locationIds: ['loc-1'], all: false }]);
    expect(screen.getByText('liveUpdates.status.local')).not.toBeNull();
    expect(screen.queryByText('orSuiteDashboard.dismissCase')).toBeNull();

    // Another device renders the diagnosis: the hub (here the fake) says so.
    intraopGetAll.mockResolvedValue({ ok: true, data: [completedEntry()] });
    await act(async () => {
      liveSubscribers[0].onEvent({ v: 1, eventId: 'e1', kind: 'diagnosis.rendered', sessionId: 'intraop-1', specimenId: 'sp-1', locationId: 'loc-1', occurredAt: NOW.toISOString() });
      await vi.advanceTimersByTimeAsync(150); // the 100 ms coalescing window
    });
    expect(screen.getByText('orSuiteDashboard.dismissCase')).not.toBeNull();
  });

  it('a refused dismissal shows the translated message, never the service text', async () => {
    resolveStaffByQuickAuthPin.mockResolvedValue({ outcome: 'authenticated', staff: { id: 'staff-1', firstName: 'Sarah', lastName: 'Jenkins' } });
    dismissFromBoard.mockResolvedValue({ ok: false, error: 'Specimen sp-1 has no rendered diagnosis' });
    await renderBoard(completedEntry());
    fireEvent.click(screen.getByText('orSuiteDashboard.dismissCase'));
    fireEvent.change(document.querySelector('.ps-orboard-pin-input') as HTMLInputElement, { target: { value: '1234' } });
    fireEvent.click(screen.getByText('orSuiteDashboard.continue'));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    fireEvent.click(document.querySelector('.ps-orboard-readback-checkbox input') as HTMLInputElement);
    fireEvent.click(screen.getByText('orSuiteDashboard.confirmAndDismiss').closest('button')!);
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(screen.getByText('orSuiteDashboard.dismissFailedGeneric')).not.toBeNull();
    expect(screen.queryByText(/no rendered diagnosis/)).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});
