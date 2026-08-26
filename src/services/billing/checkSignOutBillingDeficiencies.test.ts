import { describe, it, expect } from 'vitest';
import { checkSignOutBillingDeficiencies } from './checkSignOutBillingDeficiencies';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { NcciPtpEditPair } from '@/types/billing/NcciPtpEdit';

const baseCharge = (over: Partial<ServiceChargeRecord>): ServiceChargeRecord => ({
  id: 'chg-1', caseId: 'CASE-1', transactionType: 'charge',
  sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'SP-1',
  billingCode: '88307', cptCode: '88307', level: 'specimen', billingType: 'Global',
  ruleVersion: 1, resolvedAt: '2026-08-24T00:00:00.000Z', resolvedBy: 'system',
  ...over,
});

describe('checkSignOutBillingDeficiencies - real, direct verification', () => {
  it('flags UNSUPPORTED_CPT_LEVEL when billed higher than the specimen type default', () => {
    const charges = [baseCharge({ id: 'chg-1', cptCode: '88307' })];
    const specimens = [{ id: 'SP-1', label: 'A', specimenDictionaryEntryId: 'DICT-1' }];
    const dict = [{ id: 'DICT-1', defaultBaseCptCode: '88305' }];
    const findings = checkSignOutBillingDeficiencies(charges, specimens, dict, []);
    expect(findings).toHaveLength(1);
    expect(findings[0].deficiencyType).toBe('UNSUPPORTED_CPT_LEVEL');
    expect(findings[0].specimenId).toBe('SP-1');
    expect(findings[0].auditorNotes).toContain('88307');
    expect(findings[0].auditorNotes).toContain('88305');
  });

  it('does NOT flag when billed at or below the specimen type default', () => {
    const charges = [baseCharge({ id: 'chg-1', cptCode: '88304' })];
    const specimens = [{ id: 'SP-1', label: 'A', specimenDictionaryEntryId: 'DICT-1' }];
    const dict = [{ id: 'DICT-1', defaultBaseCptCode: '88305' }];
    expect(checkSignOutBillingDeficiencies(charges, specimens, dict, [])).toHaveLength(0);
  });

  it('flags NCCI_BUNDLING_VIOLATION for a real modifier-0 pair', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88312', level: 'stain' }),
      baseCharge({ id: 'chg-2', cptCode: '88313', level: 'stain' }),
    ];
    const pairs: NcciPtpEditPair[] = [{ id: 'p1', columnOneCode: '88312', columnTwoCode: '88313', modifierIndicator: '0', effectiveDate: '2026-01-01' }];
    const findings = checkSignOutBillingDeficiencies(charges, [{ id: 'SP-1', label: 'A' }], [], pairs);
    expect(findings).toHaveLength(1);
    expect(findings[0].deficiencyType).toBe('NCCI_BUNDLING_VIOLATION');
  });

  it('does NOT flag a real modifier-1 pair (e.g. 88342/88341 - normal multi-stain IHC)', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain' }),
      baseCharge({ id: 'chg-2', cptCode: '88341', level: 'stain' }),
    ];
    const pairs: NcciPtpEditPair[] = [{ id: 'p1', columnOneCode: '88342', columnTwoCode: '88341', modifierIndicator: '1', effectiveDate: '2026-01-01' }];
    expect(checkSignOutBillingDeficiencies(charges, [{ id: 'SP-1', label: 'A' }], [], pairs)).toHaveLength(0);
  });

  it('excludes a reversed (credited) charge from both checks - a removed code was never really billed', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88307' }),
      { ...baseCharge({ id: 'chg-2', cptCode: '88307' }), transactionType: 'credit' as const, reversesTransactionId: 'chg-1' },
    ];
    const specimens = [{ id: 'SP-1', label: 'A', specimenDictionaryEntryId: 'DICT-1' }];
    const dict = [{ id: 'DICT-1', defaultBaseCptCode: '88305' }];
    // chg-1 (88307) is reversed by chg-2 - net-active charges for SP-1 is empty, so no finding.
    expect(checkSignOutBillingDeficiencies(charges, specimens, dict, [])).toHaveLength(0);
  });

  it('a specimen with no dictionary entry at all is never flagged for UNSUPPORTED_CPT_LEVEL', () => {
    const charges = [baseCharge({ id: 'chg-1', cptCode: '88309' })];
    const specimens = [{ id: 'SP-1', label: 'A' }]; // no specimenDictionaryEntryId
    expect(checkSignOutBillingDeficiencies(charges, specimens, [], [])).toHaveLength(0);
  });
});
