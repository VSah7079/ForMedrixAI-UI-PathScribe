// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { allowed, asked } = vi.hoisted(() => ({ allowed: { current: true }, asked: [] as Array<[string, unknown]> }));
vi.mock('../authorization/defaultAuthorizationService', () => ({
  authorizationService: {
    enforce: vi.fn(async (capability: string, context: unknown) => {
      asked.push([capability, context]);
      return { capability, allowed: allowed.current, grantedBy: [], missingRequirements: [], context: {} };
    }),
  },
}));

import { correctServiceCharge, enforceAppliedCodeCorrection } from './correctServiceCharge';
import { mockServiceChargeService } from './mockServiceChargeService';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

const original: ServiceChargeRecord = {
  id: 'chg-orch-1', caseId: 'CASE-ORCH', transactionType: 'charge',
  sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'sp-1',
  billingCode: '88307', cptCode: '88307', level: 'specimen', billingType: 'Global',
  ruleVersion: 1, resolvedAt: '2026-08-01T00:00:00.000Z', resolvedBy: 'system',
};

describe('correctServiceCharge - the real, shared orchestration extracted from UI code', () => {
  beforeEach(async () => {
    allowed.current = true;
    asked.length = 0;
    localStorage.clear();
    await mockServiceChargeService.saveCharge(original);
  });

  it('produces a real credit reversing the original and a real, new corrected charge', async () => {
    const res = await correctServiceCharge('CASE-ORCH', 'chg-orch-1', '88305', 'user-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.credit.transactionType).toBe('credit');
    expect(res.data.credit.reversesTransactionId).toBe('chg-orch-1');
    expect(res.data.corrected.cptCode).toBe('88305');
    expect(res.data.corrected.transactionType).toBe('charge');
  });

  it('both the credit and the corrected charge are actually persisted to the real ledger', async () => {
    await correctServiceCharge('CASE-ORCH', 'chg-orch-1', '88305', 'user-1');
    const chargesRes = await mockServiceChargeService.getChargesForCase('CASE-ORCH');
    expect(chargesRes.ok).toBe(true);
    if (!chargesRes.ok) return;
    expect(chargesRes.data.some(c => c.reversesTransactionId === 'chg-orch-1')).toBe(true);
    expect(chargesRes.data.some(c => c.cptCode === '88305' && c.transactionType === 'charge')).toBe(true);
  });

  it('carries the real postSignoutContext through to both the credit and the corrected charge when given', async () => {
    const context = { reasonId: 'psbc-clerical-error', comment: 'Wrong code applied at sign-out.' };
    const res = await correctServiceCharge('CASE-ORCH', 'chg-orch-1', '88305', 'user-1', context);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.credit.postSignoutChangeReasonId).toBe('psbc-clerical-error');
    expect(res.data.corrected.postSignoutChangeComment).toBe('Wrong code applied at sign-out.');
  });

  it('returns a real, honest error (never throws) when the original charge cannot be found', async () => {
    const res = await correctServiceCharge('CASE-ORCH', 'chg-does-not-exist', '88305', 'user-1');
    expect(res.ok).toBe(false);
  });

  it('Batch 382: correcting an applied code needs billing:applied-code:correct for the case; without it the ledger is untouched', async () => {
    const before = await mockServiceChargeService.getChargesForCase('CASE-ORCH');
    allowed.current = false;
    const res = await correctServiceCharge('CASE-ORCH', 'chg-orch-1', '88305', 'user-1');
    expect(res).toMatchObject({ ok: false, notPermitted: true });
    expect(asked).toEqual([['billing:applied-code:correct', { caseId: 'CASE-ORCH' }]]);
    const after = await mockServiceChargeService.getChargesForCase('CASE-ORCH');
    expect(after.ok && after.data.map(c => c.id)).toEqual(before.ok ? before.data.map(c => c.id) : null);
    expect(await enforceAppliedCodeCorrection('CASE-ORCH')).toBe(false);
    allowed.current = true;
    expect(await enforceAppliedCodeCorrection('CASE-ORCH')).toBe(true);
  });
});
