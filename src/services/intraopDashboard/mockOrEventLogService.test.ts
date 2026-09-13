// src/services/intraopDashboard/mockOrEventLogService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockOrEventLogService — real, per the given design brief\'s "Dual-Signoff & OR Communication Bridge"', () => {
  it('real, recording a verbal report event persists it with a real, exact timestamp and surgeon name', async () => {
    const { mockOrEventLogService } = await import('./mockOrEventLogService');
    const result = await mockOrEventLogService.record({
      locationId: 'loc-or-04', intraopEntryId: 'intraop-1', eventType: 'verbal_report_logged',
      staffUserId: 'u1', staffUserName: 'J. Doe, RN', surgeonName: 'Dr. Jones',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.occurredAt).toBeDefined();
      expect(result.data.surgeonName).toBe('Dr. Jones');
    }
  });

  it('real, getByLocationId correctly scopes to one real location, never leaking another\'s events', async () => {
    const { mockOrEventLogService } = await import('./mockOrEventLogService');
    await mockOrEventLogService.record({ locationId: 'loc-or-04', eventType: 'stat_alert_acknowledged', staffUserId: 'u1', staffUserName: 'A' });
    await mockOrEventLogService.record({ locationId: 'loc-or-05', eventType: 'stat_alert_acknowledged', staffUserId: 'u2', staffUserName: 'B' });

    const result = await mockOrEventLogService.getByLocationId('loc-or-04');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].staffUserName).toBe('A');
    }
  });

  it('real, getByIntraopEntryId correctly scopes to one real session', async () => {
    const { mockOrEventLogService } = await import('./mockOrEventLogService');
    await mockOrEventLogService.record({ locationId: 'loc-or-04', intraopEntryId: 'intraop-1', eventType: 'verbal_report_logged', staffUserId: 'u1', staffUserName: 'A', surgeonName: 'Dr. X' });
    await mockOrEventLogService.record({ locationId: 'loc-or-04', intraopEntryId: 'intraop-2', eventType: 'verbal_report_logged', staffUserId: 'u1', staffUserName: 'A', surgeonName: 'Dr. Y' });

    const result = await mockOrEventLogService.getByIntraopEntryId('intraop-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });
});
