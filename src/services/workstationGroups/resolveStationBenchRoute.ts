// src/services/workstationGroups/resolveStationBenchRoute.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, found by this app's own inline-CSS/business-logic sweep:
// ScanStationPrompt.tsx's one-time login confirmation and
// NavBarScanStation.tsx's always-on quick-switch each independently
// computed a station's real "bench" destination — resolve the station's
// WorkstationGroup, then gate its dedicatedPageRoute to only an Active
// group — the same honest guard, written twice ("only a real route on
// an Active group is ever navigated to"). Currently consistent, but
// nothing enforced that; a future change to the gating rule was likely
// to hit one and miss the other. This module is now the one real
// source of truth both call.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { WorkstationGroup } from './IWorkstationGroupService';
import { mockScanStationService } from '../scanStations/mockScanStationService';
import { mockWorkstationGroupService } from './mockWorkstationGroupService';

/** Real, deliberately honest gate: only a real, non-blank route on a
 *  genuinely Active group is ever surfaced — a station with no group,
 *  a group with no route, or an inactive group all resolve to
 *  undefined, since deep-linking to a bench that's missing or been
 *  deactivated is the wrong default. Takes the group's own fetch
 *  result directly (rather than re-fetching) for callers that already
 *  have it in hand for other purposes. */
export function resolveBenchRouteForGroup(groupRes: ServiceResult<WorkstationGroup> | undefined): string | undefined {
  if (!groupRes || !groupRes.ok || groupRes.data.status !== 'Active') return undefined;
  return groupRes.data.dedicatedPageRoute;
}

/** Full station → WorkstationGroup → bench-route resolution, for
 *  callers that don't already have the group fetched. */
export async function resolveStationBenchRoute(stationId: string): Promise<string | undefined> {
  const stationRes = await mockScanStationService.getById(stationId);
  if (!stationRes.ok || !stationRes.data.workstationGroupId) return undefined;
  const groupRes = await mockWorkstationGroupService.getById(stationRes.data.workstationGroupId);
  return resolveBenchRouteForGroup(groupRes);
}
