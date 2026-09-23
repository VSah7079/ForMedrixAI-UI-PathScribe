// src/utils/ukPatientIdValidation.test.ts
import { describe, it, expect } from 'vitest';
import { validateNhsNumber, validateChiNumber, validateHcNumber, chiNumberGenderParity } from './ukPatientIdValidation';

describe('validateNhsNumber — real Modulus 11 checksum, per direct specification', () => {
  it('accepts a real, correctly-checksummed number — matches this app\'s own pre-existing PATIENT_ID_BY_JURISDICTION example, confirming the algorithm agrees with what was already there', () => {
    expect(validateNhsNumber('9434765919')).toEqual({ valid: true });
  });

  it('accepts the same number with conventional spacing (999 999 9999)', () => {
    expect(validateNhsNumber('943 476 5919')).toEqual({ valid: true });
  });

  it('accepts the same number with dashes', () => {
    expect(validateNhsNumber('943-476-5919')).toEqual({ valid: true });
  });

  it('rejects a wrong check digit', () => {
    const result = validateNhsNumber('9434765910'); // last digit changed from 9 to 0
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.checksumMismatch');
  });

  it('rejects the wrong length', () => {
    expect(validateNhsNumber('123456789').valid).toBe(false);
    expect(validateNhsNumber('12345678901').valid).toBe(false);
  });

  it('rejects non-digit characters (other than the conventional space/dash separators)', () => {
    expect(validateNhsNumber('943476591A').valid).toBe(false);
  });

  it('rejects a real 9-digit prefix whose Modulus 11 algorithm produces the genuine "10 means invalid" case, rather than silently coercing it', () => {
    // Verified directly: '100000001' has weighted-sum remainder 1,
    // producing a computed check digit of 10 — the standard
    // algorithm's own "not a real, usable identifier" case, distinct
    // from an ordinary wrong-digit mismatch.
    const result = validateNhsNumber('1000000010');
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.nhsNoValidCheckDigit');
  });
});

describe('validateChiNumber — real self-validating structure (DOB + Modulus 11), per direct specification', () => {
  it('accepts a real, correctly-checksummed number for a real date of birth (14 Jan 1974)', () => {
    expect(validateChiNumber('1401740014')).toEqual({ valid: true });
  });

  it('accepts a leap-year 29 February', () => {
    expect(validateChiNumber('2902000030')).toEqual({ valid: true });
  });

  it('rejects an invalid month (13)', () => {
    const result = validateChiNumber('1513740014');
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.chiInvalidDobMonth');
  });

  it('rejects an invalid day for a real month (31 in a 30-day month)', () => {
    const result = validateChiNumber('3104740014'); // 31 April doesn't exist
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.chiInvalidDobDay');
  });

  it('rejects a wrong checksum even with a genuinely valid embedded date', () => {
    const result = validateChiNumber('1401740015'); // correct DOB, wrong check digit
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.checksumMismatch');
  });

  it('rejects the wrong length', () => {
    expect(validateChiNumber('140174001').valid).toBe(false);
  });
});

describe('chiNumberGenderParity — real, informational-only read, never a validity gate', () => {
  it('reads odd digit 9 as male', () => {
    expect(chiNumberGenderParity('1401740014')).toBe('M'); // digit 9 is '1' (odd)
  });

  it('reads even digit 9 as female', () => {
    expect(chiNumberGenderParity('1401740022')).toBe('F'); // digit 9 is '2' (even)
  });

  it('returns undefined for a malformed number rather than guessing', () => {
    expect(chiNumberGenderParity('not-a-chi-number')).toBeUndefined();
  });
});

describe('validateHcNumber — real Modulus 11 + allocated range, per direct specification', () => {
  it('accepts a real, correctly-checksummed number within the allocated range (starts 320...)', () => {
    expect(validateHcNumber('3201234567')).toEqual({ valid: true });
  });

  it('accepts a real, correctly-checksummed number at the top of the allocated range (starts 399...)', () => {
    expect(validateHcNumber('3999999993')).toEqual({ valid: true });
  });

  it('rejects a genuinely out-of-range number (starts 31...) even with a correct checksum for those digits', () => {
    const result = validateHcNumber('3100000005');
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.hcOutOfRange');
  });

  it('rejects a wrong checksum for an in-range number', () => {
    const result = validateHcNumber('3201234568'); // correct range, wrong check digit
    expect(result.valid).toBe(false);
    expect(result.reasonKey).toBe('ukPatientIdValidation.checksumMismatch');
  });

  it('rejects the wrong length', () => {
    expect(validateHcNumber('320123456').valid).toBe(false);
  });
});
