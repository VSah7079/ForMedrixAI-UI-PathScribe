import { describe, it, expect } from 'vitest';
import { canCaseExportDft } from './canCaseExportDft';
import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

const baseDef = (over: Partial<BillingDeficiencyRecord>): BillingDeficiencyRecord => ({
  id: 'd1', caseId: 'C1', deficiencyType: 'NCCI_BUNDLING_VIOLATION', severity: 'CRITICAL_REJECTION_RISK',
  status: 'OPEN', raisedByTrigger: 'AUTO_NCCI_CHECK', auditorNotes: 'test', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system',
  ...over,
});

describe('canCaseExportDft - real, direct verification', () => {
  it('blocks export when a real OPEN deficiency exists', () => {
    const gate = canCaseExportDft([baseDef({ status: 'OPEN' })]);
    expect(gate.allowed).toBe(false);
    expect(gate.blocking).toHaveLength(1);
  });

  it('blocks export for UNDER_REVIEW too', () => {
    const gate = canCaseExportDft([baseDef({ status: 'UNDER_REVIEW' })]);
    expect(gate.allowed).toBe(false);
  });

  it('allows export once resolved', () => {
    const gate = canCaseExportDft([baseDef({ status: 'RESOLVED' })]);
    expect(gate.allowed).toBe(true);
    expect(gate.blocking).toHaveLength(0);
  });

  it('allows export when overridden with justification', () => {
    const gate = canCaseExportDft([baseDef({ status: 'OVERRIDDEN_WITH_JUSTIFICATION' })]);
    expect(gate.allowed).toBe(true);
  });

  it('allows export with no deficiencies at all', () => {
    expect(canCaseExportDft([]).allowed).toBe(true);
  });
});
