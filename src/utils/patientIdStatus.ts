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
//
// i18n note: this is a plain utility with no `useTranslation()` of its
// own, so `label`/`tooltip` were replaced with `labelKey`/`tooltipKey`
// (+ `tooltipParams`) — translation keys and interpolation data, not
// rendered text. `tooltipParams` may itself hold translation keys for
// a nested message (a validation reason, an NHS status-code
// description); which param names those are is listed in
// `innerKeys`, so `PatientIdStatusDot.tsx` (which does have `t()`)
// resolves those first before the outer `t(tooltipKey, ...)` call.
// `PATIENT_ID_BY_JURISDICTION[...].labelKey`/`.formatKey` (e.g. "NHS
// Number", "5–10 digits") are now themselves translation keys (see
// systemConfig.ts's own i18n note on that dictionary) — passed through
// via `innerKeys` below, same mechanism already used for `reason`/
// `description`, rather than as literal `tooltipParams` values.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import { PATIENT_ID_BY_JURISDICTION } from '@/types/systemConfig';
import { validateNhsNumber, validateChiNumber, validateHcNumber } from './ukPatientIdValidation';

export type PatientIdStatusColor = 'green' | 'amber' | 'red' | 'gray';

export interface PatientIdStatus {
  color: PatientIdStatusColor;
  /** Translation key for the dot's own accessible name / compact
   *  display (e.g. "Missing", "Verified"). */
  labelKey: string;
  /** Translation key for the tooltip sentence — the actual
   *  explanation a real user reads on hover, per direct
   *  specification's own tooltip content format ("Code 01 - Verified
   *  against PDS"). */
  tooltipKey: string;
  tooltipParams?: Record<string, unknown>;
  /** Names, within `tooltipParams`, whose value is itself a
   *  translation key (a nested validation reason or status-code
   *  description) rather than a literal value to interpolate as-is. */
  innerKeys?: Record<string, string>;
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
const NHS_STATUS_CODE_DESCRIPTION_KEY: Record<string, string> = {
  '01': 'patientIdStatus.nhsStatusCode.01',
  '02': 'patientIdStatus.nhsStatusCode.02',
  '03': 'patientIdStatus.nhsStatusCode.03',
  '04': 'patientIdStatus.nhsStatusCode.04',
  '05': 'patientIdStatus.nhsStatusCode.05',
  '06': 'patientIdStatus.nhsStatusCode.06',
  '07': 'patientIdStatus.nhsStatusCode.07',
  '08': 'patientIdStatus.nhsStatusCode.08',
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
      labelKey: 'patientIdStatus.label.missing',
      tooltipKey: 'patientIdStatus.tooltip.missing',
      innerKeys: { idType: PATIENT_ID_BY_JURISDICTION[jurisdiction].labelKey },
    };
  }

  if (jurisdiction === 'GB_EW') {
    const result = validateNhsNumber(trimmed);
    if (!result.valid) {
      return {
        color: 'red',
        labelKey: 'patientIdStatus.label.invalid',
        tooltipKey: 'patientIdStatus.tooltip.invalidNhs',
        innerKeys: { reason: result.reasonKey! },
      };
    }
    if (hl7StatusCode) {
      const descriptionKey = NHS_STATUS_CODE_DESCRIPTION_KEY[hl7StatusCode] ?? 'patientIdStatus.nhsStatusCode.unrecognised';
      const color: PatientIdStatusColor = hl7StatusCode === '01' ? 'green' : 'amber';
      return {
        color,
        labelKey: color === 'green' ? 'patientIdStatus.label.verified' : 'patientIdStatus.label.unverified',
        tooltipKey: 'patientIdStatus.tooltip.statusCode',
        tooltipParams: { code: hl7StatusCode },
        innerKeys: { description: descriptionKey },
      };
    }
    // Real, honest state Pete's own table doesn't explicitly name: a
    // format/checksum-valid number with no real HL7 status code known
    // at all (e.g. typed directly at Accession, never resolved
    // through an ADT feed). Deliberately Amber, not Green — passing a
    // local checksum is a genuinely weaker claim than PDS
    // verification, and this app has no real basis to claim the
    // stronger one.
    return { color: 'amber', labelKey: 'patientIdStatus.label.unverified', tooltipKey: 'patientIdStatus.tooltip.nhsNoStatusYet' };
  }

  if (jurisdiction === 'GB_SCT') {
    const result = validateChiNumber(trimmed);
    if (!result.valid) {
      return {
        color: 'red',
        labelKey: 'patientIdStatus.label.invalid',
        tooltipKey: 'patientIdStatus.tooltip.invalidChi',
        innerKeys: { reason: result.reasonKey! },
      };
    }
    return { color: 'green', labelKey: 'patientIdStatus.label.valid', tooltipKey: 'patientIdStatus.tooltip.chiValid' };
  }

  if (jurisdiction === 'GB_NIR') {
    const result = validateHcNumber(trimmed);
    if (!result.valid) {
      return {
        color: 'red',
        labelKey: 'patientIdStatus.label.invalid',
        tooltipKey: 'patientIdStatus.tooltip.invalidHc',
        innerKeys: { reason: result.reasonKey! },
      };
    }
    return { color: 'green', labelKey: 'patientIdStatus.label.valid', tooltipKey: 'patientIdStatus.tooltip.hcValid' };
  }

  // Every other jurisdiction: format-only, no registry-verification
  // concept modeled here yet — see this file's own header comment.
  const formatValid = validateGenericFormat(jurisdiction, trimmed);
  const idTypeKey = PATIENT_ID_BY_JURISDICTION[jurisdiction].labelKey;
  return formatValid
    ? { color: 'green', labelKey: 'patientIdStatus.label.validFormat', tooltipKey: 'patientIdStatus.tooltip.genericValidFormat', innerKeys: { idType: idTypeKey } }
    : { color: 'red', labelKey: 'patientIdStatus.label.invalidFormat', tooltipKey: 'patientIdStatus.tooltip.genericInvalidFormat', innerKeys: { idType: idTypeKey, format: PATIENT_ID_BY_JURISDICTION[jurisdiction].formatKey } };
}
