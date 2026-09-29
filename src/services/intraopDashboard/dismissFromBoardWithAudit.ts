// src/services/intraopDashboard/dismissFromBoardWithAudit.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: dismissing a case from the OR Suite Live Board — the dismissal
// itself, then its OR event-log / audit record — moved out of the page.
// The dismissal is what every other board sees (it publishes a live
// update); the event log records who did it, the read-back and the
// turnaround. If the dismissal succeeds but the log write fails, that is
// reported rather than ignored.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { IIntraoperativeService } from '../intraop/IIntraoperativeService';
import type { IOrEventLogService } from './IOrEventLogService';
import type { ActiveIntraopRequest } from './resolveActiveIntraopRequestsForLocations';
import { resolveDismissalTatMetrics } from './resolveDismissalTatMetrics';

export type DismissOutcome = 'dismissed' | 'dismissedLogFailed' | 'refused';

export async function dismissFromBoardWithAudit(
  request: ActiveIntraopRequest,
  staff: { id: string; name: string },
  deps: { intraoperativeService: Pick<IIntraoperativeService, 'dismissFromBoard'>; orEventLogService: Pick<IOrEventLogService, 'record'> },
): Promise<{ outcome: DismissOutcome; detail?: string }> {
  const res = await deps.intraoperativeService.dismissFromBoard(request.sessionId, request.specimenId, staff.id, staff.name, true);
  if (res.ok === false) return { outcome: 'refused', detail: 'error' in res ? String(res.error) : undefined };

  const { dwellTimeOnBoardSeconds, totalTurnaroundMinutes } = resolveDismissalTatMetrics(request);
  let logged: ServiceResult<unknown> | undefined;
  try {
    logged = await deps.orEventLogService.record({
      locationId: request.locationId, intraopEntryId: request.sessionId, eventType: 'case_dismissed',
      staffUserId: staff.id, staffUserName: staff.name,
      accessionNumber: request.orNumber, orRoom: request.locationDisplay,
      pathologistSignOffTime: request.frozenDiagnosisRenderedAt,
      dwellTimeOnBoardSeconds, totalTurnaroundMinutes,
      surgeonReadbackConfirmed: true, finalPreliminaryText: request.frozenSectionDiagnosis,
    });
  } catch (e) {
    return { outcome: 'dismissedLogFailed', detail: String(e) };
  }
  if (!logged || logged.ok === false) return { outcome: 'dismissedLogFailed', detail: logged && 'error' in logged ? String(logged.error) : undefined };
  return { outcome: 'dismissed' };
}
