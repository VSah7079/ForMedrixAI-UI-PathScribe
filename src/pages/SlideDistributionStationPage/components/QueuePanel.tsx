// src/pages/SlideDistributionStationPage/components/QueuePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-286's own Left Panel (Work Item Summary): "real-time
// scanned-slide list — Accession ID, Block ID, Stain Type, Priority
// (STAT vs. Routine), Assigned Pathologist or Scanner Target." Priority
// is the real, existing Case.priority field ('Routine' | 'Rush' |
// 'STAT') — never a new, separate priority concept invented here.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SlideQueueItem } from '../hooks/useSlideDistributionStation';

export interface QueuePanelProps {
  queue: SlideQueueItem[];
  activeQueueId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const QueuePanel: React.FC<QueuePanelProps> = ({ queue, activeQueueId, onSelect, onRemove }) => {
  const { t } = useTranslation();

  const targetLabel = (item: SlideQueueItem): string => {
    if (item.stain.distributionDestination === 'physical') {
      return item.stain.assignedPathologistName ?? (item.stain.assignedSubspecialtyId ? t('slideDistribution.queue.pool') : t('slideDistribution.queue.unassigned'));
    }
    if (item.stain.distributionDestination === 'digital') {
      return item.stain.scannerAssignment?.scannerInstrumentId ?? t('slideDistribution.queue.unassigned');
    }
    return t('slideDistribution.queue.unassigned');
  };

  return (
    <div className="ps-slidedist-panel">
      <p className="ps-slidedist-panel-title">
        {t('slideDistribution.queue.title')}
        <span>{t('slideDistribution.queue.count', { count: queue.length })}</span>
      </p>
      {queue.length === 0 ? (
        <div className="ps-slidedist-empty">{t('slideDistribution.queue.empty')}</div>
      ) : (
        <ul className="ps-slidedist-queue-list">
          {queue.map(item => (
            <li
              key={item.queueId}
              className={`ps-slidedist-queue-row${item.queueId === activeQueueId ? ' ps-slidedist-queue-row--active' : ''}`}
              onClick={() => onSelect(item.queueId)}
            >
              <div className="ps-slidedist-queue-row-top">
                <span>
                  {item.caseData.accession?.fullAccession ?? item.caseData.id} · {item.specimen.label}{item.block.label}
                  <span className={`ps-slidedist-priority-badge ps-slidedist-priority-badge--${item.caseData.order.priority}`}>{item.caseData.order.priority}</span>
                </span>
                <button
                  type="button" className="ps-slidedist-row-btn ps-slidedist-row-btn--danger"
                  onClick={e => { e.stopPropagation(); onRemove(item.queueId); }}
                  title={t('slideDistribution.queue.remove') ?? ''}
                >
                  ✕
                </button>
              </div>
              <div className="ps-slidedist-queue-row-meta">{item.stain.stainName} · {item.stain.distributionStatus ?? t('slideDistribution.queue.unrouted')}</div>
              <div className="ps-slidedist-queue-row-meta">{targetLabel(item)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default QueuePanel;
