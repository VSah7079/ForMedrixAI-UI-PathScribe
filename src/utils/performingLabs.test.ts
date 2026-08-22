// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { getActivePerformingLabs } from './performingLabs';

describe('getActivePerformingLabs', () => {
  it('returns only facilities with the performing_lab role', async () => {
    const labs = await getActivePerformingLabs();
    expect(labs.length).toBeGreaterThan(0);
    for (const lab of labs) {
      expect(lab.roles).toContain('performing_lab');
    }
  });

  it('returns only Active facilities, never Inactive or Unverified', async () => {
    const labs = await getActivePerformingLabs();
    for (const lab of labs) {
      expect(lab.status).toBe('Active');
    }
  });

  it('includes a real, known performing lab from the real seed data', async () => {
    const labs = await getActivePerformingLabs();
    expect(labs.some(l => l.name === 'Fenwick General Hospital')).toBe(true);
  });
});
