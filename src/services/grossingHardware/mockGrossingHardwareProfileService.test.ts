// src/services/grossingHardware/mockGrossingHardwareProfileService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockGrossingHardwareProfileService } from './mockGrossingHardwareProfileService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockGrossingHardwareProfileService — real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware Integration gap', () => {
  it('real, the default camera profile honestly seeds as browser_native, never a fabricated agent connection', async () => {
    const res = await mockGrossingHardwareProfileService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const camera = res.data.find(p => p.kind === 'camera');
    expect(camera?.bridgeType).toBe('browser_native');
  });

  it('real, the default scale profile honestly seeds as manual_entry_only, never a fabricated working bridge', async () => {
    const res = await mockGrossingHardwareProfileService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const scale = res.data.find(p => p.kind === 'scale');
    expect(scale?.bridgeType).toBe('manual_entry_only');
  });

  it('real, a new profile can be created and immediately retrieved', async () => {
    const created = await mockGrossingHardwareProfileService.create({
      kind: 'scale', label: 'Test Scale', bridgeType: 'pathscribe_agent', agentBaseUrl: 'http://localhost:9191', isActive: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const fetched = await mockGrossingHardwareProfileService.getById(created.data.id);
    expect(fetched.ok && fetched.data?.label).toBe('Test Scale');
  });

  it('real, updating a genuinely unknown profile id fails honestly, never silently succeeds', async () => {
    const res = await mockGrossingHardwareProfileService.update('not-a-real-id', { label: 'x' });
    expect(res.ok).toBe(false);
  });
});
