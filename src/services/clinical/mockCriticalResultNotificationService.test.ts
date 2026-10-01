import { describe, it, expect, beforeEach } from 'vitest';
import { mockCriticalResultNotificationService } from './mockCriticalResultNotificationService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockCriticalResultNotificationService — recordNotification', () => {
  it('records a real critical value notification with every real field', async () => {
    const res = await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-1',
      trigger: 'critical_value',
      findingSummary: 'Unexpected malignancy in routine appendectomy specimen',
      clinicianName: 'Dr. Faulkner',
      method: 'verbal_phone',
      notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
      readBackConfirmed: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.trigger).toBe('critical_value');
      expect(res.data.readBackConfirmed).toBe(true);
      expect(res.data.notifiedAt).toBeTruthy();
    }
  });

  it('records a real intraoperative frozen notification, specimen-scoped', async () => {
    const res = await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-1',
      specimenId: 'SP-A',
      trigger: 'intraoperative_frozen',
      findingSummary: 'Invasive carcinoma on frozen section, margins pending',
      clinicianName: 'Dr. Owusu',
      method: 'verbal_phone',
      notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.specimenId).toBe('SP-A');
  });

  it('rejects a notification with no real clinician name', async () => {
    const res = await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-1', trigger: 'critical_value', findingSummary: 'x', clinicianName: '',
      method: 'verbal_phone', notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a notification with no real finding summary', async () => {
    const res = await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-1', trigger: 'critical_value', findingSummary: '', clinicianName: 'Dr. Faulkner',
      method: 'verbal_phone', notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    expect(res.ok).toBe(false);
  });

  it('a case can accumulate multiple real notifications - a frozen callback and a later critical value', async () => {
    await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-2', specimenId: 'SP-A', trigger: 'intraoperative_frozen',
      findingSummary: 'Deferred to permanent', clinicianName: 'Dr. Owusu',
      method: 'verbal_phone', notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    await mockCriticalResultNotificationService.recordNotification({
      caseId: 'CASE-2', trigger: 'critical_value',
      findingSummary: 'Invasive carcinoma confirmed on permanent sections', clinicianName: 'Dr. Owusu',
      method: 'secure_page', notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    const res = await mockCriticalResultNotificationService.getByCaseId('CASE-2');
    if (!res.ok) throw new Error('lookup failed');
    expect(res.data).toHaveLength(2);
  });
});

describe('mockCriticalResultNotificationService — migrateIntraopVerbalReport (closes the real merge gap)', () => {
  it('migrates a real, existing verbal report into a real, permanent case-level record', async () => {
    const res = await mockCriticalResultNotificationService.migrateIntraopVerbalReport({
      caseId: 'CASE-3',
      specimenId: 'SP-A',
      surgeon: 'Dr. Owusu',
      note: 'Spoke with Dr. Owusu. Margins grossly clear, frozen pending.',
      notifiedAt: '2026-07-11T14:26:00.000Z',
      notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.trigger).toBe('intraoperative_frozen');
      expect(res.data.method).toBe('verbal_phone');
      expect(res.data.clinicianName).toBe('Dr. Owusu');
      expect(res.data.findingSummary).toBe('Spoke with Dr. Owusu. Margins grossly clear, frozen pending.');
      expect(res.data.notifiedAt).toBe('2026-07-11T14:26:00.000Z');
    }
    const all = await mockCriticalResultNotificationService.getByCaseId('CASE-3');
    if (!all.ok) throw new Error('lookup failed');
    expect(all.data).toHaveLength(1);
  });

  it('rejects migrating a session with no real note to carry forward', async () => {
    const res = await mockCriticalResultNotificationService.migrateIntraopVerbalReport({
      caseId: 'CASE-4', surgeon: 'Dr. Owusu', note: '',
      notifiedAt: new Date().toISOString(), notifiedBy: { userId: 'PATH-001', userName: 'Pete Nimmo' },
    });
    expect(res.ok).toBe(false);
  });
});
