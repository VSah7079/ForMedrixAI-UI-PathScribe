// src/services/autopsy/getMainBodySpecimen.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "a quick helper like getMainBodySpecimen
// (checking for an explicit designation or falling back to index 0)
// could provide a central place to update that logic system-wide."
// Extracted from SynopticReportPage.tsx's own inline
// caseData.specimens[0] heuristic (used for both the Body Release
// banner's gating and the released specimenId itself) — same real
// reasoning as everywhere else in this app that pure logic doesn't
// live trapped inside a page component.
//
// Real, honest current state: no explicit "this is the body"
// designation exists anywhere on Specimen yet, so this always falls
// back to the first specimen — matching Part B's own Rule Set 4
// convention that the main body/trunk is always Specimen "A", even
// on a multi-specimen case with separately-excised organs also
// present (Specimen B: Brain, Specimen C: Heart, etc.). This
// function is deliberately the one, real, central place to add a
// genuine explicit-designation check first, if one is ever added to
// Specimen — every real caller goes through here rather than each
// reimplementing the same index-0 assumption.
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen } from '@/types/case/Specimen';

export function getMainBodySpecimen(specimens: Specimen[] | undefined): Specimen | undefined {
  if (!specimens || specimens.length === 0) return undefined;
  // Real, deliberate single fallback today — see this file's own
  // header comment for where a real, explicit designation check
  // would be added first, ahead of this line, once one exists.
  return specimens[0];
}
