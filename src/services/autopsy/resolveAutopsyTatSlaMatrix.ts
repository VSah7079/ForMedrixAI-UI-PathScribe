// src/services/autopsy/resolveAutopsyTatSlaMatrix.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own §4 (Turnaround Time & SLA Matrix)
// — kept to the spec's own exact numbers, never approximated or
// rounded. Where the spec gives a real range (e.g. "14-21 working
// days"), both bounds are exposed rather than collapsed to one
// number — a real admin/report needs to know the honest range, not a
// single figure that quietly picks one side of it.
//
// Pure — no service dependency, real per-jurisdiction lookup table
// only. resolveAncillaryHoldAdjustedDeadline.ts (a later phase) is
// the real function that actually combines this with a case's own
// real arrival timestamp and ancillary-hold history to produce a
// real, working deadline.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

export interface AutopsyTatSlaConfig {
  /** Real, per spec — PAD is always given as a real hour range or a
   *  real "working days" figure; kept in the same real unit the spec
   *  itself states, never silently converted (a "working day" is not
   *  a fixed 24-hour period). */
  padUnit: 'hours' | 'working_days';
  padMin: number;
  padMax: number;
  fadUnit: 'days' | 'working_days';
  fadMin: number;
  fadMax: number;
  complexFadMin: number;
  complexFadMax: number;
  /** Real, per spec's own named governing standard for this row —
   *  kept as real, cited text, never inferred. */
  governingStandard: string;
}

const MATRIX: Record<Jurisdiction, AutopsyTatSlaConfig> = {
  US: { padUnit: 'working_days', padMin: 2, padMax: 2, fadUnit: 'days', fadMin: 60, fadMax: 60, complexFadMin: 90, complexFadMax: 90, governingStandard: 'CAP / CLIA' },
  CA: { padUnit: 'working_days', padMin: 2, padMax: 2, fadUnit: 'days', fadMin: 60, fadMax: 60, complexFadMin: 90, complexFadMax: 90, governingStandard: 'CAP / CLIA' },
  GB_EW: { padUnit: 'hours', padMin: 24, padMax: 48, fadUnit: 'working_days', fadMin: 14, fadMax: 21, complexFadMin: 28, complexFadMax: 42, governingStandard: 'RCPath / HTA' },
  GB_NIR: { padUnit: 'hours', padMin: 24, padMax: 48, fadUnit: 'working_days', fadMin: 14, fadMax: 21, complexFadMin: 28, complexFadMax: 42, governingStandard: 'RCPath / HTA' },
  GB_SCT: { padUnit: 'hours', padMin: 24, padMax: 48, fadUnit: 'working_days', fadMin: 14, fadMax: 14, complexFadMin: 28, complexFadMax: 28, governingStandard: 'COPFS / RCPath' },
  // Real, per direct confirmation: Ireland's own Faculty of Pathology
  // (RCPI) and Irish hospital pathology departments follow and align
  // with RCPath's own clinical guidelines and PAD/FAD turnaround
  // benchmarks directly — despite Ireland's coronial practice
  // operating under its own, separate legislation (Coroners Acts
  // 1962-2019) and the HSE being entirely separate from UK health
  // administration. This is a real, professional-standard alignment,
  // not a legal mandate from RCPath itself — but the real, practical
  // effect is that Ireland's own figures genuinely match GB_EW/
  // GB_NIR's, not a generic "EU" row. Corrects this file's own
  // earlier, honest placeholder (Ireland mapped to the EU row) now
  // that the real figures are confirmed.
  IE: { padUnit: 'hours', padMin: 24, padMax: 48, fadUnit: 'working_days', fadMin: 14, fadMax: 21, complexFadMin: 28, complexFadMax: 42, governingStandard: 'RCPath (via RCPI Faculty of Pathology alignment)' },
  DE: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 30, fadMax: 30, complexFadMin: 60, complexFadMax: 60, governingStandard: 'ISO 15189 / National Acts' },
  FR: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 30, fadMax: 30, complexFadMin: 60, complexFadMax: 60, governingStandard: 'ISO 15189 / National Acts' },
  BE: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 30, fadMax: 30, complexFadMin: 60, complexFadMax: 60, governingStandard: 'ISO 15189 / National Acts' },
  NL: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 30, fadMax: 30, complexFadMin: 60, complexFadMax: 60, governingStandard: 'ISO 15189 / National Acts' },
  AU: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 28, fadMax: 30, complexFadMin: 60, complexFadMax: 90, governingStandard: 'NATA / NZ Coroners Act' },
  NZ: { padUnit: 'hours', padMin: 48, padMax: 48, fadUnit: 'days', fadMin: 28, fadMax: 30, complexFadMin: 60, complexFadMax: 90, governingStandard: 'NATA / NZ Coroners Act' },
  KR: { padUnit: 'hours', padMin: 24, padMax: 48, fadUnit: 'days', fadMin: 14, fadMax: 30, complexFadMin: 45, complexFadMax: 45, governingStandard: 'KCDC / Act on Funeral Services' },
};

export function resolveAutopsyTatSlaMatrix(jurisdiction: Jurisdiction): AutopsyTatSlaConfig {
  return MATRIX[jurisdiction];
}
