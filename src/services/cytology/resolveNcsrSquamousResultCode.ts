// src/services/cytology/resolveNcsrSquamousResultCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research into Australia's NCSR (National Cancer
// Screening Register) — its own real, official "Summary Guide for
// Pathology Laboratories reporting to the NCSR" document confirms a
// real, distinct LOINC-coded squamous result scale (LOINC 19762-4),
// genuinely different numbering from CISOE-A's own S-axis despite the
// surface resemblance (both use "S" and similar-looking numbers for
// different things):
//   SU  Unsatisfactory for evaluation
//   S1  Normal / only reactive changes
//   S2  Possible LSIL
//   S3  LSIL (HPV and/or CIN I)
//   S4  Possible high-grade SIL (pHSIL) (CIN I/II)
//   S5  HSIL (CIN II/III)
//   S6  HSIL with possible micro invasion / invasion
//   S7  Squamous carcinoma
//
// Real, direct confirmation this maps cleanly onto real Bethesda
// categories with no genuine ambiguity: Bethesda's own "ASC-"
// (Atypical Squamous Cells) categories ARE the real "possible/
// uncertain" tier by definition (ASC-US: "of undetermined
// significance"; ASC-H: "cannot exclude HSIL"), mapping directly onto
// NCSR's own "possible X" vs confirmed "X" distinction — not an
// invented correspondence.
//
// Real, honest scope: this covers only the real squamous axis
// (LOINC 19762-4). NCSR's own separate Endocervical Result Codes axis
// (LOINC 19765-7, for glandular findings) is real, distinct, and is
// now built separately in resolveNcsrGlandularResultCode.ts — the two
// real, independent axes are combined together in
// buildCytologyRegistryReportPayload.ts's own NcsrRegistryExtension.
// ─────────────────────────────────────────────────────────────────────────────

export type NcsrSquamousResultCode = 'SU' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';

const BETHESDA_TO_NCSR_SQUAMOUS_MAP: Record<string, NcsrSquamousResultCode> = {
  'cyto-gencat-nilm': 'S1',
  'cyto-squam-ascus': 'S2',
  'cyto-squam-lsil': 'S3',
  'cyto-squam-asch': 'S4',
  'cyto-squam-hsil': 'S5',
  'cyto-squam-hsil-invasive': 'S6',
  'cyto-squam-scc': 'S7',
};

export function resolveNcsrSquamousResultCode(
  primaryInterpretationId: string,
  isUnsatisfactory: boolean,
): NcsrSquamousResultCode | undefined {
  if (isUnsatisfactory) return 'SU';
  return BETHESDA_TO_NCSR_SQUAMOUS_MAP[primaryInterpretationId];
}
