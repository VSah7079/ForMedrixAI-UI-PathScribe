// src/services/autopsy/resolveAutopsyBodyAlreadyReleased.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "AutopsyBodyReleaseForm.tsx's mounting."
// resolveAutopsyBodyReleaseGate.ts deliberately only checks whether
// release is CURRENTLY ALLOWED (padSnapshot, ancillaryHold) — it
// never tracks whether release has ALREADY happened, since (per its
// own header comment) MaterialLocation has no explicit "released"
// flag; a specimen simply moving to a new location is what would
// free an old one, never a second release event. A real UI mounting
// this form needs this separate, real check too, or it would keep
// offering "Release Body" on a specimen already released — this is
// that real, pure, testable check, kept out of the gate itself so
// that function's own established { allowed, blockedReasons } shape
// stays about eligibility, not history.
// ─────────────────────────────────────────────────────────────────────────────

import type { MaterialLocation } from '@/types/case/Material';

export function resolveAutopsyBodyAlreadyReleased(locationHistory: MaterialLocation[] | undefined): boolean {
  if (!locationHistory || locationHistory.length === 0) return false;
  const mostRecent = [...locationHistory].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )[0];
  return mostRecent.action === 'Released';
}
