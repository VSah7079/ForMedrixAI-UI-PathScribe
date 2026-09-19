// src/services/reports/dispatchPreliminaryCaseInstances.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("Component A refinement: formalize a
// real Report_Released_Event") — extracted directly from
// releasePreliminaryReport.ts's own original dispatch loop, unchanged
// in behavior, so that both releasePreliminaryReport.ts (which owns
// the real, Preliminary-specific guards and attestation-field write)
// and publishReportReleasedEvent.ts (the new, real, shared trigger
// point) can call the same, real dispatch logic — never two, slightly
// different copies of it.
//
// Mirrors dispatchCaseInstances.ts's own real shape and naming
// convention, with one deliberate difference: returns a real count
// rather than void, since a Preliminary release's own real caller (the
// UI) needs an honest number to report back to the pathologist ("2
// specimens released" vs. a false, generic success).
//
// Real, deliberate: no dedup check here, unlike the strict,
// one-time-only FINAL dispatch in dispatchCaseInstances.ts. A
// pathologist may legitimately release more than one Preliminary
// report for the same instance as findings develop (the acute
// leukemia bone marrow case, released again once flow cytometry's own
// partial results come back) — each is its own, real, separately
// timestamped message, not a re-send of the same one.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { buildOruR01Payload } from './buildOruR01Payload';
import { mockOutboundResultQueueService } from './mockOutboundResultQueueService';
import { dispatchInterfaceMessage } from '../interfaceDispatch/dispatchInterfaceMessage';

export async function dispatchPreliminaryCaseInstances(caseId: string): Promise<number> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return 0;

  const instances = caseData.synopticReports ?? [];
  let dispatchedCount = 0;

  for (const instance of instances) {
    const payload = await buildOruR01Payload(caseId, instance.instanceId, 'PRELIMINARY');
    if (!payload) continue;

    const enqueueRes = await mockOutboundResultQueueService.enqueue({
      caseId,
      instanceId: instance.instanceId,
      resultState: 'PRELIMINARY',
      organisationId: (caseData as any)?.patient?.organisationId,
    });
    if (!enqueueRes.ok) continue;

    await dispatchInterfaceMessage(enqueueRes.data.id, 'ORU_R01', payload);
    dispatchedCount++;
  }

  return dispatchedCount;
}
