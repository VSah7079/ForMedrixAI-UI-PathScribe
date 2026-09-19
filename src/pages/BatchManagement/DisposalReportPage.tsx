// src/pages/BatchManagement/DisposalReportPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature — Stain QC Module §2.5 (waste tracking/reporting), the final
// piece of the original module spec. See
// services/retentionPolicy/computeDisposalReport.ts's own header for the
// full account of what already existed (the computed disposal queue, the
// scan-to-dispose action, the live retention-rules engine) vs. what this
// page actually closes: nowhere aggregated already-disposed items into a
// browsable, filterable, exportable log for a CAP/CLIA/ISO 15189 audit.
//
// Deliberately a read-only report, same real posture as
// RetentionHoldsQueuePage/PendingBatchQueuePage's own documented convention
// (pages/BatchManagement/README.md) — the action (disposing an item) already
// lives at DisposalQueuePage.tsx; this page only ever reports on what
// already happened, never disposes anything itself.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useCurrentScanStation } from '@/hooks/useCurrentScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { facilityService } from '@/services';
import { computeDisposalReport } from '@/services/retentionPolicy/computeDisposalReport';
import type { DisposalReportRow, DisposalReportFilters } from '@/services/retentionPolicy/computeDisposalReport';
import type { RetainableMaterialType } from '@/services/retentionPolicy/RetentionPolicy';
import { exportQaReportRows } from '@/components/QualityAssurance/qaReportUtils';
import type { Facility } from '@/services/facilities/IFacilityService';

const MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

function formatDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const DisposalReportPage: React.FC = () => {
  const { t } = useTranslation();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('disposalReport.pageTitle'), '/batch-management/disposal-report'); }, [pushCrumb, t]);
  const { stationId } = useCurrentScanStation();

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState<string>('all');
  const [materialType, setMaterialType] = useState<'all' | RetainableMaterialType>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [rows, setRows] = useState<DisposalReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Real, per this app's own established convention (BatchManagementPage.tsx,
  // DisposalQueuePage.tsx) — a report run at a fixed scan station defaults to
  // that station's own facility, an admin/compliance user can still widen it
  // back to "all facilities" from the dropdown.
  useEffect(() => {
    if (!stationId) return;
    mockScanStationService.getById(stationId).then(res => {
      if (res.ok) setFacilityId(prev => (prev === 'all' ? res.data.facilityId : prev));
    });
  }, [stationId]);

  useEffect(() => {
    facilityService.getAll().then(res => { if ('ok' in res && res.ok) setFacilities(res.data); });
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true);
    const filters: DisposalReportFilters = {
      facilityId: facilityId === 'all' ? undefined : facilityId,
      materialType: materialType === 'all' ? undefined : materialType,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
    const result = await computeDisposalReport(filters);
    setRows(result);
    setLoading(false);
  }, [facilityId, materialType, dateFrom, dateTo]);

  useEffect(() => { runReport(); }, [runReport]);

  const countByMaterialType = (mt: RetainableMaterialType) => rows.filter(r => r.materialType === mt).length;

  const handleExport = useCallback(() => {
    const exportRows: Record<string, string | number>[] = rows.map(r => ({
      [t('disposalReport.export.disposedAt')]: formatDateTime(r.disposedAt),
      [t('disposalReport.export.materialType')]: t(`disposalReport.materialType.${r.materialType}`),
      [t('disposalReport.export.itemId')]: r.displayId,
      [t('disposalReport.export.caseAccession')]: r.caseAccession,
      [t('disposalReport.export.specimen')]: r.specimenLabel,
      [t('disposalReport.export.disposedBy')]: r.disposedByName,
      [t('disposalReport.export.location')]: r.lastKnownLocation ?? '',
    }));
    exportQaReportRows(exportRows, `waste-tracking-report-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [rows, t]);

  return (
    <div className="ps-batch-page">
      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <div className="ps-batch-page-header">
            <h1 className="ps-batch-page-title">🗑️ {t('disposalReport.pageTitle')}</h1>
            <p className="ps-batch-page-subtitle">{t('disposalReport.pageSubtitle')}</p>
          </div>

          <div className="ps-auditlog-stats-grid">
            <div className="ps-auditlog-stat-card">
              <span className="ps-auditlog-stat-icon">🗑️</span>
              <div>
                <div className="ps-auditlog-stat-value ps-auditlog-stat-value--gray">{rows.length}</div>
                <div className="ps-auditlog-stat-label">{t('disposalReport.stats.total')}</div>
              </div>
            </div>
            {MATERIAL_TYPES.map(mt => (
              <div className="ps-auditlog-stat-card" key={mt}>
                <span className="ps-auditlog-stat-icon">{mt === 'block' ? '🧱' : mt === 'slide' ? '🔬' : '🧫'}</span>
                <div>
                  <div className="ps-auditlog-stat-value ps-auditlog-stat-value--teal">{countByMaterialType(mt)}</div>
                  <div className="ps-auditlog-stat-label">{t(`disposalReport.materialType.${mt}`)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ps-auditlog-filter-row">
            <select
              value={facilityId}
              onChange={e => setFacilityId(e.target.value)}
              aria-label={t('disposalReport.filters.facilityLabel')}
              className="ps-auditlog-select ps-auditlog-select--wide"
            >
              <option value="all">{t('disposalReport.filters.allFacilities')}</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>

            <select
              value={materialType}
              onChange={e => setMaterialType(e.target.value as 'all' | RetainableMaterialType)}
              aria-label={t('disposalReport.filters.materialTypeLabel')}
              className="ps-auditlog-select"
            >
              <option value="all">{t('disposalReport.filters.allMaterialTypes')}</option>
              {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{t(`disposalReport.materialType.${mt}`)}</option>)}
            </select>

            <div className="ps-auditlog-filter-divider" />
            <input
              type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              aria-label={t('disposalReport.filters.dateFromLabel')}
              className="ps-auditlog-select ps-auditlog-select--date"
            />
            <span className="ps-auditlog-date-to">{t('disposalReport.filters.dateTo')}</span>
            <input
              type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              aria-label={t('disposalReport.filters.dateToLabel')}
              className="ps-auditlog-select ps-auditlog-select--date"
            />

            <button onClick={handleExport} disabled={rows.length === 0} className="ps-auditlog-export-btn">
              📊 {t('disposalReport.export.button')}
            </button>
          </div>

          <div className="ps-auditlog-table ps-auditlog-table--disposal">
            <div className="ps-auditlog-thead ps-auditlog-thead--disposal">
              <div>{t('disposalReport.columns.disposedAt')}</div>
              <div>{t('disposalReport.columns.materialType')}</div>
              <div>{t('disposalReport.columns.itemId')}</div>
              <div>{t('disposalReport.columns.caseAccession')}</div>
              <div>{t('disposalReport.columns.specimen')}</div>
              <div>{t('disposalReport.columns.disposedBy')}</div>
              <div>{t('disposalReport.columns.location')}</div>
            </div>
            <div className="ps-auditlog-tbody">
              {loading ? (
                <div className="ps-auditlog-empty">
                  <div className="ps-auditlog-empty-text">{t('disposalReport.loading')}</div>
                </div>
              ) : rows.length === 0 ? (
                <div className="ps-auditlog-empty">
                  <div className="ps-auditlog-empty-icon">🗑️</div>
                  <div className="ps-auditlog-empty-text">{t('disposalReport.empty')}</div>
                </div>
              ) : (
                rows.map(r => (
                  <div key={r.key} className="ps-auditlog-row ps-auditlog-row--disposal">
                    <div className="ps-auditlog-cell-time">{formatDateTime(r.disposedAt)}</div>
                    <div className="ps-auditlog-cell-event">{t(`disposalReport.materialType.${r.materialType}`)}</div>
                    <div className="ps-auditlog-cell-code">{r.displayId}</div>
                    <div className="ps-auditlog-cell-user">{r.caseAccession}</div>
                    <div className="ps-auditlog-cell-user">{r.specimenLabel}</div>
                    <div className="ps-auditlog-cell-user">{r.disposedByName}</div>
                    <div className="ps-auditlog-cell-detail">{r.lastKnownLocation ?? t('disposalReport.unknownLocation')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisposalReportPage;
