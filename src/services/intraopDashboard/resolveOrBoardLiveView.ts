// src/services/intraopDashboard/resolveOrBoardLiveView.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: decisions the OR Suite Live Board used to make inline, moved here
// when the board moved to live updates.
//   • resolveBoardLocationIds — which OR locations this board shows (and so
//     subscribes to): its own, or the Multi-Suite picks when the terminal
//     is allowed that view.
//   • resolveFlashState — the "3-pulse flash" plays once, when a specimen's
//     diagnosis first appears, whichever device rendered it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';

export function resolveBoardLocationIds(input: {
  terminal: { locationId: string; canViewMultiSuite: boolean } | null;
  multiSuiteOn: boolean;
  multiSuiteLocationIds: readonly string[];
}): string[] {
  const { terminal } = input;
  if (!terminal) return [];
  if (input.multiSuiteOn && terminal.canViewMultiSuite && input.multiSuiteLocationIds.length > 0) {
    return [...input.multiSuiteLocationIds];
  }
  return [terminal.locationId];
}

/**
 * `flashed` holds specimens whose flash has already played. A specimen
 * whose diagnosis is newly rendered since the last refresh is taken out
 * of it so its flash plays now; `rendered` is remembered for next time.
 */
export function resolveFlashState(
  previouslyRendered: ReadonlySet<string>,
  next: readonly ActiveIntraopRequest[],
  flashed: ReadonlySet<string>,
): { flashed: Set<string>; rendered: Set<string> } {
  const stillFlashed = new Set(flashed);
  const rendered = new Set<string>();
  for (const r of next) {
    if (!r.diagnosisRendered) continue;
    rendered.add(r.specimenId);
    if (!previouslyRendered.has(r.specimenId)) stillFlashed.delete(r.specimenId);
  }
  return { flashed: stillFlashed, rendered };
}
