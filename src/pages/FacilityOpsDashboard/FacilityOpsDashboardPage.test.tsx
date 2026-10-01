// @vitest-environment happy-dom
//
// src/pages/FacilityOpsDashboard/FacilityOpsDashboardPage.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, closing the noted gap in PS-288's own device registry: a
// DisplayProfile's own deviceToken (admin-recorded, see
// components/Config/System/DisplayProfilesSection.tsx) was captured but
// never once consulted anywhere in this page's own binding flow — any
// browser could bind to any profile purely by picking its friendly name
// from a dropdown. No render test existed for this page's binding step
// at all before this file. This still is NOT real physical hardware
// verification (see this page's own header comment) — it closes the
// specific, concrete gap that the recorded token was never checked
// against anything.
//
// Same real mocking conventions as OrSuiteDashboardPage.test.tsx: mocks
// react-i18next to return the raw key (+ interpolation values), mocks
// every service/hook the page imports. The binding hook itself is
// re-implemented with real React state in the mock (rather than a bare
// vi.fn stub) since this page's own switch between ProfileSetup and the
// bound dashboard genuinely depends on that state changing and causing
// a re-render — a stub returning a fixed value could never exercise that.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}));

vi.mock('@/hooks/useCurrentDisplayProfile', async () => {
  const React = await import('react');
  return {
    useCurrentDisplayProfile: () => {
      const [profileId, setProfileId] = React.useState<string | null>(null);
      return { profileId, setProfileId };
    },
  };
});

const { getActive, getById } = vi.hoisted(() => ({ getActive: vi.fn(), getById: vi.fn() }));
vi.mock('@/services/facilityOpsDashboard/mockDisplayProfileService', () => ({
  mockDisplayProfileService: { getActive, getById },
}));

const { facilityGetAll } = vi.hoisted(() => ({ facilityGetAll: vi.fn() }));
vi.mock('@/services', () => ({
  facilityService: { getAll: facilityGetAll },
}));

vi.mock('./viewRegistry', () => ({
  DASHBOARD_VIEW_REGISTRY: {
    grossing_intake: {
      id: 'grossing_intake',
      titleKey: 'facilityOpsDashboard.views.grossingIntake',
      compute: vi.fn().mockResolvedValue({ asOf: '2026-09-18T00:00:00.000Z', facilityId: 'fac-1', stats: [], queue: [], alerts: [] }),
    },
  },
}));

const TOKEN_PROFILE = {
  id: 'dispprof-1', name: 'Histology Bench 3 — Wall Display', facilityId: 'fac-1',
  assignedViews: ['grossing_intake'], deviceToken: 'AA:BB:CC', status: 'Active', createdAt: '2026-01-01T00:00:00.000Z',
};
const NO_TOKEN_PROFILE = {
  id: 'dispprof-2', name: 'Grossing Bay — Wall Display', facilityId: 'fac-1',
  assignedViews: ['grossing_intake'], status: 'Active', createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  facilityGetAll.mockResolvedValue({ ok: true, data: [{ id: 'fac-1', name: 'Fenwick General' }] });
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderPage() {
  const { default: FacilityOpsDashboardPage } = await import('./FacilityOpsDashboardPage');
  return render(<FacilityOpsDashboardPage />);
}

describe('FacilityOpsDashboardPage — device-token binding gap', () => {
  it('a profile with no deviceToken still binds straight from the dropdown, unchanged', async () => {
    getActive.mockResolvedValue({ ok: true, data: [NO_TOKEN_PROFILE] });
    getById.mockResolvedValue({ ok: true, data: NO_TOKEN_PROFILE });
    await renderPage();
    await act(async () => {});

    const option = await screen.findByText('facilityOpsDashboard.selectProfile');
    fireEvent.change(option.closest('select')!, { target: { value: 'dispprof-2' } });
    await act(async () => {});

    expect(screen.queryByText('facilityOpsDashboard.confirmTokenTitle')).toBeNull();
    expect(getById).toHaveBeenCalledWith('dispprof-2');
  });

  it('a profile with a deviceToken blocks binding until the exact token is typed', async () => {
    getActive.mockResolvedValue({ ok: true, data: [TOKEN_PROFILE] });
    getById.mockResolvedValue({ ok: true, data: TOKEN_PROFILE });
    await renderPage();
    await act(async () => {});

    const option = await screen.findByText('facilityOpsDashboard.selectProfile');
    fireEvent.change(option.closest('select')!, { target: { value: 'dispprof-1' } });
    await act(async () => {});

    expect(screen.getByText('facilityOpsDashboard.confirmTokenTitle')).not.toBeNull();
    expect(getById).not.toHaveBeenCalled();

    const input = document.querySelector('input.ps-opsdash-setup-select') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong-token' } });
    fireEvent.click(screen.getByText('common.confirm'));
    await act(async () => {});

    expect(screen.getByText('facilityOpsDashboard.confirmTokenError')).not.toBeNull();
    expect(getById).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'AA:BB:CC' } });
    fireEvent.click(screen.getByText('common.confirm'));
    await act(async () => {});

    expect(getById).toHaveBeenCalledWith('dispprof-1');
  });

  it('"Back" from the token step returns to the dropdown without binding', async () => {
    getActive.mockResolvedValue({ ok: true, data: [TOKEN_PROFILE] });
    getById.mockResolvedValue({ ok: true, data: TOKEN_PROFILE });
    await renderPage();
    await act(async () => {});

    const option = await screen.findByText('facilityOpsDashboard.selectProfile');
    fireEvent.change(option.closest('select')!, { target: { value: 'dispprof-1' } });
    await act(async () => {});

    fireEvent.click(screen.getByText('common.back'));
    await act(async () => {});

    expect(screen.queryByText('facilityOpsDashboard.confirmTokenTitle')).toBeNull();
    expect(screen.getByText('facilityOpsDashboard.bindDisplayTitle')).not.toBeNull();
    expect(getById).not.toHaveBeenCalled();
  });
});
