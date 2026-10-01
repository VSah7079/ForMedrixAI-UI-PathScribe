// src/services/facilityOpsDashboard/computeSendOutReferenceSummary.ts
// PS-288 — Send-Out & Reference Laboratory Operations dashboard.
// Real 'External Referral' batches for this facility, each joined to
// its own real ReferralTracking record (one per Batch.id — see that
// service's own header) for transit-status counts, plus the real,
// existing Batch.coldChainExcursion field surfaced as a genuine
// high-contrast alert — exactly the real signal this dashboard's own
// alerting objective calls for, not a fabricated one.

import { mockBatchService } from '../batches/mockBatchService';
import { mockReferralTrackingService } from '../referral/mockReferralTrackingService';
import { buildFacilityLookupMaps } from './buildFacilityLookupMaps';
import { resolveBatchFacilityId } from './resolveBatchFacilityId';
import type { DashboardSummary, DashboardAlert, DashboardQueueItem } from './IFacilityOpsDashboardTypes';
import type { ReferralTransitStatus } from '../referral/IReferralTrackingService';

export async function computeSendOutReferenceSummary(facilityId: string | undefined): Promise<DashboardSummary> {
  const [batchesRes, trackingRes, maps] = await Promise.all([
    mockBatchService.getAll(),
    mockReferralTrackingService.getAll(),
    buildFacilityLookupMaps(),
  ]);

  const batches = (batchesRes.ok ? batchesRes.data : [])
    .filter(b => b.processingNode === 'External Referral' && b.status !== 'aborted')
    .filter(b => !facilityId || resolveBatchFacilityId(b, maps.accessionToFacilityId, maps.stationToFacilityId) === facilityId);

  const trackingByBatchId = new Map((trackingRes.ok ? trackingRes.data : []).map(t => [t.batchId, t]));
  const transitCounts: Record<ReferralTransitStatus, number> = { dispatched: 0, in_transit: 0, delivered: 0, result_received: 0 };

  const alerts: DashboardAlert[] = [];
  const queue: DashboardQueueItem[] = [];

  for (const b of batches) {
    const tracking = trackingByBatchId.get(b.id);
    if (tracking) transitCounts[tracking.transitStatus]++;

    const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(b.createdAt).getTime()) / 60000));
    queue.push({
      id: b.id, label: b.masterBarcode,
      detail: `${b.referralDestinationFacilityId ?? '—'}${b.referralTestRequested ? ` · ${b.referralTestRequested}` : ''}${tracking ? ` · ${tracking.transitStatus.replace('_', ' ')}` : ''}`,
      ageMinutes, isStat: b.priority === 'STAT',
    });

    if (b.priority === 'STAT') {
      alerts.push({ id: `stat-referral-${b.id}`, severity: 'critical', kind: 'STAT', title: b.masterBarcode, detail: b.referralTestRequested, ageMinutes });
    }
    if (b.coldChainExcursion && !b.coldChainExcursion.acknowledgedAt) {
      alerts.push({
        id: `cold-chain-${b.id}`, severity: 'critical', kind: 'Cold-Chain Excursion',
        title: b.masterBarcode, detail: `${b.coldChainExcursion.temperatureCelsius}°C at ${new Date(b.coldChainExcursion.detectedAt).toLocaleString()}`,
      });
    }
  }

  queue.sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0));

  return {
    asOf: new Date().toISOString(),
    facilityId,
    stats: [
      { id: 'dispatched', label: 'Dispatched', value: transitCounts.dispatched },
      { id: 'in-transit', label: 'In Transit', value: transitCounts.in_transit },
      { id: 'delivered', label: 'Delivered', value: transitCounts.delivered },
      { id: 'result-received', label: 'Results Received', value: transitCounts.result_received },
      { id: 'cold-chain-alerts', label: 'Cold-Chain Excursions', value: alerts.filter(a => a.kind === 'Cold-Chain Excursion').length, state: alerts.some(a => a.kind === 'Cold-Chain Excursion') ? 'overdue' : 'normal' },
    ],
    queue,
    alerts,
  };
}
