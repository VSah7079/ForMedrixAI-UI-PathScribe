// src/services/hl7/dftBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { buildDftP03ForCase } from './dftBuilder';
import type { HL7MessageContext } from './types';
import type { ServiceChargeRecord } from '@/types/billing/ServiceChargeRecord';

const ctx: HL7MessageContext = {
  sendingApplication: 'PATHSCRIBE', sendingFacility: 'FORMEDRIX',
  receivingApplication: 'RCM', receivingFacility: 'RCM_FAC',
  processingId: 'T',
};

function makeCharge(over: Partial<ServiceChargeRecord> = {}): ServiceChargeRecord {
  return {
    id: 'chg-S26-1-A-88305-1', caseId: 'S26-1',
    transactionType: 'charge',
    sourceLevel: 'specimen', sourceLabel: 'A',
    billingCode: '88305', cptCode: '88305',
    level: 'specimen', billingType: 'Global',
    ruleVersion: 1, resolvedAt: '2026-08-20T12:00:00.000Z', resolvedBy: 'system',
    ...over,
  };
}

describe('buildDftP03ForCase — Phase 3 + Charge Capture rewire: real, verified DFT^P03 message assembly from real ServiceChargeRecord[]', () => {
  it('builds a real message with the correct message type in MSH-9', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: { mrn: '12345', firstName: 'Jane', lastName: 'Doe' } as any },
      [makeCharge()],
      'America/Phoenix',
    );
    expect(result.message).toContain('DFT^P03');
    expect(result.message.split('\r')[0]).toMatch(/^MSH/);
  });

  it('emits one real FT1 per real ServiceChargeRecord', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge()],
      'America/Phoenix',
    );
    expect(result.chargeCount).toBe(1);
    expect(result.message).toContain('FT1|1');
    expect(result.message).toContain('88305');
  });

  it('emits real FT1 segments for both specimen-level and block-level charges', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [
        makeCharge({ id: 'chg-1', sourceLevel: 'specimen', sourceLabel: 'A', billingCode: '88305', cptCode: '88305' }),
        makeCharge({ id: 'chg-2', sourceLevel: 'block', sourceLabel: 'A1', blockId: 'blk-1', billingCode: 'IHC-FIRST', cptCode: '88342' }),
      ],
      'America/Phoenix',
    );
    expect(result.chargeCount).toBe(2);
    expect(result.message).toContain('88305');
    expect(result.message).toContain('88342');
  });

  it('never emits a fabricated charge for a case with no real ServiceChargeRecords - honest, not a rule-based default', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [], // no real charges resolved yet
      'America/Phoenix',
    );
    expect(result.chargeCount).toBe(0);
  });

  it('emits a real DG1 per real ICD-10 diagnosis, with the first marked principal', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any, coding: { icd10: [{ code: 'C50.911', display: 'Malignant neoplasm of breast' }, { code: 'Z12.31', display: 'Screening mammogram' }] } },
      [makeCharge()],
      'America/Phoenix',
    );
    expect(result.message).toContain('DG1|1');
    expect(result.message).toContain('C50.911');
    expect(result.message).toContain('DG1|2');
    expect(result.message.split('\r').find(s => s.startsWith('DG1|1'))).toMatch(/\|F$/); // principal
  });

  it('links each real charge to the real primary diagnosis via FT1-19', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any, coding: { icd10: [{ code: 'C50.911', display: 'Malignant neoplasm of breast' }] } },
      [makeCharge()],
      'America/Phoenix',
    );
    const ft1Line = result.message.split('\r').find(s => s.startsWith('FT1'));
    expect(ft1Line).toContain('C50.911');
  });

  it('uses \\r as the real segment terminator, not \\n', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge()],
      'America/Phoenix',
    );
    expect(result.message).toContain('\r');
    expect(result.message.split('\r').length).toBeGreaterThan(1);
  });

  it('real, new behavior post-rewire: sources cptDescription/modifier/quantity from the real ServiceChargeRecord, not just the bare CPT code', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge({ cptCode: '88342', cptDescription: 'Immunohistochemistry, first single antibody stain', modifier: '26', quantity: 2 })],
      'America/Phoenix',
    );
    const ft1Line = result.message.split('\r').find(s => s.startsWith('FT1'));
    expect(ft1Line).toContain('Immunohistochemistry, first single antibody stain');
    // FT1-26 (last field) carries the modifier
    expect(ft1Line?.endsWith('|26')).toBe(true);
  });

  it('real, new behavior post-rewire: FT1-2 (transactionId) uses the ServiceChargeRecord\'s own real, deterministic id directly', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge({ id: 'chg-S26-1-A1-IHC-FIRST' })],
      'America/Phoenix',
    );
    expect(result.message).toContain('chg-S26-1-A1-IHC-FIRST');
  });

  it('emits CG (charge) for a real charge-type ServiceChargeRecord', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge({ transactionType: 'charge' })],
      'America/Phoenix',
    );
    const ft1Line = result.message.split('\r').find(s => s.startsWith('FT1'));
    expect(ft1Line?.split('|')[6]).toBe('CG');
  });

  it('emits CR (credit) for a real credit-type ServiceChargeRecord - never silently transmitted as a charge', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [makeCharge({ transactionType: 'credit', reversesTransactionId: 'chg-original-1' })],
      'America/Phoenix',
    );
    const ft1Line = result.message.split('\r').find(s => s.startsWith('FT1'));
    expect(ft1Line?.split('|')[6]).toBe('CR');
  });

  it('maps each segment independently in a real, mixed charge+credit batch - never one uniform value for the whole message', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [
        makeCharge({ id: 'chg-1', transactionType: 'charge', billingCode: '88305', cptCode: '88305' }),
        makeCharge({ id: 'chg-2', transactionType: 'credit', billingCode: '88305', cptCode: '88305', reversesTransactionId: 'chg-1' }),
        makeCharge({ id: 'chg-3', transactionType: 'charge', billingCode: 'IHC-FIRST', cptCode: '88342' }),
      ],
      'America/Phoenix',
    );
    const ft1Lines = result.message.split('\r').filter(s => s.startsWith('FT1'));
    expect(ft1Lines).toHaveLength(3);
    expect(ft1Lines[0].split('|')[6]).toBe('CG');
    expect(ft1Lines[1].split('|')[6]).toBe('CR');
    expect(ft1Lines[2].split('|')[6]).toBe('CG');
  });

  it('bundles multiple real charges from the same case into one message, preserving real charge order', () => {
    const result = buildDftP03ForCase(
      ctx,
      { id: 'S26-1', patient: {} as any },
      [
        makeCharge({ id: 'chg-1', billingCode: '88305', cptCode: '88305' }),
        makeCharge({ id: 'chg-2', billingCode: 'IHC-FIRST', cptCode: '88342' }),
        makeCharge({ id: 'chg-3', billingCode: 'IHC-ADDL', cptCode: '88341' }),
      ],
      'America/Phoenix',
    );
    expect(result.chargeCount).toBe(3);
    const ft1Lines = result.message.split('\r').filter(s => s.startsWith('FT1'));
    expect(ft1Lines).toHaveLength(3);
    expect(ft1Lines[0]).toContain('88305');
    expect(ft1Lines[1]).toContain('88342');
    expect(ft1Lines[2]).toContain('88341');
  });
});
