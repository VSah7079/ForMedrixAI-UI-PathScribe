// src/pages/SynopticReportPage/modals/StainQcGateModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289/PS-292's own Gating Strategy — blocks case sign-out
// when checkStainQcGate.ts finds a real, unresolved stain QC gate.
// Mirrors FixativeTimeGateModal.tsx's own real, established shape (a
// hard block with real resolution paths, not a dismissible warning).
//
// Grouped by real batch, not by individual stain — the confirmation
// itself (mockBatchService.confirmQcVisualRead()) is a real, batch-
// level action, so multiple blocking stains sharing the same real
// batch resolve together with one real confirmation, not N separate
// ones for the same physical run.
//
// A real, confirmed 'blocked-failed' batch has no self-service
// resolution here at all, by design — per direct decision, that
// already auto-raised a real def-stain-batch-failed deficiency
// (services/batches/mockBatchService.ts); overriding a known
// instrument failure from this modal directly would be a real,
// dangerous shortcut around the established Contain/Escalate-to-CAPA
// workflow that deficiency is meant to go through.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { mockBatchService } from '@/services/batches/mockBatchService';
import type { StainQcGateBlockingItem } from '../hooks/checkStainQcGate';

interface Props {
  blocking: StainQcGateBlockingItem[];
  signingUserId: string;
  signingUserName: string;
  onContinue: () => void;
  onCancel: () => void;
}

export const StainQcGateModal: React.FC<Props> = ({ blocking, signingUserId, signingUserName, onContinue, onCancel }) => {
  const [confirmedBatchIds, setConfirmedBatchIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);

  // Real, per this file's own header — grouped by real batch, since
  // the confirmation itself is a real, batch-level action.
  const byBatch = new Map<string, StainQcGateBlockingItem[]>();
  for (const item of blocking) {
    byBatch.set(item.batchId, [...(byBatch.get(item.batchId) ?? []), item]);
  }

  const handleConfirm = async (batchId: string) => {
    setConfirming(batchId);
    const res = await mockBatchService.confirmQcVisualRead(batchId, signingUserId, signingUserName);
    setConfirming(null);
    if (res.ok) setConfirmedBatchIds(prev => new Set(prev).add(batchId));
  };

  // Real — every real, resolvable batch (enforced/hybrid) must be
  // confirmed; a real 'blocked-failed' batch can never be resolved
  // here at all, so it alone would otherwise permanently block
  // Continue with no real way forward from this modal.
  const allResolvableConfirmed = [...byBatch.entries()]
    .filter(([, items]) => items.every(i => i.status !== 'blocked-failed'))
    .every(([batchId]) => confirmedBatchIds.has(batchId));
  const hasFailedBatch = [...byBatch.values()].some(items => items.some(i => i.status === 'blocked-failed'));

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">⚠ Stain QC Gate — Sign-Out Blocked</div>
        <div className="ps-ms-body ps-fixgate-body">
          <p className="ps-fixgate-intro">
            The stain batch(es) below require resolution before this case can be signed out.
          </p>

          {[...byBatch.entries()].map(([batchId, items]) => {
            const failed = items.some(i => i.status === 'blocked-failed');
            const confirmed = confirmedBatchIds.has(batchId);
            return (
              <div key={batchId} className="ps-fixgate-row">
                <div className="ps-fixgate-row-title">
                  Batch {items[0].batchMasterBarcode} — {items.map(i => `${i.specimenLabel}${i.blockLabel} (${i.stainName})`).join(', ')}
                </div>

                {failed ? (
                  <div className="ps-fixgate-row-actions">
                    <span className="ps-fixgate-unrecoverable-badge">
                      Real instrument failure reported — a deficiency has been raised. Resolve it via the QA Deficiencies tab before this case can sign out.
                    </span>
                  </div>
                ) : confirmed ? (
                  <div className="ps-fixgate-row-actions">
                    <span className="ps-fixgate-unrecoverable-badge">Visual read confirmed by {signingUserName}.</span>
                  </div>
                ) : (
                  <div className="ps-fixgate-row-actions">
                    <button className="ps-btn-secondary ps-fixgate-unrecoverable-btn" disabled={confirming === batchId} onClick={() => handleConfirm(batchId)}>
                      {confirming === batchId ? 'Confirming\u2026' : 'Confirm visual read checklist complete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {hasFailedBatch && (
            <p className="ps-fixgate-intro" style={{ marginTop: 12 }}>
              This case cannot be signed out until every real instrument-failure deficiency above is resolved.
            </p>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onCancel}>Cancel — don't sign out</button>
          <button className="ps-ms-btn-apply" onClick={onContinue} disabled={!allResolvableConfirmed || hasFailedBatch}>
            Continue Sign-Out
          </button>
        </div>
      </div>
    </div>
  );
};
