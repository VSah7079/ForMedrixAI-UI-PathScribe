// src/services/facilityOpsDashboard/computeStainingIhcSummary.ts
// PS-288 — Staining & IHC department dashboard. Real, active
// 'Staining'/'Cytology Staining' batches, plus a real, per-status
// breakdown of every StainOrder currently in this facility's own
// cases (QC Failed / Recut Requested / Ready for Review counts) —
// real, existing StainOrderStatus values, never a new one.
//
// Honest, deliberate scope cut: StainOrder.stainName is documented
// (types/case/Specimen.ts) as a real display-name string, NOT yet a
// real foreign key into the Stain Dictionary (StainType.id) — an
// already-known, separate gap, not something this ticket fixes. A
// reliable Routine/Special-Stain/IHC/Molecular category breakdown
// would need that real FK to be trustworthy; this dashboard reports
// by StainOrderStatus instead (a real, clean, already-reliable field)
// rather than building a name-matching heuristic on top of a known,
// unreliable join.

import { mockBatchService } from '../batches/mockBatchService';
import { buildFacilityLookupMaps } from './buildFacilityLookupMaps';
import { resolveBatchFacilityId } from './resolveBatchFacilityId';
import type { DashboardSummary, DashboardAlert, DashboardQueueItem } from './IFacilityOpsDashboardTypes';

const NODES = new Set(['Staining', 'Cytology Staining']);

export async function computeStainingIhcSummary(facilityId: string | undefined): Promise<DashboardSummary> {
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
    if (b.qcVisualReadConfirmation === undefined && b.processingNode === 'Staining') {
      // Real, informational only — not every batch needs the visual
      // QC gate (StainType.qcEnforcementMode / WorkstationGroup's own
      // default may leave it not-applicable), so this stays out of
      // `alerts` and is left for the batch's own dedicated QC gate
      // page (resolveStainQcGate.ts) to actually adjudicate.
    }
    return { id: b.id, label: b.masterBarcode, detail: `${b.processingNode} · ${b.items.length} item(s)`, ageMinutes, isStat: b.priority === 'STAT' };
  }).sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0));

  let readyForReview = 0, qcFailed = 0, recutRequested = 0, staining = 0;
  for (const c of maps.casesById.values()) {
    if (facilityId && c.originHospitalId !== facilityId) continue;
    for (const specimen of c.specimens ?? []) {
      for (const block of specimen.blocks ?? []) {
        for (const stain of block.stains ?? []) {
          if (stain.status === 'Ready for Review') readyForReview++;
          else if (stain.status === 'QC Failed') {
            qcFailed++;
            alerts.push({
              id: `qc-failed-${c.id}-${stain.id}`, severity: 'critical', kind: 'QC Failed',
              title: c.accession?.fullAccession ?? c.id, detail: `${specimen.label}${block.label} — ${stain.stainName}`,
            });
          } else if (stain.status === 'Recut Requested') {
            recutRequested++;
            alerts.push({
              id: `recut-${c.id}-${stain.id}`, severity: 'warning', kind: 'Recut Requested',
              title: c.accession?.fullAccession ?? c.id, detail: `${specimen.label}${block.label} — ${stain.stainName}`,
            });
          } else if (stain.status === 'Staining') staining++;
        }
      }
    }
  }

  return {
    asOf: new Date().toISOString(),
    facilityId,
    stats: [
      { id: 'staining-active', label: 'Active Staining Batches', value: batches.filter(b => b.processingNode === 'Staining').length },
      { id: 'cytology-staining-active', label: 'Cytology Staining Batches', value: batches.filter(b => b.processingNode === 'Cytology Staining').length },
      { id: 'in-staining', label: 'Slides In Staining', value: staining },
      { id: 'ready-for-review', label: 'Ready for Review', value: readyForReview },
      { id: 'recut-requested', label: 'Recut Requested', value: recutRequested, state: recutRequested > 0 ? 'warning' : 'normal' },
      { id: 'qc-failed', label: 'QC Failed', value: qcFailed, state: qcFailed > 0 ? 'overdue' : 'normal' },
    ],
    queue,
    alerts,
  };
}
