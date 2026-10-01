// src/services/facilityOpsDashboard/computeGrossingIntakeSummary.ts
// PS-288 — Grossing & Intake department dashboard. Reuses the real,
// already-facility-scoped computePendingBatchQueue.ts directly for
// the pending-intake queue (rather than re-deriving it) and adds the
// real, active 'Processing'/'Decal / Special Processing'/'Checkout'
// batches for this facility on top, with a real SLA countdown for
// decal batches (the one real, existing target-duration field) and
// an honest, uncolored age for the rest — see
// IFacilityOpsDashboardTypes.ts's own header for why no fabricated
// target is invented for the others.

import { computePendingBatchQueue } from '../batches/computePendingBatchQueue';
import { mockBatchService } from '../batches/mockBatchService';
import { buildFacilityLookupMaps } from './buildFacilityLookupMaps';
import { resolveBatchFacilityId } from './resolveBatchFacilityId';
import { computeSlaCountdown } from './computeSlaCountdown';
import type { DashboardSummary, DashboardAlert, DashboardQueueItem } from './IFacilityOpsDashboardTypes';

const INTAKE_BATCH_NODES = new Set(['Decal / Special Processing', 'Processing', 'Checkout']);

export async function computeGrossingIntakeSummary(facilityId: string | undefined): Promise<DashboardSummary> {
  const [pendingQueue, batchesRes, maps] = await Promise.all([
    computePendingBatchQueue(facilityId),
    mockBatchService.getAll(),
    buildFacilityLookupMaps(),
  ]);

  const statCases = new Set<string>();
  for (const c of maps.casesById.values()) {
    if (c.order?.priority === 'STAT' && (!facilityId || c.originHospitalId === facilityId)) statCases.add(c.id);
  }

  const alerts: DashboardAlert[] = [];
  let statPendingCount = 0;
  for (const item of pendingQueue) {
    if (statCases.has(item.caseId)) {
      statPendingCount++;
      alerts.push({
        id: `pending-stat-${item.key}`, severity: 'critical', kind: 'STAT',
        title: item.caseAccession, detail: `${item.specimenLabel} — awaiting intake (${item.materialType})`,
      });
    }
  }

  const batches = (batchesRes.ok ? batchesRes.data : [])
    .filter(b => b.status === 'active' && INTAKE_BATCH_NODES.has(b.processingNode))
    .filter(b => !facilityId || resolveBatchFacilityId(b, maps.accessionToFacilityId, maps.stationToFacilityId) === facilityId);

  const queue: DashboardQueueItem[] = batches.map(b => {
    const item: DashboardQueueItem = {
      id: b.id, label: b.masterBarcode, detail: `${b.processingNode} · ${b.items.length} item(s)`,
      isStat: b.priority === 'STAT',
    };
    if (b.processingNode === 'Decal / Special Processing' && b.targetDurationMinutes != null) {
      const sla = computeSlaCountdown(b.createdAt, b.targetDurationMinutes);
      item.ageMinutes = sla.elapsedMinutes; item.slaState = sla.state; item.remainingMinutes = sla.remainingMinutes;
      if (sla.state === 'overdue') {
        alerts.push({ id: `decal-overdue-${b.id}`, severity: 'critical', kind: 'Decal Overdue', title: b.masterBarcode, detail: b.protocol, ageMinutes: sla.elapsedMinutes });
      }
    } else {
      item.ageMinutes = Math.max(0, Math.round((Date.now() - new Date(b.createdAt).getTime()) / 60000));
    }
    return item;
  }).sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0));

  const decalCount = batches.filter(b => b.processingNode === 'Decal / Special Processing').length;
  const processingCount = batches.filter(b => b.processingNode === 'Processing').length;

  return {
    asOf: new Date().toISOString(),
    facilityId,
    stats: [
      { id: 'pending-intake', label: 'Pending Intake', value: pendingQueue.length, state: statPendingCount > 0 ? 'overdue' : undefined },
      { id: 'stat-pending', label: 'STAT Pending', value: statPendingCount, state: statPendingCount > 0 ? 'overdue' : 'normal' },
      { id: 'decal-active', label: 'Decal / Special Processing', value: decalCount },
      { id: 'processing-active', label: 'Processing Batches', value: processingCount },
    ],
    queue,
    alerts,
  };
}
