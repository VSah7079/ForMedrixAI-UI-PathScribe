// src/pages/SlideDistributionStationPage/SlideDistributionStationPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286 — "Slide Distribution Station: a continuous-scan
// checkout/digital scanner ingestion workstation." Third of the
// PS-284→285→286→287→288 workstation-build sequence, the post-staining
// step: routing each finished, physical slide either to a pathologist
// (physical checkout) or a digital scanner (WSI ingestion). Same real
// bench-scoped, NOT case-scoped route posture as its two siblings —
// see useSlideDistributionStation.ts's own header for why this one is
// architecturally a continuous QUEUE rather than one work item at a
// time.
//
// Real, per direct visual-consistency guidance carried through the
// whole series: same header/back-button pattern, same dark palette —
// see pathscribe.css's own ps-slidedist-* block.
//
// Real, deliberate scope cuts, stated plainly (also documented in this
// folder's own README): no MatrixBlock-level slides, no physical
// foot-pedal integration yet — tracked as the next real item after
// PS-288 per direct instruction — and "Batch Container Recognition" is
// scoped to real, existing data (scanning a block queues every real
// slide already cut from it) rather than a fabricated rack/tray
// container model that doesn't exist anywhere in this app today.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { useSlideDistributionStation } from './hooks/useSlideDistributionStation';
import QueuePanel from './components/QueuePanel';
import ScanCenterPanel from './components/ScanCenterPanel';
import DestinationControlPanel from './components/DestinationControlPanel';
import type { DestinationMode } from './components/DestinationControlPanel';
import type { SlideExceptionReason } from '@/utils/slideDistributionOperations';
import '../../pathscribe.css';

const SlideDistributionStationPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();
  useEffect(() => { pushCrumb(t('slideDistribution.pageTitle'), '/workstations/slide-distribution'); }, [pushCrumb, t]);

  const w = useSlideDistributionStation();
  const [scanInput, setScanInput] = useState('');
  const [mode, setMode] = useState<DestinationMode>('physical');
  const [assignFeedback, setAssignFeedback] = useState<string | null>(null);
  const [reprintFeedback, setReprintFeedback] = useState<string | null>(null);

  useEffect(() => { w.loadDirectories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real, same real global-scan-event pattern as the other two
  // workstations' own listener — continuous scanning here means every
  // scan (whether the input has focus or not) should add to the queue
  // with no manual interface interaction in between, exactly as the
  // spec's own "Single Input Line" requirement states.
  useEffect(() => {
    const listener = (e: Event) => {
      const scanEvent = (e as CustomEvent<{ raw: string }>).detail;
      if (!scanEvent?.raw || scanEvent.raw.trim().toUpperCase().startsWith('STATION:')) return;
      w.resolveScan(scanEvent.raw);
    };
    window.addEventListener('PATHSCRIBE_SCAN', listener);
    return () => window.removeEventListener('PATHSCRIBE_SCAN', listener);
  }, [w]);

  const handleScanSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    await w.resolveScan(scanInput.trim());
    setScanInput('');
  }, [scanInput, w]);

  const activeItem = w.queue.find(q => q.queueId === w.activeQueueId);
  const splitWarning = w.activeQueueId ? w.splitDestinationWarningFor(w.activeQueueId) : null;
  const defaultRouting = activeItem ? w.resolveDefaultRouting(activeItem.caseData) : {};

  const carrierOrScannerId = !activeItem
    ? '—'
    : activeItem.stain.distributionDestination === 'physical'
      ? (activeItem.stain.physicalLocation?.courierBagId ?? activeItem.stain.physicalLocation?.trayNumber ?? activeItem.stain.physicalLocation?.slideFolderId ?? '—')
      : (activeItem.stain.scannerAssignment?.scannerInstrumentId ?? '—');

  const handleAssignPhysical = useCallback(async (assignment: Parameters<typeof w.handleAssignPhysical>[1]) => {
    if (!w.activeQueueId) return;
    setAssignFeedback(null);
    const result = await w.handleAssignPhysical(w.activeQueueId, assignment);
    if (!result.ok) setAssignFeedback(result.message ?? t('slideDistribution.destination.assignFailed'));
  }, [w, t]);

  const handleAssignScanner = useCallback(async (assignment: Parameters<typeof w.handleAssignScanner>[1]) => {
    if (!w.activeQueueId) return;
    setAssignFeedback(null);
    const result = await w.handleAssignScanner(w.activeQueueId, assignment);
    if (!result.ok) setAssignFeedback(result.message ?? t('slideDistribution.destination.assignFailed'));
  }, [w, t]);

  const handleFlagException = useCallback((reason: SlideExceptionReason) => {
    if (!w.activeQueueId) return;
    w.handleFlagException(w.activeQueueId, reason);
  }, [w]);

  const handleResolveException = useCallback(() => {
    if (!w.activeQueueId) return;
    w.handleResolveException(w.activeQueueId);
  }, [w]);

  const handleRequestReprint = useCallback(async () => {
    if (!w.activeQueueId) return;
    setReprintFeedback(null);
    const result = await w.handleRequestReprint(w.activeQueueId);
    if (!result.ok) setReprintFeedback(result.message ?? t('slideDistribution.activeSlide.reprintFailed'));
  }, [w, t]);

  return (
    <div className="ps-slidedist-page">
      <div className="ps-slidedist-header">
        <button className="ps-btn-secondary" onClick={() => navigate('/worklist')}>{t('common.back')}</button>
        <h1 className="ps-slidedist-title">📬 {t('slideDistribution.pageTitle')}</h1>
      </div>

      <div className="ps-slidedist-context-bar">
        <span>{t('slideDistribution.context.queueCount')} <strong>{w.queue.length}</strong></span>
        <span>{t('slideDistribution.context.mode')} <strong>{t(`slideDistribution.destination.${mode}`)}</strong></span>
        <span>{t('slideDistribution.context.carrierOrScanner')} <strong>{carrierOrScannerId}</strong></span>
        <span>{t('slideDistribution.context.tech')} <strong>{w.actor.name}</strong></span>
      </div>

      <div className="ps-slidedist-panel ps-mb-16">
        <p className="ps-slidedist-panel-title">{t('slideDistribution.scanPrompt')}</p>
        <form className="ps-slidedist-scan-row" onSubmit={handleScanSubmit}>
          <input
            type="text" className="ps-slidedist-scan-input" autoFocus
            value={scanInput} onChange={e => setScanInput(e.target.value)}
            placeholder={t('slideDistribution.scanPlaceholder') ?? ''}
          />
          <button type="submit" className="ps-btn-primary">{t('slideDistribution.scanSubmit')}</button>
        </form>
        {w.scanError && <div className="ps-slidedist-scan-error">{w.scanError}</div>}
      </div>

      <div className="ps-slidedist-layout">
        <QueuePanel queue={w.queue} activeQueueId={w.activeQueueId} onSelect={w.setActiveQueueId} onRemove={w.removeFromQueue} />

        <ScanCenterPanel
          queue={w.queue}
          activeItem={activeItem}
          activeQueueId={w.activeQueueId}
          onSelect={w.setActiveQueueId}
          splitWarning={splitWarning}
          scanExceptions={w.scanExceptions}
          onFlagException={handleFlagException}
          onResolveException={handleResolveException}
          onRequestReprint={handleRequestReprint}
          reprintFeedback={reprintFeedback}
        />

        <DestinationControlPanel
          activeItem={activeItem}
          pathologists={w.pathologists}
          subspecialties={w.subspecialties}
          defaultRouting={defaultRouting}
          onAssignPhysical={handleAssignPhysical}
          onAssignScanner={handleAssignScanner}
          feedback={assignFeedback}
          mode={mode}
          onModeChange={setMode}
        />
      </div>
    </div>
  );
};

export default SlideDistributionStationPage;
