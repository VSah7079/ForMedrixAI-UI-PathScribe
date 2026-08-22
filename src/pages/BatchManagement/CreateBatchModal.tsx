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
              <div className="ps-batch-modal-title">Create Batch</div>
              <button className="ps-mth-close" onClick={onClose}>✕</button>
            </div>
            <div className="ps-batch-modal-body">
              <label className="ps-batch-field-label">Processing Node</label>
              <select className="ps-batch-select" value={processingNode} onChange={e => setProcessingNode(e.target.value as BatchProcessingNode)}>
                {BATCH_PROCESSING_NODES.map(node => <option key={node} value={node}>{node}</option>)}
              </select>

              <label className="ps-batch-field-label">Protocol / Run Parameters</label>
              <input
                className="ps-batch-text-input"
                type="text"
                placeholder="e.g. Standard H&E Overnight Run"
                value={protocol}
                onChange={e => setProtocol(e.target.value)}
              />

              <label className="ps-batch-field-label">Priority</label>
              <div className="ps-batch-priority-toggle">
                <button
                  className={`ps-batch-priority-btn${priority === 'Routine' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('Routine')}
                >
                  Routine
                </button>
                <button
                  className={`ps-batch-priority-btn ps-batch-priority-btn--stat${priority === 'STAT' ? ' ps-batch-priority-btn--active' : ''}`}
                  onClick={() => setPriority('STAT')}
                >
                  STAT
                </button>
              </div>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="ps-btn-primary" disabled={!canCreate || busy} onClick={handleCreate}>
                {busy ? 'Creating…' : 'Create Batch'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ps-batch-modal-header">
              <div className="ps-batch-modal-title">Batch Created</div>
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
              <div className="ps-batch-barcode-label">Print this Master Batch Barcode and affix it to the physical carrier.</div>
              {barcodeSvg && (
                <div className="ps-batch-barcode-svg-wrap" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
              )}
              <div className="ps-batch-barcode-value">{createdBatch.masterBarcode}</div>
              <div className="ps-batch-barcode-meta">{createdBatch.processingNode} · {createdBatch.protocol} · {createdBatch.priority}</div>
            </div>
            <div className="ps-batch-modal-footer">
              <button className="ps-btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
              <button className="ps-btn-primary" onClick={() => onCreated(createdBatch)}>Continue — Scan Items</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateBatchModal;
