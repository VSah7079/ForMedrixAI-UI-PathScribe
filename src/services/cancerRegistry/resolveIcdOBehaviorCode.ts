// src/services/cancerRegistry/resolveIcdOBehaviorCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research while scoping the RFP-APLIS-2026-GLOBAL
// Broader Cancer Registry Exports gap — confirmed directly
// (FHIR_DISPATCH_ARCHITECTURE_PLAN.md's own flagged, unconfirmed
// question) that this app never captured an ICD-O-3 code's own real
// behavior digit anywhere. A real ICD-O-3 morphology code is always
// written in its own, standard combined form — e.g. "8500/3" — so the
// behavior digit is parsed directly from the code string itself
// (synopticTypes.ts's own MedicalCode.code), never a separate,
// hand-maintained field that could drift out of sync with it.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, standard ICD-O-3 behavior digits (WHO ICD-O-3 manual):
 *  0 = benign; 1 = uncertain whether benign or malignant (borderline/
 *  low malignant potential); 2 = carcinoma in situ; 3 = malignant,
 *  primary site; 6 = malignant, metastatic site (rare in a primary
 *  pathology report); 9 = malignant, uncertain whether primary or
 *  metastatic. */
export type IcdOBehaviorCode = '0' | '1' | '2' | '3' | '6' | '9';

const VALID_BEHAVIOR_CODES: IcdOBehaviorCode[] = ['0', '1', '2', '3', '6', '9'];

/** Real, honest parse: returns null for anything that isn't a
 *  genuinely well-formed "morphology/behavior" ICD-O-3 code — never
 *  guesses a behavior digit that isn't actually present in the code
 *  string. */
export function resolveIcdOBehaviorCode(icdOCode: string): IcdOBehaviorCode | null {
  const match = /^\s*[Mm]?\d{4}\/(\d)\s*$/.exec(icdOCode);
  if (!match) return null;
  const digit = match[1] as IcdOBehaviorCode;
  return VALID_BEHAVIOR_CODES.includes(digit) ? digit : null;
}
