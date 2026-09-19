// src/pages/MicrotomyWorkstationPage/components/BatchProgressModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284's own "Print Batch button with real-time progress
// modal." Sequential, one real physical print job at a time — see
// useMicrotomyWorkstation.ts's own handlePrintSelected header for why
// this deliberately isn't simulated parallelism.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { BatchProgressEntry } from '../hooks/useMicrotomyWorkstation';

export interface BatchProgressModalProps {
  entries: BatchProgressEntry[];
  onClose: () => void;
}

const STATUS_ICON: Record<BatchProgressEntry['status'], string> = {
  pending: '⏳', printing: '🖨️', printed: '✅', failed: '❌',
};

const BatchProgressModal: React.FC<BatchProgressModalProps> = ({ entries, onClose }) => {
  const { t } = useTranslation();
  const done = entries.every(e => e.status === 'printed' || e.status === 'failed');

  return (
    <div className="ps-overlay" onClick={done ? onClose : undefined}>
      <div className="ps-modal-dark" onClick={e => e.stopPropagation()}>
        <div className="ps-batch-modal-header">
          <div className="ps-batch-modal-title">{t('microtomyWorkstation.batchProgress.title')}</div>
        </div>
        <div className="ps-batch-modal-body">
          {entries.map(e => (
            <div key={e.stainId} className="ps-microtomy-batch-progress-row">
              <span>{STATUS_ICON[e.status]} {e.stainName}</span>
              <span>{t(`microtomyWorkstation.batchProgress.status.${e.status}`)}{e.message ? ` — ${e.message}` : ''}</span>
            </div>
          ))}
        </div>
        <div className="ps-batch-modal-footer">
          <button className="ps-btn-primary" disabled={!done} onClick={onClose}>
            {done ? t('common.close') : t('microtomyWorkstation.batchProgress.inProgress')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchProgressModal;
