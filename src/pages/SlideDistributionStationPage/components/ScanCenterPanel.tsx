// src/pages/SlideDistributionStationPage/components/ScanCenterPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286's own Center Panel (Continuous-Scan Input Area):
// "primary active barcode scan target, visual tray/rack layout grid
// showing occupied slots, batch progress indicators." Real, honest
// scope note: the "slot grid" below is a schematic chip per queued
// slide (color-coded by real destination/status), NOT a literal,
// coordinate-accurate rack/tray layout — no real rack/tray-to-slide
// membership data model exists anywhere in this app to draw one from
// (confirmed by direct investigation — see this folder's own README
// and useSlideDistributionStation.ts's own header comment). Also owns
// the Smart Rules & Exception Handling surface for the active slide:
// the Split-Destination warning and the Scan Exception Log (both the
// session-scoped "never resolved to a real slide" exceptions and the
// per-slide "Missing Glass" exception already recorded on the active
// item).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SlideQueueItem, ScanException } from '../hooks/useSlideDistributionStation';
import type { SplitDestinationWarning, SlideExceptionReason } from '@/utils/slideDistributionOperations';
import { SLIDE_EXCEPTION_REASONS } from '@/utils/slideDistributionOperations';

export interface ScanCenterPanelProps {
  queue: SlideQueueItem[];
  activeItem: SlideQueueItem | undefined;
  activeQueueId: string | null;
  onSelect: (id: string) => void;
  splitWarning: SplitDestinationWarning | null;
  scanExceptions: ScanException[];
  onFlagException: (reason: SlideExceptionReason) => void;
  onResolveException: () => void;
  onRequestReprint: () => void;
  reprintFeedback: string | null;
}

function slotClass(item: SlideQueueItem, isActive: boolean): string {
  const parts = ['ps-slidedist-slot-chip'];
  if (isActive) parts.push('ps-slidedist-slot-chip--active');
  if (item.stain.activeExceptionReason) parts.push('ps-slidedist-slot-chip--exception');
  else if (item.stain.distributionDestination === 'physical') parts.push('ps-slidedist-slot-chip--physical');
  else if (item.stain.distributionDestination === 'digital') parts.push('ps-slidedist-slot-chip--digital');
  return parts.join(' ');
}

const ScanCenterPanel: React.FC<ScanCenterPanelProps> = ({
  queue, activeItem, activeQueueId, onSelect, splitWarning, scanExceptions,
  onFlagException, onResolveException, onRequestReprint, reprintFeedback,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <div className="ps-slidedist-panel" style={{ marginBottom: 14 }}>
        <p className="ps-slidedist-panel-title">{t('slideDistribution.slots.title')}</p>
        {queue.length === 0 ? (
          <div className="ps-slidedist-empty">{t('slideDistribution.slots.empty')}</div>
        ) : (
          <div className="ps-slidedist-slot-grid">
            {queue.map(item => (
              <button
                key={item.queueId} type="button" className={slotClass(item, item.queueId === activeQueueId)}
                onClick={() => onSelect(item.queueId)}
                title={`${item.specimen.label}${item.block.label} — ${item.stain.stainName}`}
              >
                {item.block.label}
              </button>
            ))}
          </div>
        )}

        {scanExceptions.length > 0 && (
          <>
            <p className="ps-slidedist-panel-title" style={{ marginTop: 4 }}>{t('slideDistribution.exceptions.scanLogTitle')}</p>
            <ul className="ps-slidedist-event-list">
              {scanExceptions.slice(-5).reverse().map(exc => (
                <li key={exc.id} className="ps-slidedist-event-item">
                  {t(`slideDistribution.exceptions.reason.${exc.reason === 'Unreadable Barcode' ? 'unreadableBarcode' : 'unassignedAccession'}`)} — “{exc.rawScan}” ({new Date(exc.timestamp).toLocaleTimeString()})
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {activeItem ? (
        <div className="ps-slidedist-panel">
          <p className="ps-slidedist-panel-title">{t('slideDistribution.activeSlide.title')}</p>
          <div className="ps-slidedist-context-field">
            {t('slideDistribution.activeSlide.slide')}
            <strong>{activeItem.specimen.label}{activeItem.block.label} — {activeItem.stain.stainName}</strong>
          </div>
          <div className="ps-slidedist-context-field">
            {t('slideDistribution.activeSlide.status')}
            <strong>{activeItem.stain.distributionStatus ?? t('slideDistribution.queue.unrouted')}</strong>
          </div>

          {splitWarning?.conflict && (
            <div className="ps-slidedist-split-warning">⚠ {splitWarning.detail}</div>
          )}

          {activeItem.stain.activeExceptionReason ? (
            <div className="ps-slidedist-exception-banner">
              <span>⚠ {t(`slideDistribution.exceptions.reason.${exceptionKey(activeItem.stain.activeExceptionReason)}`)}</span>
              <button type="button" className="ps-slidedist-row-btn" onClick={onResolveException}>{t('slideDistribution.exceptions.resolve')}</button>
            </div>
          ) : (
            <>
              <p className="ps-slidedist-panel-title" style={{ marginTop: 10 }}>{t('slideDistribution.exceptions.title')}</p>
              <div className="ps-slidedist-exception-grid">
                {SLIDE_EXCEPTION_REASONS.map(reason => (
                  <button key={reason} type="button" className="ps-slidedist-exception-btn" onClick={() => onFlagException(reason)}>
                    {t(`slideDistribution.exceptions.reason.${exceptionKey(reason)}`)}
                  </button>
                ))}
              </div>
            </>
          )}

          <button type="button" className="ps-btn-secondary" style={{ marginTop: 10 }} onClick={onRequestReprint}>
            🖨️ {t('slideDistribution.activeSlide.reprintLabel')}
          </button>
          {reprintFeedback && <div className="ps-slidedist-scan-error" style={{ marginTop: 6 }}>{reprintFeedback}</div>}

          {(activeItem.stain.distributionEvents?.length ?? 0) > 0 && (
            <>
              <p className="ps-slidedist-panel-title" style={{ marginTop: 10 }}>{t('slideDistribution.activeSlide.history')}</p>
              <ul className="ps-slidedist-event-list">
                {activeItem.stain.distributionEvents!.slice().reverse().map(ev => (
                  <li key={ev.id} className="ps-slidedist-event-item">{ev.detail} — {new Date(ev.timestamp).toLocaleTimeString()}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="ps-slidedist-panel">
          <div className="ps-slidedist-empty">{t('slideDistribution.activeSlide.none')}</div>
        </div>
      )}
    </div>
  );
};

function exceptionKey(reason: SlideExceptionReason): string {
  switch (reason) {
    case 'Unreadable Barcode': return 'unreadableBarcode';
    case 'Unassigned Accession': return 'unassignedAccession';
    case 'Missing Glass': return 'missingGlass';
    default: return 'other';
  }
}

export default ScanCenterPanel;
