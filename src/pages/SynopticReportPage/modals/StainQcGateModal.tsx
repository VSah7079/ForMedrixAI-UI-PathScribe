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

//
// i18n note: `batchMasterBarcode`/`specimenLabel`/`blockLabel`/
// `stainName` are real, per-specimen data, joined into the row title
// as an interpolated parameter, never translated themselves.
// `signingUserName` is a real person's name, same treatment. Reuses
// FixativeTimeGateModal.tsx's exact-text Cancel/Continue/"Confirming…"
// keys, since this modal mirrors that one's shape.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <div className="ps-ms-header">⚠ {t('stainQcGateModal.header')}</div>
        <div className="ps-ms-body ps-fixgate-body">
          <p className="ps-fixgate-intro">
            {t('stainQcGateModal.intro')}
          </p>

          {[...byBatch.entries()].map(([batchId, items]) => {
            const failed = items.some(i => i.status === 'blocked-failed');
            const confirmed = confirmedBatchIds.has(batchId);
            return (
              <div key={batchId} className="ps-fixgate-row">
                <div className="ps-fixgate-row-title">
                  {t('stainQcGateModal.rowTitle', {
                    batchBarcode: items[0].batchMasterBarcode,
                    specimenList: items.map(i => `${i.specimenLabel}${i.blockLabel} (${i.stainName})`).join(', '),
                  })}
                </div>

                {failed ? (
                  <div className="ps-fixgate-row-actions">
                    <span className="ps-fixgate-unrecoverable-badge">
                      {t('stainQcGateModal.failedBadge')}
                    </span>
                  </div>
                ) : confirmed ? (
                  <div className="ps-fixgate-row-actions">
                    <span className="ps-fixgate-unrecoverable-badge">{t('stainQcGateModal.confirmedBadge', { name: signingUserName })}</span>
                  </div>
                ) : (
                  <div className="ps-fixgate-row-actions">
                    <button className="ps-btn-secondary ps-fixgate-unrecoverable-btn" disabled={confirming === batchId} onClick={() => handleConfirm(batchId)}>
                      {confirming === batchId ? t('patientMatchReviewSection.confirmingBtn') : t('stainQcGateModal.confirmButton')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {hasFailedBatch && (
            <p className="ps-fixgate-intro ps-fixgate-intro--spaced">
              {t('stainQcGateModal.failedBatchNotice')}
            </p>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onCancel}>{t('preAnalyticDateGateModal.cancelButton')}</button>
          <button className="ps-ms-btn-apply" onClick={onContinue} disabled={!allResolvableConfirmed || hasFailedBatch}>
            {t('preAnalyticDateGateModal.continueButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
