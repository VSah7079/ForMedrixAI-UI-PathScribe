// src/services/autopsy/buildAutopsyBodyReleaseLocationEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own established "body is a specimen"
// architecture (per direct guidance: "Isn't the body usually the
// specimen? And we track specimen level!") — the real release event
// itself is just a new, real MaterialLocation (types/case/Material.ts)
// entry appended to the body's own Specimen.locationHistory, never a
// new, parallel case-level field.
//
// Real, deliberate scope: this is NOT wired through
// processMaterialLocationEvent.ts's own Asset Location Dictionary
// lookup (services/assetLocation/) — that dictionary is real,
// governed INTERNAL physical locations (storage units, workstations,
// archive shelves) within the lab's own facility. A funeral home or
// "released to family" is a real, external, third-party destination,
// never itself a real internal asset location — matching this exact
// external/internal distinction on purpose, not by oversight.
//
// Real, deliberate scope: only ever called after
// resolveAutopsyBodyReleaseGate.ts confirms release is allowed — kept
// as a real, separate, decoupled function (never entangled with the
// gate check itself), same reasoning as
// resolveAutopsyIntakeFormValidation.ts / buildAutopsyCaseDetailsFromIntakeForm.ts
// already being kept separate.
// ─────────────────────────────────────────────────────────────────────────────

import type { MaterialLocation } from '@/types/case/Material';

export interface AutopsyBodyReleaseDetails {
  /** Real, free text — the real, external destination (e.g. "Smith
   *  Family Funeral Home", "Released directly to next of kin"). Never
   *  matched against the Asset Location Dictionary — see this file's
   *  own header comment for why. */
  releasedTo: string;
  releasedByName: string;
  /** Defaults to real "now" so a real caller releasing a body in the
   *  moment never has to supply this — same real default pattern
   *  resolveCytologySignOutGate.ts's own asOfDate already uses. */
  releasedAt?: string;
}

export function buildAutopsyBodyReleaseLocationEvent(details: AutopsyBodyReleaseDetails): MaterialLocation {
  return {
    location: details.releasedTo,
    action: 'Released',
    at: details.releasedAt ?? new Date().toISOString(),
    source: 'PathScribe',
    performedByName: details.releasedByName,
  };
}
