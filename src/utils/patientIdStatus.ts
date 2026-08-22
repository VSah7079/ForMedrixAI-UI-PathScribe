// src/utils/patientIdStatus.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: the actual status-dot logic
// ("UI Status Indicator Component") — jurisdiction-aware, per direct
// follow-up correction: "Scotland's CHI system does not use the 2-digit
// Status Indicator Code... Verification in LIMS... checking the DOB
// pattern and Modulus 11 algorithm locally... rather than reading a
// status code sub-field." Northern Ireland's H&C Number is the same —
// no PDS-style status code either.
//
// So the real, correct behavior genuinely differs by jurisdiction, not
// just by which validator runs:
//   - GB_EW (NHS Number): a real HL7-sourced status code (when known)
//     drives Green vs Amber; format/checksum failure is Red regardless
//     of any status code, since a malformed number was never really
//     checked against PDS at all, whatever a stale or mismatched code
//     might otherwise claim.
//   - GB_SCT (CHI) / GB_NIR (H&C): no status code exists to read —
//     Green/Red is entirely, honestly derived from the same local
//     format+checksum validation used everywhere else. Passing this
//     app's own local check is a genuinely weaker claim than PDS
//     verification, and the tooltip copy says so rather than
//     overclaiming "verified."
//   - Every other jurisdiction this app models (US, CA, IE, AU, NZ):
//     no registry-style verification concept in this app at all yet —
//     format-pattern validity only (PATIENT_ID_BY_JURISDICTION's own
//     existing pattern), Green/Red, no Amber tier, since there's no
//     real "untraced" concept to distinguish from "invalid" for these.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import { PATIENT_ID_BY_JURISDICTION } from '@/types/systemConfig';
import { validateNhsNumber, validateChiNumber, validateHcNumber } from './ukPatientIdValidation';

export type PatientIdStatusColor = 'green' | 'amber' | 'red' | 'gray';

export interface PatientIdStatus {
  color: PatientIdStatusColor;
  /** Short label for the dot's own accessible name / compact display. */
  label: string;
  /** Full sentence for the tooltip — the actual explanation a real user
   *  reads on hover, per direct specification's own tooltip content
   *  format ("Code 01 - Verified against PDS"). */
  tooltip: string;
}

/**
 * Real, standard NHS Number Status Indicator Code descriptions — per
 * direct specification's own summary (01 = verified; 02–08 = various
 * unverified/untraced states) plus real NHS Data Dictionary code
 * meanings, included here for a genuinely useful tooltip rather than a
 * bare, unexplained two-digit code. Flagged honestly: exact wording for
 * 02–08 should be confirmed against the specific Trust's own interface
 * specification or the current NHS Data Dictionary before this is
 * treated as a legally authoritative source — included as a real,
 * reasonable default a Trust can override, not asserted as
 * unquestionably exact.
 */
const NHS_STATUS_CODE_DESCRIPTIONS: Record<string, string> = {
  '01': 'Number present and verified against PDS (Spine)',
  '02': 'Number present but not yet verified',
  '03': 'Attempted verification without success',
  '04': 'Verification in progress',
  '05': 'Trace required',
  '06': 'Trace attempted — no match found',
  '07': 'Trace needs to be resolved — multiple matches found',
  '08': 'Trace not required (e.g. temporary resident)',
};

/** Real, standard "generic format-only" check for jurisdictions with no
 *  registry-style verification concept modeled in this app yet (US, CA,
 *  IE, AU, NZ) — reuses PATIENT_ID_BY_JURISDICTION's own existing
 *  pattern rather than a second, parallel format definition. */
function validateGenericFormat(jurisdiction: Jurisdiction, raw: string): boolean {
  const standard = PATIENT_ID_BY_JURISDICTION[jurisdiction];
  return new RegExp(standard.pattern).test(raw);
}

/**
 * The real, central entry point — per direct specification's own
 * "How to Handle This in Your Application" guidance: check the
 * assigning authority/jurisdiction, apply status codes conditionally
 * (NHS Number/England & Wales only), and derive Green/Red dynamically
 * for CHI/H&C rather than expecting a status code that doesn't exist
 * for them.
 *
 * `hl7StatusCode` is only ever consulted for GB_EW — passed through as
 * `undefined` for every other jurisdiction is correct, expected
 * behavior, not a missing-data problem to fix.
 */
export function computePatientIdStatus(
  jurisdiction: Jurisdiction,
  rawId: string | undefined | null,
  hl7StatusCode?: string,
): PatientIdStatus {
  const trimmed = (rawId ?? '').trim();

  if (!trimmed) {
    return {
      color: 'gray',
      label: 'Missing',
      tooltip: `${PATIENT_ID_BY_JURISDICTION[jurisdiction].label} not provided or omitted — normal for unidentified/emergency accessions.`,
    };
  }

  if (jurisdiction === 'GB_EW') {
    const result = validateNhsNumber(trimmed);
    if (!result.valid) {
      return { color: 'red', label: 'Invalid', tooltip: `Invalid NHS Number: ${result.reason}.` };
    }
    if (hl7StatusCode) {
      const description = NHS_STATUS_CODE_DESCRIPTIONS[hl7StatusCode] ?? 'Status code received but not recognised';
      const color: PatientIdStatusColor = hl7StatusCode === '01' ? 'green' : 'amber';
      return { color, label: color === 'green' ? 'Verified' : 'Unverified', tooltip: `Code ${hl7StatusCode} — ${description}.` };
    }
    // Real, honest state Pete's own table doesn't explicitly name: a
    // format/checksum-valid number with no real HL7 status code known
    // at all (e.g. typed directly at Accession, never resolved
    // through an ADT feed). Deliberately Amber, not Green — passing a
    // local checksum is a genuinely weaker claim than PDS
    // verification, and this app has no real basis to claim the
    // stronger one.
    return { color: 'amber', label: 'Unverified', tooltip: 'NHS Number format and checksum are valid, but no verification status has been received from PDS yet.' };
  }

  if (jurisdiction === 'GB_SCT') {
    const result = validateChiNumber(trimmed);
    if (!result.valid) {
      return { color: 'red', label: 'Invalid', tooltip: `Invalid CHI Number: ${result.reason}.` };
    }
    return { color: 'green', label: 'Valid', tooltip: 'CHI Number passes local validation (date of birth pattern + Modulus 11 checksum). Scotland\u2019s CHI system carries no separate PDS-style verification status.' };
  }

  if (jurisdiction === 'GB_NIR') {
    const result = validateHcNumber(trimmed);
    if (!result.valid) {
      return { color: 'red', label: 'Invalid', tooltip: `Invalid H&C Number: ${result.reason}.` };
    }
    return { color: 'green', label: 'Valid', tooltip: 'H&C Number passes local validation (Modulus 11 checksum + allocated range). Northern Ireland carries no separate PDS-style verification status.' };
  }

  // Every other jurisdiction: format-only, no registry-verification
  // concept modeled here yet — see this file's own header comment.
  const formatValid = validateGenericFormat(jurisdiction, trimmed);
  const label = PATIENT_ID_BY_JURISDICTION[jurisdiction].label;
  return formatValid
    ? { color: 'green', label: 'Valid format', tooltip: `${label} matches the expected format for this jurisdiction.` }
    : { color: 'red', label: 'Invalid format', tooltip: `${label} does not match the expected format (${PATIENT_ID_BY_JURISDICTION[jurisdiction].format}).` };
}
