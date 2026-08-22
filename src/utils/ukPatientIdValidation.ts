// src/utils/ukPatientIdValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: NHS Number (England & Wales),
// CHI Number (Scotland), and H&C Number (Northern Ireland) format and
// checksum validation. Each is a genuinely different real scheme — see
// PATIENT_ID_BY_JURISDICTION in types/systemConfig.ts for the existing,
// established per-jurisdiction pattern/example table this file's own
// validators are built to agree with.
//
// Deliberately three separate validators, not one generic function pretending
// these are the same algorithm with different parameters — CHI's own
// self-validating structure (embedded DOB, embedded gender parity) has no
// real equivalent in NHS or H&C Number, and collapsing them into one
// "generic Modulus 11 checker" would silently drop that real, jurisdiction-
// specific structure.
// ─────────────────────────────────────────────────────────────────────────────

export interface IdValidationResult {
  valid: boolean;
  /** Present only when `valid` is false — a real, human-readable reason
   *  (e.g. "Checksum failed", "Not a valid date of birth"), not just a
   *  bare boolean, so a caller can show something more useful than
   *  "invalid" to the person who has to correct it. */
  reason?: string;
}

// ── Shared Modulus 11 primitive ─────────────────────────────────────────────

/** The real, standard NHS-style Modulus 11 check-digit algorithm, per
 *  direct specification: weight the first 9 digits 10 down to 2, sum,
 *  take the remainder mod 11, subtract from 11. A remainder of 0
 *  produces a real check digit of 0 (11 - 0 = 11 is the special case
 *  below, not this one). A result of 11 also means check digit 0 (the
 *  standard algorithm's own edge case at total-remainder 0). A result
 *  of 10 means the number is genuinely INVALID under this algorithm —
 *  not usable as a real NHS/CHI/H&C number at all, per the standard
 *  specification; never silently coerced to a digit. Returns the real
 *  computed check digit (0-9), or -1 for the genuine "10 means invalid"
 *  case, so a caller compares against the real 10th digit rather than
 *  this function deciding validity for identifiers whose meaning
 *  (NHS vs CHI vs H&C) it doesn't know.
 */
function computeModulus11CheckDigit(firstNineDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const weight = 10 - i; // 10 down to 2
    sum += Number(firstNineDigits[i]) * weight;
  }
  const remainder = sum % 11;
  const checkDigit = 11 - remainder;
  if (checkDigit === 11) return 0;
  if (checkDigit === 10) return -1; // genuinely invalid — never a real digit
  return checkDigit;
}

// ── NHS Number (England & Wales) ────────────────────────────────────────────

/** Real, standard NHS Number validation: exactly 10 digits (spaces/dashes
 *  already stripped by the caller — see normalizeIdForSearch.ts for the
 *  same real, established stripping this app already applies for search;
 *  reused here for the same reason: NHS Number's own conventional
 *  display groups digits with spaces, "999 999 9999," and a real
 *  accessioner would type it that way) plus the Modulus 11 check digit
 *  described above. */
export function validateNhsNumber(raw: string): IdValidationResult {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, reason: 'NHS Number must be exactly 10 digits' };
  }
  const expected = computeModulus11CheckDigit(digits.slice(0, 9));
  if (expected === -1) {
    return { valid: false, reason: 'Not a valid NHS Number — checksum algorithm produces no valid check digit for these 9 digits' };
  }
  const actual = Number(digits[9]);
  if (expected !== actual) {
    return { valid: false, reason: 'Checksum (Modulus 11) failed — check digit does not match' };
  }
  return { valid: true };
}

// ── CHI Number (Scotland) ───────────────────────────────────────────────────

/** Real, standard CHI Number validation — genuinely self-validating,
 *  per direct specification, unlike NHS Number: no separate HL7 status
 *  code exists or is expected for CHI at all (see this file's own
 *  header comment, and CHI_STATUS_KIND below). Three real, independent
 *  checks, all required: (1) the first 6 digits form a real,
 *  syntactically valid DDMMYY date — not merely 6 digits, a real
 *  calendar date, so '993199xxxx' fails here even though it's 6
 *  digits; (2) the Modulus 11 check digit (digit 10, same algorithm as
 *  NHS Number above); gender parity (digit 9: odd = male, even =
 *  female) is intentionally NOT treated as a validity condition here —
 *  see this function's own inline comment for why. */
export function validateChiNumber(raw: string): IdValidationResult {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, reason: 'CHI Number must be exactly 10 digits' };
  }

  // First 6 digits: DDMMYY. Validated as a real, syntactically
  // plausible date — day/month range checks only (no century is
  // encoded in a 2-digit year, so a real "is this a real calendar
  // date" check can't fully resolve Feb 29 in every case without
  // knowing the century; day<=31/month<=12 with a real per-month day
  // cap using a non-leap-year assumption is the honest, achievable
  // bound here, not a false claim of full calendar validation).
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  if (mm < 1 || mm > 12) {
    return { valid: false, reason: 'First 6 digits are not a valid date of birth (month out of range)' };
  }
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb given the leap-year benefit of the doubt
  if (dd < 1 || dd > daysInMonth[mm - 1]) {
    return { valid: false, reason: 'First 6 digits are not a valid date of birth (day out of range)' };
  }

  const expected = computeModulus11CheckDigit(digits.slice(0, 9));
  if (expected === -1) {
    return { valid: false, reason: 'Not a valid CHI Number — checksum algorithm produces no valid check digit for these 9 digits' };
  }
  const actual = Number(digits[9]);
  if (expected !== actual) {
    return { valid: false, reason: 'Checksum (Modulus 11) failed — check digit does not match' };
  }
  return { valid: true };
}

/** Real, standard CHI gender-parity read (digit 9: odd = male, even =
 *  female) — genuinely separate from validateChiNumber's own
 *  valid/invalid determination. Deliberately NOT folded into
 *  validity: this digit records the sex the patient was assigned at
 *  the time their CHI number was issued, which can genuinely,
 *  legitimately differ from a real patient's own current
 *  self-identified sex/gender recorded elsewhere in this app's own
 *  MasterPatientRecord — treating a real mismatch as an "invalid
 *  number" would incorrectly flag a real, valid CHI number as broken
 *  merely because a real person's recorded sex has legitimately
 *  changed since issuance. Exposed as a separate, read-only fact for
 *  a caller to display or cross-reference, never as a validity gate. */
export function chiNumberGenderParity(raw: string): 'M' | 'F' | undefined {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) return undefined;
  const genderDigit = Number(digits[8]);
  return genderDigit % 2 === 1 ? 'M' : 'F';
}

// ── H&C Number (Northern Ireland) ───────────────────────────────────────────

/** Real, standard Health & Care Number validation, per direct
 *  specification: 10 digits, Modulus 11 (same algorithm as NHS Number
 *  above), and — a real, distinguishing structural fact this
 *  specification adds — allocated only within 3200000001–3999999999.
 *  Confirmed against this app's own existing PATIENT_ID_BY_JURISDICTION
 *  table (types/systemConfig.ts): that table's own GB_NIR entry
 *  currently describes a letters-then-digits format ('AA99999'), which
 *  directly disagrees with this real, all-numeric, ranged
 *  specification — flagged as a real, separate data-correction item
 *  this file does not silently paper over (see this repo's own
 *  Config/System README for the correction once applied there). */
export function validateHcNumber(raw: string): IdValidationResult {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, reason: 'H&C Number must be exactly 10 digits' };
  }
  const asNumber = Number(digits);
  if (asNumber < 3_200_000_001 || asNumber > 3_999_999_999) {
    return { valid: false, reason: 'H&C Number must be in the allocated 3,200,000,001–3,999,999,999 range' };
  }
  const expected = computeModulus11CheckDigit(digits.slice(0, 9));
  if (expected === -1) {
    return { valid: false, reason: 'Not a valid H&C Number — checksum algorithm produces no valid check digit for these 9 digits' };
  }
  const actual = Number(digits[9]);
  if (expected !== actual) {
    return { valid: false, reason: 'Checksum (Modulus 11) failed — check digit does not match' };
  }
  return { valid: true };
}
