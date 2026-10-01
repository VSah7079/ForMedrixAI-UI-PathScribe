// src/services/facilityOpsDashboard/computeEmbeddingMicrotomySummary.ts
// PS-288 — Embedding & Microtomy department dashboard. Real, active
// 'Embedding'/'Microtomy / Sectioning' batches for this facility.
// Honest scope: unlike Decal, this app has no real, existing
// per-batch target-duration field for either node, so batches show
// their own real elapsed age, uncolored, rather than inventing an
// SLA target this app has no real source for — see
// IFacilityOpsDashboardTypes.ts's own header.

import { mockBatchService } from '../batches/mockBatchService';
import { buildFacilityLookupMaps } from './buildFacilityLookupMaps';
import { resolveBatchFacilityId } from './resolveBatchFacilityId';
import type { DashboardSummary, DashboardAlert, DashboardQueueItem } from './IFacilityOpsDashboardTypes';

const NODES = new Set(['Embedding', 'Microtomy / Sectioning']);

export async function computeEmbeddingMicrotomySummary(facilityId: string | undefined): Promise<DashboardSummary> {
  const [batchesRes, maps] = await Promise.all([mockBatchService.getAll(), buildFacilityLookupMaps()]);

  const batches = (batchesRes.ok ? batchesRes.data : [])
    .filter(b => b.status === 'active' && NODES.has(b.processingNode))
    .filter(b => !facilityId || resolveBatchFacilityId(b, maps.accessionToFacilityId, maps.stationToFacilityId) === facilityId);

  const alerts: DashboardAlert[] = [];
  const queue: DashboardQueueItem[] = batches.map(b => {
    const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(b.createdAt).getTime()) / 60000));
    if (b.priority === 'STAT') {
      alerts.push({ id: `stat-batch-${b.id}`, severity: 'critical', kind: 'STAT', title: b.masterBarcode, detail: `${b.processingNode} · ${b.items.length} item(s)`, ageMinutes });
    }
    return { id: b.id, label: b.masterBarcode, detail: `${b.processingNode} · ${b.items.length} item(s)`, ageMinutes, isStat: b.priority === 'STAT' };
  }).sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0));

  const embeddingCount = batches.filter(b => b.processingNode === 'Embedding').length;
  const microtomyCount = batches.filter(b => b.processingNode === 'Microtomy / Sectioning').length;
  const totalItems = batches.reduce((sum, b) => sum + b.items.length, 0);

  return {
    asOf: new Date().toISOString(),
    facilityId,
    stats: [
      { id: 'embedding-active', label: 'Embedding Batches', value: embeddingCount },
      { id: 'microtomy-active', label: 'Microtomy Batches', value: microtomyCount },
      { id: 'stat-batches', label: 'STAT Batches', value: batches.filter(b => b.priority === 'STAT').length, state: batches.some(b => b.priority === 'STAT') ? 'overdue' : 'normal' },
      { id: 'total-items', label: 'Cassettes/Slides In Process', value: totalItems },
    ],
    queue,
    alerts,
  };
}
