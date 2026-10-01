import { describe, it, expect } from 'vitest';
import { mockPatientHistoryLisService } from './mockPatientHistoryLisService';

describe('mockPatientHistoryLisService', () => {
  it('returns the real, existing seed patient\'s real prior reports', async () => {
    const res = await mockPatientHistoryLisService.fetchPatientHistory('100503');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data.every(r => r.sourceSystemName.length > 0)).toBe(true);
    }
  });

  it('an MRN with no real prior history returns a real, empty list — never an error', async () => {
    const res = await mockPatientHistoryLisService.fetchPatientHistory('no-such-mrn');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });
});
