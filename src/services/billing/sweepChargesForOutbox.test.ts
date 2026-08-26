import { describe, it, expect } from 'vitest';
import { sweepChargesForOutbox } from './sweepChargesForOutbox';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

const baseCharge = (over: Partial<ServiceChargeRecord>): ServiceChargeRecord => ({
  id: 'chg-1', caseId: 'CASE-1', transactionType: 'charge',
  sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'SP-1',
  billingCode: '88342', cptCode: '88342', level: 'stain', billingType: 'TC',
  ruleVersion: 1, resolvedAt: '2026-08-24T00:00:00.000Z', resolvedBy: 'system',
  ...over,
});

describe('sweepChargesForOutbox - real, direct verification', () => {
  it('sweeps a TC charge at SPECIMEN_GROSSED', () => {
    const charges = [baseCharge({ billingType: 'TC' })];
    const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set());
    expect(result).toHaveLength(1);
    expect(result[0].billingType).toBe('TC');
  });

  it('does NOT sweep a TC charge at CASE_SIGNED_OUT (wrong trigger)', () => {
    const charges = [baseCharge({ billingType: 'TC' })];
    expect(sweepChargesForOutbox(charges, 'CASE_SIGNED_OUT', new Set())).toHaveLength(0);
  });

  it('sweeps 26 and Global charges at CASE_SIGNED_OUT, holds them at SPECIMEN_GROSSED', () => {
    const charges = [
      baseCharge({ id: 'chg-26', billingType: '26' }),
      baseCharge({ id: 'chg-global', billingType: 'Global' }),
    ];
    expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
    const atSignout = sweepChargesForOutbox(charges, 'CASE_SIGNED_OUT', new Set());
    expect(atSignout).toHaveLength(2);
    expect(atSignout.map(r => r.billingType).sort()).toEqual(['26', 'Global']);
  });

  it('excludes an already-queued charge (real dedup)', () => {
    const charges = [baseCharge({ id: 'chg-1', billingType: 'TC' })];
    const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set(['chg-1']));
    expect(result).toHaveLength(0);
  });

  it('excludes a reversed (credited) charge - never really billed, never queued', () => {
    const charges = [
      baseCharge({ id: 'chg-1', billingType: 'TC' }),
      { ...baseCharge({ id: 'chg-2', billingType: 'TC' }), transactionType: 'credit' as const, reversesTransactionId: 'chg-1' },
    ];
    expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
  });

  it('carries real caseId/specimenId through to the sweep result', () => {
    const charges = [baseCharge({ billingType: 'TC', caseId: 'REAL-CASE', specimenId: 'REAL-SP' })];
    const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set());
    expect(result[0].caseId).toBe('REAL-CASE');
    expect(result[0].specimenId).toBe('REAL-SP');
  });

  describe('the real, admin-configurable triggerMap parameter (per direct guidance\u2019s own follow-up)', () => {
    it('uses BILLING_TYPE_DEFAULT_TRIGGER when no real override is given - existing behavior unchanged', () => {
      const charges = [baseCharge({ billingType: 'TC' }), baseCharge({ id: 'chg-2', billingType: '26' })];
      const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set());
      expect(result.map(r => r.billingType)).toEqual(['TC']);
    });

    it('a real admin override moves a billingType to a different real trigger event', () => {
      const charges = [baseCharge({ billingType: 'TC' })];
      const override = { TC: 'CASE_SIGNED_OUT' as const, '26': 'CASE_SIGNED_OUT' as const, Global: 'CASE_SIGNED_OUT' as const };
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set(), override)).toHaveLength(0);
      expect(sweepChargesForOutbox(charges, 'CASE_SIGNED_OUT', new Set(), override)).toHaveLength(1);
    });

    it('a real override can move 26/Global to release earlier, at SPECIMEN_GROSSED', () => {
      const charges = [baseCharge({ billingType: '26' })];
      const override = { TC: 'SPECIMEN_GROSSED' as const, '26': 'SPECIMEN_GROSSED' as const, Global: 'CASE_SIGNED_OUT' as const };
      const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set(), override);
      expect(result).toHaveLength(1);
    });
  });

  describe('real Export Lock - per direct guidance\u2019s own "Complete the Guardrails" requirement', () => {
    it('a charge with no approvalStatus at all (the real legacy default) is still swept', () => {
      const charges = [baseCharge({ billingType: 'TC' })]; // approvalStatus intentionally omitted
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(1);
    });

    it('a real, explicitly APPROVED charge is swept', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'APPROVED' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(1);
    });

    it('a real, explicitly EXPORTED charge is swept', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'EXPORTED' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(1);
    });

    it('a real DRAFT charge is never swept, even when its trigger event/billingType would otherwise be eligible', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'DRAFT' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
    });

    it('a real PENDING_APPROVAL charge is never swept', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'PENDING_APPROVAL' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
    });

    it('a real REJECTED charge is never swept', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'REJECTED' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
    });

    it('a real HOLD charge is never swept', () => {
      const charges = [baseCharge({ billingType: 'TC', approvalStatus: 'HOLD' })];
      expect(sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set())).toHaveLength(0);
    });

    it('in a real, mixed batch, only the export-eligible charges are swept - never a partial leak of a blocked one', () => {
      const charges = [
        baseCharge({ id: 'chg-draft', billingType: 'TC', approvalStatus: 'DRAFT' }),
        baseCharge({ id: 'chg-approved', billingType: 'TC', approvalStatus: 'APPROVED' }),
        baseCharge({ id: 'chg-legacy', billingType: 'TC' }),
        baseCharge({ id: 'chg-pending', billingType: 'TC', approvalStatus: 'PENDING_APPROVAL' }),
      ];
      const result = sweepChargesForOutbox(charges, 'SPECIMEN_GROSSED', new Set());
      expect(result.map(r => r.serviceChargeRecordId).sort()).toEqual(['chg-approved', 'chg-legacy']);
    });
  });
});
