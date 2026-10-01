import { describe, it, expect } from 'vitest';
import {
  completeGrossing, missingGrossingItems, canCompleteGrossingFrom, blocksExpected,
  specimensWithoutProtocol, specimensForSecondaryReview, protocolRequired, GROSSED_WITHOUT_PROTOCOL_DEFICIENCY,
} from './grossingCompletion';
import { resolveFieldRequirements } from '../fieldRequirements/fieldRequirementRules';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';

const PROTOCOL = { id: 'p1', version: 2, name: 'Small biopsy' };
const kase = (over: any = {}) => ({
  id: 'S26-1', status: 'accessioned', order: { facilityId: 'fac-1' },
  specimens: [
    { id: 'a', label: 'A', protocolSnapshot: PROTOCOL, blocks: [{ id: 'a1', label: '1', pieceCount: 2 }, { id: 'a2', label: '2' }], processing: { fixationEndedAt: '2026-09-28T10:00' } },
    { id: 'b', label: 'B', protocolSnapshot: PROTOCOL, blocks: [], processing: {} },
  ],
  ...over,
}) as any;
const specimenA = () => kase().specimens[0];
const noProtocol = (label = 'C') => ({ id: label.toLowerCase(), label, blocks: [], processing: {} });

const deps = (allowed = true, raiseOk = true) => {
  const calls: any[] = []; const audits: string[] = []; const raised: any[] = [];
  return { calls, audits, raised, d: {
    authorization: { enforce: async (c: string, ctx?: any) => { calls.push([c, ctx]); return { capability: c, allowed, grantedBy: [], missingRequirements: [], context: {} }; } },
    updateCase: async (id: string, patch: any, v: number) => { calls.push(['update', id, patch, v]); },
    audit: async (e: any) => { audits.push(`${e.event}: ${e.detail}`); return e; },
    raiseDeficiency: async (input: any) => { raised.push(input); return { ok: raiseOk }; },
    actorName: 'PA One',
    actorId: 'PA-001',
  } };
};

describe('Complete grossing (Batch 378)', () => {
  it('a specimen without a block stops completion by default; other checks follow the organisation\'s choices', () => {
    expect(missingGrossingItems(kase(), resolveFieldRequirements('grossing'))).toEqual([{ fieldId: 'blocks', where: ['B'] }]);
    const strict = resolveFieldRequirements('grossing', { pieceCount: true, fixationEndedAt: true, fixativeRatioConfirmed: true });
    expect(missingGrossingItems(kase(), strict)).toEqual([
      { fieldId: 'blocks', where: ['B'] },
      { fieldId: 'pieceCount', where: ['A2'] },
      { fieldId: 'fixationEndedAt', where: ['B'] },
      { fieldId: 'fixativeRatioConfirmed', where: ['A', 'B'] },
    ]);
  });
  it('only while the case is waiting for grossing', () => {
    expect(canCompleteGrossingFrom('accessioned')).toBe(true);
    expect(canCompleteGrossingFrom('in-progress')).toBe(false);
  });
  it('refuses when something is missing, before checking the capability', async () => {
    const x = deps();
    const r = await completeGrossing(kase(), resolveFieldRequirements('grossing'), 3, x.d as any);
    expect(r).toEqual({ ok: false, reason: 'missing', missing: [{ fieldId: 'blocks', where: ['B'] }] });
    expect(x.calls).toEqual([]);
  });
  it('checks the capability for the case\'s facility, moves it to Gross Complete, and audits', async () => {
    const x = deps();
    const c = kase({ specimens: [specimenA()] });
    const r = await completeGrossing(c, resolveFieldRequirements('grossing'), 3, x.d as any);
    expect(r).toMatchObject({ ok: true, routedForReview: [], reviewNotRaised: [] });
    expect(x.calls).toEqual([['case:grossing:complete', { caseId: 'S26-1', facilityId: 'fac-1' }], ['update', 'S26-1', { status: 'gross-complete' }, 3]]);
    expect(x.audits).toEqual(['Grossing completed: Grossing completed: 1 specimen(s), 2 block(s). Status accessioned → gross-complete.']);
    expect(x.raised).toEqual([]);
    expect(await completeGrossing(c, resolveFieldRequirements('grossing'), 3, deps(false).d as any)).toEqual({ ok: false, reason: 'notPermitted' });
    expect(await completeGrossing({ ...c, status: 'in-progress' }, resolveFieldRequirements('grossing'), 3, deps().d as any)).toEqual({ ok: false, reason: 'notOpen' });
  });
  it('a version conflict is passed back for the page to show', async () => {
    const x = deps();
    (x.d as any).updateCase = async () => { throw new ConcurrencyConflictError('S26-1', 3, 4); };
    await expect(completeGrossing(kase({ specimens: [specimenA()] }), resolveFieldRequirements('grossing'), 3, x.d as any)).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });
});

describe('The protocol rule, switchable per organisation (Batch 379)', () => {
  it('is required by default, and so is the block rule; both can be switched off', () => {
    const defaults = resolveFieldRequirements('grossing');
    expect(defaults.find(f => f.id === 'protocol')).toMatchObject({ required: true, locked: false });
    expect(defaults.find(f => f.id === 'blocks')).toMatchObject({ required: true, locked: false });
    expect(protocolRequired(defaults)).toBe(true);
    expect(protocolRequired(resolveFieldRequirements('grossing', { protocol: false }))).toBe(false);
    // Unknown requirements (an older settings shape) fall back to strict.
    expect(protocolRequired([])).toBe(true);
  });
  it('blocks are expected only of a specimen with a protocol that isn\'t a cytology preparation', () => {
    expect(blocksExpected({ protocolSnapshot: PROTOCOL })).toBe(true);
    expect(blocksExpected({})).toBe(false);
    expect(blocksExpected({ protocolSnapshot: PROTOCOL, decants: [{ id: 'd1' }] as any })).toBe(false);
  });
  it('with the rule on, a specimen without a protocol is reported missing (and not also for blocks)', () => {
    const c = kase({ specimens: [specimenA(), noProtocol()] });
    expect(specimensWithoutProtocol(c)).toEqual(['C']);
    expect(missingGrossingItems(c, resolveFieldRequirements('grossing'))).toEqual([{ fieldId: 'protocol', where: ['C'] }]);
    expect(specimensForSecondaryReview(c, resolveFieldRequirements('grossing'))).toEqual([]);
  });
  it('with the rule off, nothing is missing but completion asks for confirmation first, before any check or change', async () => {
    const off = resolveFieldRequirements('grossing', { protocol: false });
    const c = kase({ specimens: [specimenA(), noProtocol('B'), noProtocol('C')] });
    expect(missingGrossingItems(c, off)).toEqual([]);
    expect(specimensForSecondaryReview(c, off)).toEqual(['B', 'C']);
    const x = deps();
    expect(await completeGrossing(c, off, 3, x.d as any)).toEqual({ ok: false, reason: 'needsConfirmation', withoutProtocol: ['B', 'C'] });
    expect(x.calls).toEqual([]);
    expect(x.raised).toEqual([]);
  });
  it('confirmed, it completes, raises an open deficiency per protocol-less specimen for secondary review, and audits', async () => {
    const off = resolveFieldRequirements('grossing', { protocol: false });
    const c = kase({ specimens: [specimenA(), noProtocol('B')] });
    const x = deps();
    const r = await completeGrossing(c, off, 3, x.d as any, { confirmedWithoutProtocol: true });
    expect(r).toMatchObject({ ok: true, routedForReview: ['B'], reviewNotRaised: [] });
    expect(x.calls.map(k => k[0])).toEqual(['case:grossing:complete', 'update']);
    expect(x.raised).toEqual([{
      caseId: 'S26-1', specimenId: 'b', specimenLabel: 'B', deficiencyTypeId: GROSSED_WITHOUT_PROTOCOL_DEFICIENCY,
      comment: 'Grossing completed without an attached protocol by PA One; routed for secondary review.', raisedBy: 'PA-001',
    }]);
    expect(x.audits).toEqual(['Grossing completed: Grossing completed: 2 specimen(s), 2 block(s). Status accessioned → gross-complete. Completed without a protocol: specimen(s) B; routed for secondary review.']);
  });
  it('a refused capability still stops a confirmed completion', async () => {
    const off = resolveFieldRequirements('grossing', { protocol: false });
    const x = deps(false);
    const r = await completeGrossing(kase({ specimens: [noProtocol('B')] }), off, 3, x.d as any, { confirmedWithoutProtocol: true });
    expect(r).toEqual({ ok: false, reason: 'notPermitted' });
    expect(x.raised).toEqual([]);
  });
  it('a deficiency that can\'t be raised is reported and audited; the completion stands', async () => {
    const off = resolveFieldRequirements('grossing', { protocol: false });
    const x = deps(true, false);
    const r = await completeGrossing(kase({ specimens: [noProtocol('B')] }), off, 3, x.d as any, { confirmedWithoutProtocol: true });
    expect(r).toMatchObject({ ok: true, routedForReview: [], reviewNotRaised: ['B'] });
    expect(x.audits[1]).toBe('Secondary review not raised: Grossing completed without a protocol, but the secondary-review deficiency couldn\'t be raised for specimen(s) B.');
  });
  it('with the block rule off, a protocol specimen without blocks can complete', () => {
    expect(missingGrossingItems(kase(), resolveFieldRequirements('grossing', { blocks: false }))).toEqual([]);
  });
});
