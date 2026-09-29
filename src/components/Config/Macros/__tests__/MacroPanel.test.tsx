// @vitest-environment happy-dom
//
// src/components/Config/Macros/__tests__/MacroPanel.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 349 adds PS-126 coverage at the end (administrators see every
// macro grouped by type; Enterprise only for administrators).
//
// Real, new, focused coverage for PS-128's own fix inside MacroPanel.tsx: its
// real, pre-existing `isDirty` (previously known only to its own Save
// button) is now reported into ConfigDirtyGuardContext so ConfigurationPage.tsx
// can actually see it (see ConfigurationPage.test.tsx for the page-level
// guard behavior this feeds). This file does NOT re-cover MacroPanel's own
// CRUD behavior (create/edit/import/delete) — that's pre-existing, unrelated
// to this ticket, and untouched here.
//
// Real i18n import (not a mocked react-i18next), same convention as
// ConfigSearchBar.test.tsx — MacroPanel renders a real <Trans> element in its
// empty state, which needs a real i18next instance behind it, not just a
// stubbed t().
// ─────────────────────────────────────────────────────────────────────────────

import '@/i18n/config';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConfigDirtyGuardContext } from '../../configDirtyGuardContext';
import MacroPanel from '../MacroPanel';

// Batch 349 (PS-126): the role decides what the panel offers, so each test
// can set it. Undefined = an ordinary user.
let sessionRole: string | undefined;
vi.mock('@/services/auth/caseAccessControl', () => ({
  getSessionUser: () => ({ id: 'user-1', role: sessionRole }),
}));

vi.mock('@/utils/performingLabs', () => ({
  getActivePerformingLabs: () => Promise.resolve([]),
}));

vi.mock('@/services/import/wordBuildingBlocksEngine', () => ({
  extractWordBuildingBlocks: vi.fn(),
}));

const getAll = vi.fn().mockResolvedValue({ ok: true, data: [] });
const getUsers = vi.fn().mockResolvedValue({ ok: true, data: [] });
vi.mock('../../../../services', () => ({
  macroService: {
    getAll: (...args: unknown[]) => getAll(...args),
    add: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
  userService: { getAll: (...args: unknown[]) => getUsers(...args) },
}));

// Real stub — the actual rich-text editor isn't what this suite is testing,
// and mounting it for real would drag in its own heavy dependencies for no
// benefit here.
vi.mock('../../../Editor/PathScribeEditor', () => ({
  default: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea aria-label="macro-content-stub" value={content} onChange={e => onChange(e.target.value)} />
  ),
}));

afterEach(() => {
  cleanup(); vi.clearAllMocks(); sessionRole = undefined;
  getAll.mockResolvedValue({ ok: true, data: [] });
  getUsers.mockResolvedValue({ ok: true, data: [] });
});

function renderPanel(setDirty = vi.fn()) {
  render(
    <ConfigDirtyGuardContext.Provider value={{ setDirty }}>
      <MacroPanel approvedFonts={['Arial']} />
    </ConfigDirtyGuardContext.Provider>
  );
  return { setDirty };
}

describe('MacroPanel — PS-128 real dirty-state reporting', () => {
  it('reports clean (false) once the panel has loaded with nothing selected or being created', async () => {
    const { setDirty } = renderPanel();
    await screen.findByRole('button', { name: '+ New' });

    expect(setDirty).toHaveBeenCalledWith(false);
    expect(setDirty).not.toHaveBeenCalledWith(true);
  });

  it('reports dirty (true) the moment "+ New" is clicked — a real, in-progress draft with nothing saved yet', async () => {
    const { setDirty } = renderPanel();
    await screen.findByRole('button', { name: '+ New' });
    setDirty.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '+ New' }));

    await waitFor(() => expect(setDirty).toHaveBeenCalledWith(true));
  });

  it('reports clean again on unmount, so a stale dirty flag never outlives the tab that set it', async () => {
    const setDirty = vi.fn();
    const { unmount } = render(
      <ConfigDirtyGuardContext.Provider value={{ setDirty }}>
        <MacroPanel approvedFonts={['Arial']} />
      </ConfigDirtyGuardContext.Provider>
    );
    await screen.findByRole('button', { name: '+ New' });
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    await waitFor(() => expect(setDirty).toHaveBeenCalledWith(true));

    setDirty.mockClear();
    unmount();

    expect(setDirty).toHaveBeenCalledWith(false);
  });
});

// ── Batch 349 (PS-126) ──────────────────────────────────────────────────────
const macro = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, shortcut: `;${id}`, category: 'Custom', content: `<p>${name}</p>`,
  subspecialtyIds: [], snomedCodes: [], icdCodes: [], createdBy: 'x', status: 'Active', ...over,
});
const MIXED = [
  macro('p2', 'Zed personal', { ownerUserId: 'user-2' }),
  macro('e1', 'Beta enterprise'),
  macro('p1', 'Mine', { ownerUserId: 'user-1' }),
  macro('e0', 'Alpha enterprise'),
];

describe('MacroPanel — PS-126 administrators see every macro, grouped by type', () => {
  it('an administrator opens on "All": Enterprise first, then each user\'s personal macros under the user\'s name', async () => {
    sessionRole = 'superadmin';
    getAll.mockResolvedValue({ ok: true, data: MIXED });
    getUsers.mockResolvedValue({ ok: true, data: [
      { id: 'user-1', firstName: 'Pete', lastName: 'Nimmo' },
      { id: 'user-2', firstName: 'Ann', lastName: 'Lee' },
    ] });
    const { container } = render(<MacroPanel approvedFonts={['Arial']} />);

    await screen.findByText('Personal: Ann Lee');
    const headers = [...container.querySelectorAll('.ps-macro-group-header')].map(h => h.firstChild?.textContent);
    expect(headers).toEqual(['Enterprise', 'Personal: Ann Lee', 'Personal: Pete Nimmo']);
    const names = [...container.querySelectorAll('.ps-macro-list-item-name')].map(n => n.textContent);
    expect(names).toEqual(['Alpha enterprise', 'Beta enterprise', 'Zed personal', 'Mine']);
  });

  it('an administrator may create an Enterprise macro, and it is the first choice', async () => {
    sessionRole = 'admin';
    render(<MacroPanel approvedFonts={['Arial']} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));

    const option = await screen.findByRole('option', { name: 'Enterprise (every facility)' }) as HTMLOptionElement;
    expect(option.disabled).toBe(false);
  });

  it('an ordinary user gets no "All" tab and cannot choose Enterprise when creating', async () => {
    render(<MacroPanel approvedFonts={['Arial']} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New' }));

    expect(screen.queryByRole('button', { name: /^All/ })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Enterprise (every facility)' })).toBeNull();
    expect(getUsers).not.toHaveBeenCalled();
  });

  it('an ordinary user sees an Enterprise macro read only: a note, no Delete, Save disabled', async () => {
    getAll.mockResolvedValue({ ok: true, data: MIXED });
    render(<MacroPanel approvedFonts={['Arial']} />);

    fireEvent.click(await screen.findByText('Alpha enterprise'));

    expect((await screen.findByRole('note')).textContent).toBe('Only an administrator can change this macro.');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect((screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
