// src/pages/BatchManagement/PendingBatchQueuePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "the pending batch queue has no
// UI at all... computePendingBatchQueue.ts is built and tested, but
// there's genuinely nowhere in the app to look at it right now." Same
// real "computed queue, own dedicated page" pattern as
// DisposalQueuePage.tsx (see that file's own header) — but
// deliberately read-only, not scan-to-act: loading an item into a
// batch is already a real, existing action (BatchDetailView.tsx's own
// addItemByScan wiring, reached by opening or creating the actual
// batch that item belongs in), and duplicating that here would be a
// second, competing way to do the same real thing. This page answers
// a narrower, real question instead — "what's been printed but not
// yet loaded anywhere?" — so a tech knows what to go pick up and scan
// in, without deciding here which specific batch it belongs to.
//
// Real, per PS-289's own direct request to close this gap: this page
// now resolves stationId -> facilityId the same real way
// DisposalQueuePage.tsx already does, and passes it through to
// computePendingBatchQueue.ts — see that file's own header for why
// Case.facilityId, not scan-derived locationHistory, is the correct
// signal for these specific, never-yet-scanned items.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useCurrentScanStation } from '@/hooks/useCurrentScanStation';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { facilityService } from '@/services';
import { computePendingBatchQueue } from '@/services/batches/computePendingBatchQueue';
import type { PendingBatchQueueItem } from '@/services/batches/computePendingBatchQueue';

// Real, label-key-map — keeps the real materialType value untouched.
const MATERIAL_TYPE_LABEL_KEY: Record<PendingBatchQueueItem['materialType'], string> = {
  block: 'pendingBatchQueue.materialType.block', slide: 'pendingBatchQueue.materialType.slide',
};

const PendingBatchQueuePage: React.FC = () => {
  const { t } = useTranslation();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('pendingBatchQueue.pageTitle'), '/batch-management/pending-load'); }, [pushCrumb, t]);

  const { stationId } = useCurrentScanStation();
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined);
  const [facilityName, setFacilityName] = useState<string | null>(null);
  const [queue, setQueue] = useState<PendingBatchQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Real feature, per direct follow-up: "could use a search, either
  // scan in a field or type since it could be a long list." A plain,
  // focused text input already handles both — same real convention
  // BatchManagementPage.tsx's own lookup input already establishes
  // (a real, physical scanner types into whatever field currently has
  // focus; no separate PATHSCRIBE_SCAN listener needed here the way
  // DisposalQueuePage.tsx's own, genuinely hands-free scanning does).
  // Deliberately a live FILTER on the list below, not a lookup-then-
  // navigate action — this page's own real point is narrowing a long
  // list, not opening one specific item.
  const [searchQuery, setSearchQuery] = useState('');

  // Real, station -> facility resolution — same real ScanStation
  // record DisposalQueuePage.tsx already resolves this same way.
  useEffect(() => {
    if (!stationId) { setFacilityId(undefined); setFacilityName(null); return; }
    mockScanStationService.getById(stationId).then(res => {
      if (!res.ok) return;
      setFacilityId(res.data.facilityId);
      facilityService.getById(res.data.facilityId).then(fRes => {
        if ('ok' in fRes && fRes.ok) setFacilityName(fRes.data.name);
      });
    });
  }, [stationId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const items = await computePendingBatchQueue(facilityId);
    setQueue(items);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Real, case-insensitive substring match against every real field a
  // tech might actually scan or type — a full displayId (what a real
  // barcode encodes), or a partial case accession/specimen label (for
  // a typed, narrower-than-one-item search across a real, mixed
  // case's own several pending items).
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredQueue = trimmedQuery
    ? queue.filter(item =>
        item.displayId.toLowerCase().includes(trimmedQuery)
        || item.caseAccession.toLowerCase().includes(trimmedQuery)
        || item.specimenLabel.toLowerCase().includes(trimmedQuery)
      )
    : queue;

  // Real, deliberate grouping by case accession — a tech collecting
  // items to load is thinking "what's sitting out for case X," not
  // scanning a single, undifferentiated list; same real grouping
  // instinct BatchDetailView.tsx's own manifest already uses for a
  // batch's real, mixed contents.
  const byCase = new Map<string, PendingBatchQueueItem[]>();
  for (const item of filteredQueue) {
    if (!byCase.has(item.caseAccession)) byCase.set(item.caseAccession, []);
    byCase.get(item.caseAccession)!.push(item);
  }

  return (
    <div className="ps-batch-page">
      <div className="ps-batch-scroll">
        <div className="ps-batch-inner">
          <div className="ps-batch-page-header">
            <h1 className="ps-batch-page-title">📦 {t('pendingBatchQueue.pageTitle')}</h1>
            <p className="ps-batch-page-subtitle">
              {t('pendingBatchQueue.pageSubtitle')}
            </p>
            <p className="ps-batch-page-subtitle">
              {facilityId
                ? t('pendingBatchQueue.scopedTo', { facility: facilityName ?? facilityId })
                : t('pendingBatchQueue.noStationAllFacilities')}
            </p>
          </div>

          <div className="ps-batch-toolbar">
            <input
              className="ps-batch-lookup-input"
              type="text"
              placeholder={t('pendingBatchQueue.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="ps-btn-secondary" onClick={() => setSearchQuery('')}>
                ✕ {t('pendingBatchQueue.clear')}
              </button>
            )}
            <button className="ps-btn-secondary" onClick={refresh} disabled={loading}>
              {loading ? t('pendingBatchQueue.refreshing') : `↻ ${t('pendingBatchQueue.refresh')}`}
            </button>
          </div>

          <div className="ps-batch-section-label">
            {trimmedQuery
              ? t('pendingBatchQueue.sectionLabelFiltered', { count: filteredQueue.length, total: queue.length })
              : t('pendingBatchQueue.sectionLabel', { count: filteredQueue.length })}
          </div>
          {loading ? (
            <div className="ps-batch-empty">{t('pendingBatchQueue.computing')}</div>
          ) : filteredQueue.length === 0 ? (
            <div className="ps-batch-empty">
              {trimmedQuery
                ? t('pendingBatchQueue.noMatch', { query: searchQuery.trim() })
                : t('pendingBatchQueue.emptyAll')}
            </div>
          ) : (
            Array.from(byCase.entries()).map(([caseAccession, items]) => (
              <div key={caseAccession} className="ps-batch-pending-case-group">
                <div className="ps-batch-manifest-added ps-batch-pending-case-heading">
                  {caseAccession} — {t('batchManagement.itemCount', { count: items.length })}
                </div>
                <div className="ps-batch-manifest">
                  {items.map(item => (
                    <div key={item.key} className="ps-batch-manifest-row">
                      <span className="ps-batch-manifest-id">{item.displayId}</span>
                      <span className="ps-batch-manifest-type">{t(MATERIAL_TYPE_LABEL_KEY[item.materialType])}</span>
                      <span className="ps-batch-manifest-added">{t('pendingBatchQueue.specimenLabel', { label: item.specimenLabel })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingBatchQueuePage;
