import { describe, it, expect } from 'vitest';
import { placeHold, releaseHold } from './caseHolds';
import { resolveFieldRequirements } from '../fieldRequirements/fieldRequirementRules';
import { ConcurrencyConflictError } from './ConcurrencyConflictError';

const reqs = resolveFieldRequirements('report');
const actor = { id: 'U1', name: 'Pete Nimmo' };

function harness(caseHolds: any[] = [], allowed = true) {
  const store: any = { id: 'S26-1', version: 4, order: { facilityId: 'fac-1' }, caseHolds, retentionHolds: [] };
  const calls: any[] = []; const audits: string[] = [];
  const deps = {
    authorization: { enforce: async (c: string, ctx?: any) => { calls.push([c, ctx]); return { capability: c, allowed, grantedBy: [], missingRequirements: [], context: {} }; } },
    getCase: async () => store,
    updateCase: async (id: string, patch: any, v?: number) => { calls.push(['update', id, Object.keys(patch), v]); Object.assign(store, patch); },
    audit: async (e: any) => { audits.push(`${e.event}: ${e.detail}`); },
    now: () => '2026-09-29T12:00:00.000Z',
  };
  return { store, calls, audits, deps };
}

describe('case and retention holds (Batch 381)', () => {
  it('places a hold: note, capability for the case\'s facility, the fresh hold list, the case version, and an audit without the note', async () => {
    const h = harness();
    const r = await placeHold('case', 'S26-1', { reason: 'quality_issue', note: ' Block 2 fragmented ' }, actor, reqs, h.deps as any);
    expect(r.ok).toBe(true);
    expect(h.calls).toEqual([['case:hold:place', { caseId: 'S26-1', facilityId: 'fac-1' }], ['update', 'S26-1', ['caseHolds'], 4]]);
    expect(h.store.caseHolds).toEqual([expect.objectContaining({ reason: 'quality_issue', note: 'Block 2 fragmented', active: true, setByUserId: 'U1', setAt: '2026-09-29T12:00:00.000Z' })]);
    expect(h.audits).toEqual(['Case hold placed: Case hold placed (reason: quality_issue).']);
  });
  it('refuses without a note (before anything else), without permission, or when a hold is already active', async () => {
    const h = harness();
    expect(await placeHold('case', 'S26-1', { reason: 'other', note: ' ' }, actor, reqs, h.deps as any)).toEqual({ ok: false, reason: 'missing', missing: ['caseHoldNote'] });
    expect(h.calls).toEqual([]);
    expect((await placeHold('retention', 'S26-1', { reason: 'litigation_hold', note: 'Legal' }, actor, reqs, harness([], false).deps as any))).toEqual({ ok: false, reason: 'notPermitted' });
    const active = harness([{ id: 'h1', reason: 'other', note: 'x', setAt: 't', setByUserId: 'U9', setByUserName: 'X', active: true }]);
    expect(await placeHold('case', 'S26-1', { reason: 'other', note: 'again' }, actor, reqs, active.deps as any)).toEqual({ ok: false, reason: 'alreadyOnHold' });
  });
  it('releases the active hold with a note and audits it', async () => {
    const h = harness([{ id: 'h1', reason: 'pending_consultation', note: 'x', setAt: 't', setByUserId: 'U9', setByUserName: 'X', active: true }]);
    expect((await releaseHold('case', 'S26-1', { releaseNote: '' }, actor, reqs, h.deps as any))).toEqual({ ok: false, reason: 'missing', missing: ['caseHoldReleaseNote'] });
    const r = await releaseHold('case', 'S26-1', { releaseNote: 'Consult back' }, actor, reqs, h.deps as any);
    expect(r.ok).toBe(true);
    expect(h.store.caseHolds[0]).toMatchObject({ active: false, releasedByUserId: 'U1', releaseNote: 'Consult back', releasedAt: '2026-09-29T12:00:00.000Z' });
    expect(h.calls[0][0]).toBe('case:hold:release');
    expect(h.audits).toEqual(['Case hold released: Case hold released (reason it was placed: pending_consultation).']);
    expect(await releaseHold('case', 'S26-1', { releaseNote: 'again' }, actor, reqs, h.deps as any)).toEqual({ ok: false, reason: 'noActiveHold' });
  });
  it('a retention hold uses its own capabilities and field', async () => {
    const h = harness();
    await placeHold('retention', 'S26-1', { reason: 'research_hold', note: 'Study 12' }, actor, reqs, h.deps as any);
    expect(h.calls[0][0]).toBe('case:retention-hold:place');
    expect(h.calls[1][2]).toEqual(['retentionHolds']);
    expect(h.audits[0]).toBe('Retention hold placed: Retention hold placed (reason: research_hold).');
  });
  it('someone else\'s save in between is a conflict, not an overwrite', async () => {
    const h = harness();
    h.deps.updateCase = async () => { throw new ConcurrencyConflictError('S26-1', 4, 5); };
    expect(await placeHold('case', 'S26-1', { reason: 'other', note: 'x' }, actor, reqs, h.deps as any)).toEqual({ ok: false, reason: 'conflict' });
    expect(h.audits).toEqual([]);
  });
});
