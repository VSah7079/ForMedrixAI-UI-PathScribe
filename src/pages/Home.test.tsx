// @vitest-environment happy-dom
//
// src/pages/Home.test.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct UI-review follow-up ("Fix them all" — colorblindness
// + other visual issues): no test file existed for Home.tsx before
// this pass, despite it being the primary way a keyboard-only user
// navigates the entire app. Two things covered here that didn't exist
// as real, verified behavior before this fix:
//
// 1. Keyboard activation — the cards were plain <div onClick>,
//    unreachable via Tab and non-activatable via Enter/Space. The
//    role="button"/tabIndex/onKeyDown fix in Home.tsx made this real;
//    these tests prove it, not just assert the props are present.
// 2. A cheap, permanent regression guard against the exact bug this
//    whole pass started from — Intraop Queue and My Contribution both
//    silently sharing #0EA5E9, identical under every colorblindness
//    simulation type because they were already identical to normal
//    vision. Doesn't require rendering the component — just checking
//    the real data every render draws from.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test, Doctor' } }),
}));
vi.mock('@hooks/useLogout', () => ({
  useLogout: () => vi.fn(),
}));
vi.mock('@/components/Common/PubMedTicker', () => ({
  default: () => null,
}));
vi.mock('@/components/Common/LogoutWarningModal', () => ({
  default: () => null,
}));

afterEach(() => { cleanup(); mockNavigate.mockClear(); });

async function renderHome() {
  const { default: Home } = await import('./Home');
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

describe('Home — real keyboard accessibility fix', () => {
  it('a real, live card is reachable via Tab (tabIndex 0) and reports role="button"', async () => {
    await renderHome();
    const card = screen.getByText('Accession').closest('[role="button"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('tabindex')).toBe('0');
  });

  it('pressing Enter on a focused card navigates to its real route', async () => {
    await renderHome();
    const card = screen.getByText('Accession').closest('[role="button"]')!;
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/accession');
  });

  it('pressing Space on a focused card navigates to its real route', async () => {
    await renderHome();
    const card = screen.getByText('Worklist').closest('[role="button"]')!;
    fireEvent.keyDown(card, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/worklist');
  });

  it('an unrelated key (e.g. Tab itself) does not trigger navigation', async () => {
    await renderHome();
    const card = screen.getByText('Search').closest('[role="button"]')!;
    fireEvent.keyDown(card, { key: 'Tab' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Home — real regression guard: no two cards share an accent color', () => {
  it('every card in the real cards array has a genuinely distinct color from every other', async () => {
    await renderHome();
    // Real, direct check against the same data the page itself
    // renders from — reads the actual --card-accent CSS custom
    // property each card's own root element carries, not a
    // hardcoded copy of the palette that could drift from the real one.
    const cards = document.querySelectorAll('.ps-home-card');
    expect(cards.length).toBeGreaterThan(0);
    const colors = Array.from(cards).map(el => (el as HTMLElement).style.getPropertyValue('--card-accent'));
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});
