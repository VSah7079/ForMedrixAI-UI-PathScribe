// src/utils/isEncounterActive.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Encounter Selector &
// Auto-Fill" — Safety Safeguards, "Strict Matching & Active Status
// Constraints." Extracted from AccessionPage.tsx into its own, dedicated,
// tested utility — this is the one piece of the whole feature where getting
// it wrong has real, direct consequences (a stale, historical encounter
// silently populating today's case with outdated facility/location/provider
// data, exactly the scenario the spec's own worked example calls out), so it
// gets the same isolated, unit-tested treatment as this session's other
// safety-relevant pure functions (isoDateForSearch, normalizeIdForSearch)
// rather than living untested inside the page component.
//
// An encounter only counts as "active" — eligible to auto-load or appear as
// a selectable candidate at all — if it's genuinely both currently ongoing
// AND recent. EncounterStatus's real values (services/encounters/
// IEncounterService.ts): 'Arrived' and 'In-Progress' map to the spec's own
// "Inpatient/Admitted, In-Procedure/Day Surgery, Active Emergency."
// 'Planned' is deliberately excluded — the patient hasn't arrived yet, so
// there's nothing real to auto-fill from. 'Discharged'/'Cancelled' are the
// real, explicit "historical, don't auto-load" case the spec's own example
// names directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { Encounter } from '@/services/encounters/IEncounterService';

/** The wider end of the spec's own "24–48 hours" time-horizon range. */
export const ENCOUNTER_ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** True only if `encounter` is both a real, currently-active status AND
 *  within the recency window — applied against whichever real timestamp is
 *  more current: lastEventAt (the true, source-system time of the most
 *  recent real ADT update) if the encounter has one, admitTime otherwise.
 *  `nowMs` is an explicit parameter (rather than reading Date.now()
 *  internally) so this stays a pure, deterministic function — real for
 *  testing time-boundary behavior without faking the system clock. */
export function isEncounterActive(encounter: Encounter, nowMs: number): boolean {
  if (encounter.status !== 'Arrived' && encounter.status !== 'In-Progress') return false;
  const referenceTime = encounter.lastEventAt ?? encounter.admitTime;
  if (!referenceTime) return false;
  const ageMs = nowMs - new Date(referenceTime).getTime();
  return ageMs >= 0 && ageMs <= ENCOUNTER_ACTIVE_WINDOW_MS;
}
