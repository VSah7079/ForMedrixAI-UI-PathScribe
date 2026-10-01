import { describe, it, expect } from 'vitest';
import { checkSignOutBillingDeficiencies } from './checkSignOutBillingDeficiencies';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';
import type { NcciPtpEditPair } from '@/types/billing/NcciPtpEdit';

// Real ICD-10 presence, shared across every test not itself concerned
// with Trigger C (MISSING_DIAGNOSTIC_ICD10) — isolates each existing
// test to the one trigger it actually names, same reasoning as
// baseCharge's own non-zero RVU defaults below.
const REAL_ICD10 = [{ code: 'C50.911' }];

const baseCharge = (over: Partial<ServiceChargeRecord>): ServiceChargeRecord => ({
  id: 'chg-1', caseId: 'CASE-1', transactionType: 'charge',
  sourceLevel: 'specimen', sourceLabel: 'A', specimenId: 'SP-1',
  billingCode: '88307', cptCode: '88307', level: 'specimen', billingType: 'Global',
  ruleVersion: 1, resolvedAt: '2026-08-24T00:00:00.000Z', resolvedBy: 'system',
  // Real, non-zero defaults so an existing test not concerned with
  // Trigger F (ZERO_FEE_MAPPING_ERROR) doesn't accidentally trip it —
  // 'Global' with no modifier already matches Trigger E's own expected
  // shape for that billingType, so no equivalent default is needed there.
  rvuWork: 1.2, rvuPe: 0.6, rvuMp: 0.1,
  ...over,
});

describe('checkSignOutBillingDeficiencies - real, direct verification', () => {
  it('flags UNSUPPORTED_CPT_LEVEL when billed higher than the specimen type default', () => {
    const charges = [baseCharge({ id: 'chg-1', cptCode: '88307' })];
    const specimens = [{ id: 'SP-1', label: 'A', specimenDictionaryEntryId: 'DICT-1' }];
    const dict = [{ id: 'DICT-1', defaultBaseCptCode: '88305' }];
    const findings = checkSignOutBillingDeficiencies(charges, specimens, dict, [], REAL_ICD10);
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
    expect(checkSignOutBillingDeficiencies(charges, specimens, dict, [], REAL_ICD10)).toHaveLength(0);
  });

  it('flags NCCI_BUNDLING_VIOLATION for a real modifier-0 pair', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88312', level: 'stain' }),
      baseCharge({ id: 'chg-2', cptCode: '88313', level: 'stain' }),
    ];
    const pairs: NcciPtpEditPair[] = [{ id: 'p1', columnOneCode: '88312', columnTwoCode: '88313', modifierIndicator: '0', effectiveDate: '2026-01-01' }];
    const findings = checkSignOutBillingDeficiencies(charges, [{ id: 'SP-1', label: 'A' }], [], pairs, REAL_ICD10);
    expect(findings).toHaveLength(1);
    expect(findings[0].deficiencyType).toBe('NCCI_BUNDLING_VIOLATION');
  });

  it('does NOT flag a real modifier-1 pair (e.g. 88342/88341 - normal multi-stain IHC)', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain' }),
      baseCharge({ id: 'chg-2', cptCode: '88341', level: 'stain' }),
    ];
    const pairs: NcciPtpEditPair[] = [{ id: 'p1', columnOneCode: '88342', columnTwoCode: '88341', modifierIndicator: '1', effectiveDate: '2026-01-01' }];
    expect(checkSignOutBillingDeficiencies(charges, [{ id: 'SP-1', label: 'A' }], [], pairs, REAL_ICD10)).toHaveLength(0);
  });

  it('excludes a reversed (credited) charge from both checks - a removed code was never really billed', () => {
    const charges = [
      baseCharge({ id: 'chg-1', cptCode: '88307' }),
      { ...baseCharge({ id: 'chg-2', cptCode: '88307' }), transactionType: 'credit' as const, reversesTransactionId: 'chg-1' },
    ];
    const specimens = [{ id: 'SP-1', label: 'A', specimenDictionaryEntryId: 'DICT-1' }];
    const dict = [{ id: 'DICT-1', defaultBaseCptCode: '88305' }];
    // chg-1 (88307) is reversed by chg-2 - net-active charges for SP-1 is empty, so no finding.
    expect(checkSignOutBillingDeficiencies(charges, specimens, dict, [], REAL_ICD10)).toHaveLength(0);
  });

  it('a specimen with no dictionary entry at all is never flagged for UNSUPPORTED_CPT_LEVEL', () => {
    const charges = [baseCharge({ id: 'chg-1', cptCode: '88309' })];
    const specimens = [{ id: 'SP-1', label: 'A' }]; // no specimenDictionaryEntryId
    expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10)).toHaveLength(0);
  });

  describe('Trigger C: MISSING_DIAGNOSTIC_ICD10', () => {
    it('flags a specimen whose charges have no ICD-10 anywhere - neither its own nor the case-wide order', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88305' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], []);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('MISSING_DIAGNOSTIC_ICD10');
      expect(findings[0].specimenId).toBe('SP-1');
      expect(findings[0].chargeRecordId).toBeUndefined(); // case-wide by nature, never pinned to one charge line
    });

    it('does NOT flag when the case-wide order carries an ICD-10, even with no per-specimen override', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88305' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10)).toHaveLength(0);
    });

    it('does NOT flag when the specimen has its own ICD-10 override, even with no case-wide code', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88305' })];
      const specimens = [{ id: 'SP-1', label: 'A', icd10: [{ code: 'K35.80' }] }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], [])).toHaveLength(0);
    });
  });

  describe('Trigger D: UNATTACHED_ANCILLARY_ORDER', () => {
    it('flags a stain-level charge whose block has a real, unconfirmed (pending) LIS request status', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain', blockId: 'BLK-1' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const blocksById = new Map([['BLK-1', { id: 'BLK-1', lisRequestStatus: 'pending' as const, stains: [] }]]);
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10, blocksById);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('UNATTACHED_ANCILLARY_ORDER');
      expect(findings[0].chargeRecordId).toBe('chg-1');
    });

    it('flags when the block itself is confirmed but one of its own stains is rejected', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain', blockId: 'BLK-1' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const blocksById = new Map([['BLK-1', { id: 'BLK-1', lisRequestStatus: 'confirmed' as const, stains: [{ lisRequestStatus: 'rejected' as const }] }]]);
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10, blocksById);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('UNATTACHED_ANCILLARY_ORDER');
    });

    it('does NOT flag when the block is genuinely confirmed', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain', blockId: 'BLK-1' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const blocksById = new Map([['BLK-1', { id: 'BLK-1', lisRequestStatus: 'confirmed' as const, stains: [] }]]);
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10, blocksById)).toHaveLength(0);
    });

    it('does NOT flag when the block simply can\'t be resolved (no blocksById entry) - absence of data is never evidence of a gap', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88342', level: 'stain', blockId: 'BLK-UNKNOWN' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10, new Map())).toHaveLength(0);
    });

    it('does NOT flag a specimen-level (non-stain) charge, even with an unconfirmed block', () => {
      const charges = [baseCharge({ id: 'chg-1', cptCode: '88305', level: 'specimen', blockId: 'BLK-1' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const blocksById = new Map([['BLK-1', { id: 'BLK-1', lisRequestStatus: 'pending' as const, stains: [] }]]);
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10, blocksById)).toHaveLength(0);
    });
  });

  describe('Trigger E: MODIFIER_MISMATCH', () => {
    it('flags a TC-component charge missing its required -TC modifier', () => {
      const charges = [baseCharge({ id: 'chg-1', billingType: 'TC', modifier: undefined })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('MODIFIER_MISMATCH');
    });

    it('flags an inverted modifier - -26 present on a TC-component charge', () => {
      const charges = [baseCharge({ id: 'chg-1', billingType: 'TC', modifier: '-26' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('MODIFIER_MISMATCH');
    });

    it('does NOT flag a correctly-modified TC/26 charge, or a correctly-unmodified Global charge', () => {
      const charges = [
        baseCharge({ id: 'chg-1', billingType: 'TC', modifier: '-TC' }),
        baseCharge({ id: 'chg-2', billingType: '26', modifier: '-26' }),
        baseCharge({ id: 'chg-3', billingType: 'Global', modifier: undefined }),
      ];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10)).toHaveLength(0);
    });
  });

  describe('Trigger F: ZERO_FEE_MAPPING_ERROR', () => {
    it('flags an active code resolved with $0.00 RVU and no suppressionAdvisory', () => {
      const charges = [baseCharge({ id: 'chg-1', rvuWork: 0, rvuPe: 0, rvuMp: 0, suppressionAdvisory: undefined })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      const findings = checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10);
      expect(findings).toHaveLength(1);
      expect(findings[0].deficiencyType).toBe('ZERO_FEE_MAPPING_ERROR');
    });

    it('does NOT flag a genuine $0.00 code that carries an explicit suppressionAdvisory override', () => {
      const charges = [baseCharge({ id: 'chg-1', rvuWork: 0, rvuPe: 0, rvuMp: 0, suppressionAdvisory: 'Bundled into base fee per local payer contract' })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10)).toHaveLength(0);
    });

    it('does NOT flag a real, non-zero-fee charge', () => {
      const charges = [baseCharge({ id: 'chg-1', rvuWork: 1.5, rvuPe: 0.8, rvuMp: 0.15 })];
      const specimens = [{ id: 'SP-1', label: 'A' }];
      expect(checkSignOutBillingDeficiencies(charges, specimens, [], [], REAL_ICD10)).toHaveLength(0);
    });
  });
});

