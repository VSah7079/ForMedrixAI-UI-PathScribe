// src/services/cytology/resolveNcsrGlandularResultCode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct research into Australia's NCSR (National Cancer
// Screening Register) — closes the real, confirmed gap
// resolveNcsrSquamousResultCode.ts's own header names directly ("NCSR's
// own separate Endocervical Result Codes axis (LOINC 19765-7)... not
// built here"). Real, official Australian government source (AIHW —
// Australian Institute of Health and Welfare, both the 2025 NCSP
// monitoring report glossary and the 2018 "Cervical screening in
// Australia" report), cross-confirmed across both real, independent
// publications:
//   EU  Unsatisfactory
//   E0  No endocervical component (real specimen-adequacy concept —
//       see this file's own honest scope note below)
//   E1  Negative
//   E2  Atypical endocervical cells of uncertain significance
//   E3  Possible high-grade endocervical glandular lesion
//   E4  Adenocarcinoma in situ
//   E5  Adenocarcinoma in situ with possible microinvasion/invasion
//   E6  Adenocarcinoma
//
// Real, honest scope, matching the squamous resolver's own established
// discipline:
//   - E0 is a real, distinct specimen-ADEQUACY concept ("no endocervical
//     cells present"), not an interpretation this function's own real,
//     interpretation-id-based inputs can determine — never guessed at
//     from an interpretation id, which is never what E0 actually means.
//   - E5 (AIS with possible microinvasion/invasion) is a real,
//     genuinely intermediate NCSR-specific tier with no clean,
//     dedicated Bethesda dictionary equivalent in this app's own
//     45-entry Bethesda seed data — Bethesda treats AIS and invasive
//     adenocarcinoma as distinct categories, not a graded
//     "AIS-with-possible-invasion" middle state. Left honestly
//     unmapped rather than forced onto either E4 or E6.
//   - Real, deliberate difference from the squamous resolver's own
//     single-argument shape: a genuine glandular finding is
//     frequently NOT the primary interpretation on a real, mixed case
//     (Bethesda's own "most severe finding is primary" rule means a
//     co-occurring, more severe squamous finding often wins the
//     primary slot) — so this function checks additionalInterpretationIds
//     too, not primaryInterpretationId alone.
// ─────────────────────────────────────────────────────────────────────────────

export type NcsrGlandularResultCode = 'EU' | 'E1' | 'E2' | 'E3' | 'E4' | 'E6';

// Real, per direct research: only entries with a genuinely confirmed,
// explicit endocervical (or unspecified-glandular, which real NCSR
// reporting practice defaults to the endocervical axis absent a
// stated endometrial/extrauterine origin) source. Explicitly
// endometrial (cyto-gland-atyp-endometrial, cyto-gland-adenoca-endometrial)
// and extrauterine (cyto-gland-adenoca-extrauterine) entries are
// deliberately excluded — their own real, stated origin is not
// endocervical, and folding them in here would be a real, silent
// misattribution.
const BETHESDA_TO_NCSR_GLANDULAR_MAP: Record<string, NcsrGlandularResultCode> = {
  'cyto-gland-atyp-endocervical': 'E2',
  'cyto-gland-atyp-glandular-nos': 'E2',
  'cyto-gland-atyp-endocervical-neo': 'E3',
  'cyto-gland-atyp-glandular-neo': 'E3',
  'cyto-gland-ais': 'E4',
  'cyto-gland-adenoca-endocervical': 'E6',
  'cyto-gland-adenoca-nos': 'E6',
};

export function resolveNcsrGlandularResultCode(
  primaryInterpretationId: string,
  additionalInterpretationIds: string[],
  isUnsatisfactory: boolean,
): NcsrGlandularResultCode | undefined {
  if (isUnsatisfactory) return 'EU';
  if (primaryInterpretationId === 'cyto-gencat-nilm') return 'E1';
  return BETHESDA_TO_NCSR_GLANDULAR_MAP[primaryInterpretationId]
    ?? additionalInterpretationIds
      .map(id => BETHESDA_TO_NCSR_GLANDULAR_MAP[id])
      .find((code): code is NcsrGlandularResultCode => code !== undefined);
}
