import { describe, it, expect, beforeEach } from 'vitest';
import { mockServiceChargeService, getEffectiveChargeStatus } from './mockServiceChargeService';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

// Real, minimal localStorage mock - same pattern as
// mockBillingRuleService.test.ts, this suite genuinely exercises the
// storage-backed service, not just pure functions.
beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

function makeCharge(overrides: Partial<ServiceChargeRecord> = {}): ServiceChargeRecord {
  return {
    id: overrides.id ?? `chg-${Math.random().toString(36).slice(2, 8)}`,
    caseId: 'S26-TEST-001',
    transactionType: 'charge',
    sourceLevel: 'specimen',
    sourceLabel: 'Specimen A',
    billingCode: '88305',
    cptCode: '88305',
    level: 'specimen',
    billingType: 'Global',
    ruleVersion: 1,
    resolvedAt: '2026-08-01T10:00:00.000Z',
    resolvedBy: 'PATH-001',
    ...overrides,
  };
}

describe('mockServiceChargeService — real ledger append-only behavior (pre-existing)', () => {
  it('saveCharge appends and getChargesForCase returns it', async () => {
    const charge = makeCharge();
    const res = await mockServiceChargeService.saveCharge(charge);
    expect(res.ok).toBe(true);
    const all = await mockServiceChargeService.getChargesForCase(charge.caseId);
    if (!all.ok) throw new Error('lookup failed');
    expect(all.data.map(c => c.id)).toContain(charge.id);
  });

  it('rejects saving a duplicate id', async () => {
    const charge = makeCharge();
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.saveCharge(charge);
    expect(res.ok).toBe(false);
  });
});

describe('getEffectiveChargeStatus — real, honest legacy-mapping default', () => {
  it('treats a charge with no approvalStatus at all as EXPORTED, never as DRAFT', () => {
    const charge = makeCharge();
    expect(charge.approvalStatus).toBeUndefined();
    expect(getEffectiveChargeStatus(charge)).toBe('EXPORTED');
  });

  it('returns the real, explicit approvalStatus when one is set', () => {
    const charge = makeCharge({ approvalStatus: 'PENDING_APPROVAL' });
    expect(getEffectiveChargeStatus(charge)).toBe('PENDING_APPROVAL');
  });
});

describe('mockServiceChargeService — real Draft / Pending Approval / Approve / Reject lifecycle (Four-Eyes Principle)', () => {
  it('submitForApproval moves a real DRAFT to PENDING_APPROVAL and records who/when', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('PENDING_APPROVAL');
      expect(res.data.draftedBy).toBe('drafter-1');
      expect(res.data.draftedAt).toBeTruthy();
    }
  });

  it('rejects submitting a charge that is not currently a real DRAFT', async () => {
    const charge = makeCharge(); // no approvalStatus - effectively EXPORTED
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle: rejects approval when approvedBy matches the real drafter', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.approveCharge(charge.id, 'drafter-1');
    expect(res.ok).toBe(false);
  });

  it('a real, genuinely different approver can approve, clearing the charge for export', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.approveCharge(charge.id, 'approver-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('APPROVED');
      expect(res.data.approvedBy).toBe('approver-1');
      expect(res.data.approvedViaBreakGlass).toBeFalsy();
    }
  });

  it('Break-Glass Override: self-approval is rejected without bypassAuthorized, but succeeds and is flagged when explicitly authorized', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'solo-doc');

    const blocked = await mockServiceChargeService.approveCharge(charge.id, 'solo-doc');
    expect(blocked.ok).toBe(false);

    const bypassed = await mockServiceChargeService.approveCharge(charge.id, 'solo-doc', true);
    expect(bypassed.ok).toBe(true);
    if (bypassed.ok) {
      expect(bypassed.data.approvalStatus).toBe('APPROVED');
      expect(bypassed.data.approvedViaBreakGlass).toBe(true);
    }
  });

  it('rejectCharge requires a real rejection reason', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.rejectCharge(charge.id, 'reviewer-1', '');
    expect(res.ok).toBe(false);
  });

  it('Four-Eyes Principle applies to rejection too - the real drafter cannot reject their own submission', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.rejectCharge(charge.id, 'drafter-1', 'Real reason');
    expect(res.ok).toBe(false);
  });

  it('a real, different reviewer can reject, with a real, recorded reason', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.rejectCharge(charge.id, 'reviewer-1', 'CPT does not match gross description');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('REJECTED');
      expect(res.data.rejectionReason).toBe('CPT does not match gross description');
    }
  });

  it('rejects approving/rejecting a charge that is not currently real PENDING_APPROVAL', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    // Still DRAFT - never submitted.
    const approveRes = await mockServiceChargeService.approveCharge(charge.id, 'approver-1');
    expect(approveRes.ok).toBe(false);
    const rejectRes = await mockServiceChargeService.rejectCharge(charge.id, 'reviewer-1', 'x');
    expect(rejectRes.ok).toBe(false);
  });
});

describe('mockServiceChargeService — real Hold / Release lifecycle', () => {
  it('holdCharge moves any real state to HOLD and records the real prior status', async () => {
    const charge = makeCharge({ approvalStatus: 'PENDING_APPROVAL' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.holdCharge(charge.id, 'supervisor-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('HOLD');
      expect(res.data.approvalStatusBeforeHold).toBe('PENDING_APPROVAL');
    }
  });

  it('releaseHold restores the exact real prior status, not a guessed default', async () => {
    const charge = makeCharge({ approvalStatus: 'APPROVED' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.holdCharge(charge.id, 'supervisor-1');
    const res = await mockServiceChargeService.releaseHold(charge.id, 'supervisor-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBe('APPROVED');
      expect(res.data.approvalStatusBeforeHold).toBeUndefined();
    }
  });

  it('releaseHold correctly restores undefined (the real legacy default) rather than fabricating EXPORTED', async () => {
    const charge = makeCharge(); // no approvalStatus at all
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.holdCharge(charge.id, 'supervisor-1');
    const res = await mockServiceChargeService.releaseHold(charge.id, 'supervisor-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.approvalStatus).toBeUndefined();
      expect(getEffectiveChargeStatus(res.data)).toBe('EXPORTED');
    }
  });

  it('rejects holding a charge that is already on hold', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.holdCharge(charge.id, 'supervisor-1');
    const res = await mockServiceChargeService.holdCharge(charge.id, 'supervisor-1');
    expect(res.ok).toBe(false);
  });

  it('rejects releasing a charge that is not currently on hold', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.releaseHold(charge.id, 'supervisor-1');
    expect(res.ok).toBe(false);
  });
});

describe('mockServiceChargeService — real, optional actorRole permission check (backward-compatible)', () => {
  it('submitForApproval succeeds when actorRole is omitted (existing callers unaffected)', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    expect(res.ok).toBe(true);
  });

  it('submitForApproval rejects when a real, explicit actorRole lacks authorization', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1', 'transcriptionist');
    expect(res.ok).toBe(false);
  });

  it('submitForApproval succeeds when a real, authorized actorRole is passed', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    const res = await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1', 'pathologist');
    expect(res.ok).toBe(true);
  });

  it('approveCharge rejects when a real, explicit actorRole lacks authorization, even for a genuinely different approver', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.approveCharge(charge.id, 'approver-1', undefined, 'billing_clerk_unlisted_role');
    expect(res.ok).toBe(false);
  });

  it('approveCharge succeeds when a real, authorized actorRole is passed alongside a genuinely different approver', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.approveCharge(charge.id, 'approver-1', undefined, 'admin');
    expect(res.ok).toBe(true);
  });

  it('rejectCharge rejects when a real, explicit actorRole lacks authorization', async () => {
    const charge = makeCharge({ approvalStatus: 'DRAFT' });
    await mockServiceChargeService.saveCharge(charge);
    await mockServiceChargeService.submitForApproval(charge.id, 'drafter-1');
    const res = await mockServiceChargeService.rejectCharge(charge.id, 'reviewer-1', 'Real reason', 'unauthorized_role');
    expect(res.ok).toBe(false);
  });
});
