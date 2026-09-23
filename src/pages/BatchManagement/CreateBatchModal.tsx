// src/pages/BatchManagement/CreateBatchModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per the spec's own "Container Barcode Generation: System
// generates a printable 1D/2D Master Batch Barcode for physical carriers
// (e.g., processor baskets, stainer racks)." Reuses this app's own real,
// already-existing barcode generator (utils/labels/generateBarcodeSvg.ts —
// the exact same real function real cassette/slide labels already use),
// not a second, independent barcode-drawing implementation.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { batchService } from '@/services';
import { generateBarcodeSvg } from '@/utils/labels/generateBarcodeSvg';
import { BATCH_PROCESSING_NODES } from '@/services/batches/IBatchService';
import type { Batch, BatchProcessingNode, BatchPriority } from '@/services/batches/IBatchService';

interface Props {
  onClose: () => void;
  onCreated: (batch: Batch) => void;
  userId: string;
  userName: string;
  stationId: string | null;
}

const CreateBatchModal: React.FC<Props> = ({ onClose, onCreated, userId, userName, stationId }) => {
  const { t } = useTranslation();
  const [processingNode, setProcessingNode] = useState<BatchProcessingNode>(BATCH_PROCESSING_NODES[0]);
  const [protocol, setProtocol] = useState('');
  const [priority, setPriority] = useState<BatchPriority>('Routine');
  const [busy, setBusy] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<Batch | null>(null);

  const canCreate = protocol.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setBusy(true);
    const res = await batchService.create({
      processingNode, protocol: protocol.trim(), priority,
      stationId: stationId ?? undefined,
      createdByUserId: userId, createdByUserName: userName,
    });
    setBusy(false);
    if (res.ok) setCreatedBatch(res.data);
  };

  const barcodeSvg = createdBatch ? generateBarcodeSvg(createdBatch.masterBarcode, 'code128', { includeText: true }) : null;

  return (
    <div className="ps-overlay ps-batch-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-batch-create-modal" onClick={e => e.stopPropagation()}>
        {!createdBatch ? (
          <>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">{t('createBatchModal.title')}</div>
              <button className="ps-mth-close" onClick={onClose}>✕</button>
            </div>
            <div className="ps-batch-modal-body">
              <label className="ps-batch-field-label">{t('createBatchModal.processingNode')}</label>
              <select className="ps-batch-select" value={processingNode} onChange={e => setProcessingNode(e.target.value as BatchProcessingNode)}>
                {BATCH_PROCESSING_NODES.map(node => <option key={node} value={node}>{t(`batchManagement.nodes.${node}`)}</option>)}
              </select>

              <label className="ps-batch-field-label">{t('createBatchModal.protocolLabel')}</label>
              <input
                className="ps-batch-text-input"
                type="text"
                placeholder={t('createBatchModal.protocolPlaceholder')}
                value={protocol}
                onChange={e => setProtocol(e.target.value)}
              />

              <label className="ps-batch-field-label">{t('createBatchModal.priority')}</label>
              <div className="ps-batch-priority-toggle">
                <button
                  className={`ps-batch-priority-btn${priority === 'Routine' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('Routine')}
                >
                  {t('createBatchModal.priorityRoutine')}
                </button>
                <button
                  className={`ps-batch-priority-btn ps-batch-priority-btn--stat${priority === 'STAT' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('STAT')}
                >
                  {t('createBatchModal.priorityStat')}
                </button>
              </div>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={onClose}>{t('createBatchModal.cancel')}</button>
              <button className="ps-btn-primary" disabled={!canCreate || busy} onClick={handleCreate}>
                {busy ? t('createBatchModal.creating') : t('createBatchModal.create')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">{t('createBatchModal.createdTitle')}</div>
              {/* Real fix, found via live testing, not assumed: this used
                  to call plain onClose, same as the pre-creation form's
                  own "✕" — but by this point the batch genuinely,
                  already exists (the real service call already
                  succeeded). A tech who dismisses this confirmation via
                  "✕" instead of "Continue — Scan Items" still created a
                  real batch; the parent's own list/tiles need to know
                  about it either way, not just when "Continue" is
                  clicked specifically. */}
              <button className="ps-mth-close" onClick={() => onCreated(createdBatch)}>✕</button>
            </div>
            <div className="ps-batch-modal-body ps-batch-barcode-body">
              <div className="ps-batch-barcode-label">{t('createBatchModal.printInstruction')}</div>
              {barcodeSvg && (
                <div className="ps-batch-barcode-svg-wrap" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
              )}
              <div className="ps-batch-barcode-value">{createdBatch.masterBarcode}</div>
              <div className="ps-batch-barcode-meta">{t(`batchManagement.nodes.${createdBatch.processingNode}`)} · {createdBatch.protocol} · {createdBatch.priority === 'STAT' ? t('createBatchModal.priorityStat') : t('createBatchModal.priorityRoutine')}</div>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={() => window.print()}>🖨️ {t('createBatchModal.print')}</button>
              <button className="ps-btn-primary" onClick={() => onCreated(createdBatch)}>{t('createBatchModal.continueScanning')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateBatchModal;
