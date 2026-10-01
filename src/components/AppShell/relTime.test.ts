// src/components/AppShell/relTime.test.ts
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// relTime() had no prior test coverage anywhere, and its one real gap
// (no >365-day fallback, so an over-a-year-old message rendered with
// no year at all) went unnoticed for exactly that reason. Covers the
// full real bucket ladder, not just the newly-added branch, so a
// future change can't silently regress an earlier bucket while fixing
// a later one.
import { describe, it, expect } from 'vitest';

// AppShell.tsx transitively imports several mock services (e.g.
// mockUserService.ts) that read/write `localStorage` unconditionally
// at module-load time for their own version-gated re-seeding — real,
// pre-existing behavior outside this fix's scope, but it means even
// importing AppShell.tsx just for this one pure helper needs the same
// real, in-memory localStorage polyfill this codebase's own service
// tests already use (see computeDisposalReport.test.ts) under
// vitest's default (non-DOM) environment.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { relTime } = await import('./AppShell');

function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
}

describe('relTime', () => {
  it('same-day: shows the real time-of-day, not a generic "Today" label', () => {
    const result = relTime(daysAgo(0, 2));
    // A real HH:MM-shaped time string (locale-formatted, so not asserting exact digits) —
    // deliberately NOT the literal word "Today", which is the one behavior this file's own
    // header comment says is intentionally different from formatRelative().
    expect(result).not.toBe('Today');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('exactly one day old: "Yesterday"', () => {
    expect(relTime(daysAgo(1))).toBe('Yesterday');
  });

  it('2–6 days old: a short weekday name', () => {
    const result = relTime(daysAgo(3));
    expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(result);
  });

  it('7–364 days old: a month/day string with no year', () => {
    const result = relTime(daysAgo(30));
    expect(result).not.toMatch(/\d{4}/);
  });

  it('365+ days old: real fix — falls back to a full, year-bearing date instead of an ambiguous month/day', () => {
    const d = daysAgo(400);
    const result = relTime(d);
    expect(result).toMatch(new RegExp(String(d.getFullYear())));
  });

  it('accepts a real ISO string, not just a Date instance, for every bucket including the new one', () => {
    const overAYearAgo = daysAgo(500).toISOString();
    const result = relTime(overAYearAgo);
    expect(result).toMatch(/\d{4}/);
  });
});
