import { describe, it, expect } from 'vitest';
import { saveGoverningBodies } from './governingBodyAdministration';

describe('saveGoverningBodies (Batch 371): ForMedrixAI support only', () => {
  const run = async (allowed: boolean) => {
    const saved: unknown[] = [];
    const checks: string[] = [];
    const res = await saveGoverningBodies([], {
      authorization: { enforce: async (c: string) => { checks.push(c); return { capability: c, allowed, grantedBy: [], missingRequirements: [], context: {} }; } },
      service: { saveAll: async b => { saved.push(b); } },
    });
    return { res, saved, checks };
  };
  it('refuses without platform:governing-bodies:manage and saves nothing', async () => {
    const { res, saved, checks } = await run(false);
    expect(res).toEqual({ ok: false, reason: 'notPermitted' });
    expect(checks).toEqual(['platform:governing-bodies:manage']);
    expect(saved).toEqual([]);
  });
  it('saves with it', async () => {
    const { res, saved } = await run(true);
    expect(res).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
  });
});
