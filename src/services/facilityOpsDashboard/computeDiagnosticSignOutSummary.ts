// src/services/facilityOpsDashboard/computeDiagnosticSignOutSummary.ts
// PS-288 — Diagnostic Sign-Out / Scanner dashboard. Real WsiScanBatch/
// WsiScanSlide status tracking. Confirmed directly before building:
// WsiScanBatch carries no direct facilityId of its own — only each
// real slide has a caseId — so facility scoping joins per-slide
// through Case.originHospitalId, the same real pattern
// computePendingBatchQueue.ts and resolveBatchFacilityId.ts both use.
// A batch is included whenever it has at least one real slide for
// this facility.

import { mockWsiScanBatchService } from '../digitalPathology/mockWsiScanBatchService';
import { buildFacilityLookupMaps } from './buildFacilityLookupMaps';
import type { DashboardSummary, DashboardAlert, DashboardQueueItem } from './IFacilityOpsDashboardTypes';

export async function computeDiagnosticSignOutSummary(facilityId: string | undefined): Promise<DashboardSummary> {
  const [batchesRes, maps] = await Promise.all([mockWsiScanBatchService.getAll(), buildFacilityLookupMaps()]);

  let pending = 0, scanning = 0, completed = 0, failed = 0, qcFailedSlides = 0;
  const alerts: DashboardAlert[] = [];
  const queue: DashboardQueueItem[] = [];

  for (const b of (batchesRes.ok ? batchesRes.data : [])) {
    const relevantSlides = b.slides.filter(s => {
      if (!facilityId) return true;
      const c = maps.casesById.get(s.caseId);
      return c ? c.originHospitalId === facilityId : false;
    });
    if (relevantSlides.length === 0) continue;
    if (b.status === 'unloaded') continue; // real, honest exclusion — the run is fully done and unloaded, nothing left to watch here

    for (const s of relevantSlides) {
      if (s.scanStatus === 'pending') pending++;
      else if (s.scanStatus === 'scanning') scanning++;
      else if (s.scanStatus === 'completed') { completed++; if (s.qcPassed === false) qcFailedSlides++; }
      else if (s.scanStatus === 'failed') {
        failed++;
        alerts.push({ id: `scan-failed-${b.id}-${s.slidePosition}`, severity: 'critical', kind: 'Scan Failed', title: b.batchBarcode, detail: `${s.slidePosition}${s.failureReason ? ` — ${s.failureReason}` : ''}` });
      }
      if (s.scanStatus === 'completed' && s.qcPassed === false) {
        alerts.push({ id: `scan-qc-${b.id}-${s.slidePosition}`, severity: 'warning', kind: 'Scan QC Failed', title: b.batchBarcode, detail: `${s.slidePosition}${s.failureReason ? ` — ${s.failureReason}` : ''}` });
      }
    }

    const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(b.loadedAt).getTime()) / 60000));
    queue.push({
      id: b.id, label: b.batchBarcode,
      detail: `${b.status} · ${relevantSlides.length} slide(s)`,
      ageMinutes,
    });
  }

  queue.sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0));

  return {
    asOf: new Date().toISOString(),
    facilityId,
    stats: [
      { id: 'pending', label: 'Pending', value: pending },
      { id: 'scanning', label: 'Scanning', value: scanning },
      { id: 'completed', label: 'Completed', value: completed },
      { id: 'failed', label: 'Scan Failed', value: failed, state: failed > 0 ? 'overdue' : 'normal' },
      { id: 'qc-failed', label: 'Image QC Failed', value: qcFailedSlides, state: qcFailedSlides > 0 ? 'warning' : 'normal' },
    ],
    queue,
    alerts,
  };
}
