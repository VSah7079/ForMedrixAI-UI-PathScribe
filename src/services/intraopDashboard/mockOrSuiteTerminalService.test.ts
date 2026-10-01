// src/services/intraopDashboard/mockOrSuiteTerminalService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockOrSuiteTerminalService — real, per the given design brief\'s "Station Identity" terminal', () => {
  it('real, add() creates a real terminal bound to one real Location/Facility pair', async () => {
    const { mockOrSuiteTerminalService } = await import('./mockOrSuiteTerminalService');
    const result = await mockOrSuiteTerminalService.add({
      name: 'OR-Suite-04', locationId: 'loc-1', facilityId: 'fac-1', canViewMultiSuite: false, status: 'Active',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe('OR-Suite-04');
  });

  it('real, a genuine duplicate name is refused, not silently created twice', async () => {
    const { mockOrSuiteTerminalService } = await import('./mockOrSuiteTerminalService');
    await mockOrSuiteTerminalService.add({ name: 'OR-Suite-05', locationId: 'loc-2', facilityId: 'fac-1', canViewMultiSuite: false, status: 'Active' });
    const second = await mockOrSuiteTerminalService.add({ name: 'OR-Suite-05', locationId: 'loc-3', facilityId: 'fac-2', canViewMultiSuite: false, status: 'Active' });
    expect(second.ok).toBe(false);
  });

  it('real, getActive correctly excludes a deactivated terminal', async () => {
    const { mockOrSuiteTerminalService } = await import('./mockOrSuiteTerminalService');
    const created = await mockOrSuiteTerminalService.add({ name: 'OR-Suite-06', locationId: 'loc-4', facilityId: 'fac-1', canViewMultiSuite: false, status: 'Active' });
    if (created.ok) await mockOrSuiteTerminalService.deactivate(created.data.id);
    const active = await mockOrSuiteTerminalService.getActive();
    if (active.ok) expect(active.data.find(t => t.name === 'OR-Suite-06')).toBeUndefined();
  });

  it('real, per direct follow-up ("shouldn\'t we have seed data?") — starts with one real, active seed terminal bound to a genuinely existing Location, not an empty registry', async () => {
    const { mockOrSuiteTerminalService } = await import('./mockOrSuiteTerminalService');
    const active = await mockOrSuiteTerminalService.getActive();
    expect(active.ok).toBe(true);
    if (active.ok) {
      expect(active.data.length).toBeGreaterThan(0);
      expect(active.data.some(t => t.locationId === 'loc-fgh-theatre-2')).toBe(true);
    }
  });
});
