// src/utils/patientIdStatus.test.ts
import { describe, it, expect } from 'vitest';
import { computePatientIdStatus } from './patientIdStatus';

describe('computePatientIdStatus — GB_EW (NHS Number): real HL7 status code drives Green/Amber', () => {
  it('is gray/Missing for an empty value', () => {
    expect(computePatientIdStatus('GB_EW', '').color).toBe('gray');
    expect(computePatientIdStatus('GB_EW', undefined).color).toBe('gray');
  });

  it('is red/Invalid for a checksum failure, even if a real status code was somehow supplied', () => {
    const result = computePatientIdStatus('GB_EW', '9434765910', '01');
    expect(result.color).toBe('red');
  });

  it('is green only for real status code 01', () => {
    const result = computePatientIdStatus('GB_EW', '9434765919', '01');
    expect(result.color).toBe('green');
    expect(result.tooltip).toContain('Code 01');
    expect(result.tooltip).toContain('PDS');
  });

  it('is amber for every other real status code (02–08)', () => {
    for (const code of ['02', '03', '04', '05', '06', '07', '08']) {
      const result = computePatientIdStatus('GB_EW', '9434765919', code);
      expect(result.color).toBe('amber');
      expect(result.tooltip).toContain(`Code ${code}`);
    }
  });

  it('is amber — not green — when the number is valid but no status code is known at all (e.g. typed directly, never resolved through an ADT feed)', () => {
    const result = computePatientIdStatus('GB_EW', '9434765919');
    expect(result.color).toBe('amber');
    expect(result.tooltip).toMatch(/no verification status/i);
  });
});

describe('computePatientIdStatus — GB_SCT (CHI Number): no status code exists, per direct correction', () => {
  it('is gray/Missing for an empty value', () => {
    expect(computePatientIdStatus('GB_SCT', '').color).toBe('gray');
  });

  it('is green for a real, valid CHI Number — with no status code involved at all', () => {
    const result = computePatientIdStatus('GB_SCT', '1401740014');
    expect(result.color).toBe('green');
    expect(result.tooltip).toMatch(/no separate PDS-style verification/i);
  });

  it('ignores any hl7StatusCode passed for GB_SCT — it has no real meaning here', () => {
    const withCode = computePatientIdStatus('GB_SCT', '1401740014', '01');
    const withoutCode = computePatientIdStatus('GB_SCT', '1401740014');
    expect(withCode).toEqual(withoutCode);
  });

  it('is red for an invalid CHI Number (bad date)', () => {
    const result = computePatientIdStatus('GB_SCT', '1513740014');
    expect(result.color).toBe('red');
  });
});

describe('computePatientIdStatus — GB_NIR (H&C Number): no status code exists', () => {
  it('is green for a real, valid H&C Number', () => {
    const result = computePatientIdStatus('GB_NIR', '3201234567');
    expect(result.color).toBe('green');
  });

  it('is red for an out-of-range H&C Number', () => {
    const result = computePatientIdStatus('GB_NIR', '3100000005');
    expect(result.color).toBe('red');
  });
});

describe('computePatientIdStatus — every other jurisdiction: format-only, no registry-verification concept modeled', () => {
  it('is green for a US MRN matching the expected format', () => {
    const result = computePatientIdStatus('US', '1234567');
    expect(result.color).toBe('green');
  });

  it('is red for a US MRN that fails the expected format', () => {
    const result = computePatientIdStatus('US', 'not-numeric');
    expect(result.color).toBe('red');
  });

  it('is gray/Missing for an empty value, same as every jurisdiction', () => {
    expect(computePatientIdStatus('US', '').color).toBe('gray');
    expect(computePatientIdStatus('AU', '').color).toBe('gray');
  });
});
