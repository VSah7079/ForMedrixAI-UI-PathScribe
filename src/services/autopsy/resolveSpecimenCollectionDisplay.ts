// src/services/autopsy/resolveSpecimenCollectionDisplay.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Where collection date/time is missing,
// LIS systems typically substitute a standard fallback string (e.g.,
// 'Date Not Provided') and coronial reporting includes a note that
// specimen stability or timing cannot be verified."
//
// Real, deliberate — this is NOT the same as utils/formatDate.ts's own
// existing "—" fallback for a missing date. That's the right, casual
// answer for ordinary UI display; a coronial/medicolegal document
// needs an explicit, human-readable statement of absence plus a real
// disclaimer, since specimen timing genuinely bears on the document's
// own evidentiary weight — this is a real, distinct requirement for
// autopsy/coronial reporting specifically, not a general date-display
// preference. Reuses formatDateTime() for the real, present-date case
// rather than reimplementing jurisdiction-aware formatting here.
// ─────────────────────────────────────────────────────────────────────────────

import { formatDateTime, localeForJurisdiction } from '@/utils/formatDate';
import type { Jurisdiction } from '@/types/systemConfig';

export interface SpecimenCollectionDisplay {
  displayText: string;
  isMissing: boolean;
  /** Real, per direct guidance — only ever present when the date is
   *  genuinely missing AND this is a coronial/medicolegal report
   *  context. Never attached to a routine, non-coronial display of
   *  the same missing date — that stays a plain, casual gap
   *  elsewhere in the app, not a legal disclaimer. */
  stabilityDisclaimer?: string;
}

export function resolveSpecimenCollectionDisplay(
  collectedAt: string | undefined,
  jurisdiction: Jurisdiction,
  context: 'coronial_report' | 'general',
): SpecimenCollectionDisplay {
  if (!collectedAt) {
    return {
      displayText: 'Date Not Provided',
      isMissing: true,
      stabilityDisclaimer: context === 'coronial_report'
        ? 'Specimen collection date/time was not recorded. Specimen stability and timing cannot be verified.'
        : undefined,
    };
  }
  return {
    displayText: formatDateTime(collectedAt, localeForJurisdiction(jurisdiction)),
    isMissing: false,
  };
}
