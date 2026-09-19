// src/pages/AddOnOrderPage/components/OrderTrackingDashboard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own §4 "Real-Time Pathologist Order Tracking:
// Requested → Block Retrieved → Cut/Pending Stain → Stained/QC →
// Checked Out/Scanned" and §5 "Exception Handling & Block Exhaustion...
// Pathologist Notification Loop." One combined dashboard — every real
// add-on order this case has, its live derived stage, and (for the one
// with an open exception) the real cancel/modify/approve-destructive-
// cut response actions the spec calls for. See
// useAddOnOrderStation.ts's own header for why this doubles as the
// spec's own "LIS inbox" rather than a separate notification surface.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrackedAddOnOrder } from '../hooks/useAddOnOrderStation';
import { BLOCK_EXCEPTION_REASONS, type BlockExceptionReason } from '@/types/case/AddOnOrder';

export interface OrderTrackingDashboardProps {
  orders: TrackedAddOnOrder[];
  onMarkBlockRetrieved: (blockId: string, stainOrderId: string) => void;
  onFlagException: (blockId: string, stainOrderId: string, reason: BlockExceptionReason, note: string | undefined) => void;
  onResolveException: (
    blockId: string, stainOrderId: string,
    action: 'approve_destructive_cut' | 'cancel' | 'modify',
    responseNote: string | undefined,
    modifyChanges: { levelDepthMicrons?: number; cuttingInstructions?: string } | undefined,
  ) => void;
}

const STAGE_CLASS: Record<string, string> = {
  Requested: 'ps-addon-stage-badge--requested',
  'Block Retrieved': 'ps-addon-stage-badge--retrieved',
  'Cut / Pending Stain': 'ps-addon-stage-badge--cutting',
  'Stained / QC': 'ps-addon-stage-badge--staining',
  'Checked Out / Scanned': 'ps-addon-stage-badge--done',
  Exception: 'ps-addon-stage-badge--exception',
  Cancelled: 'ps-addon-stage-badge--cancelled',
};

const OrderTrackingDashboard: React.FC<OrderTrackingDashboardProps> = ({ orders, onMarkBlockRetrieved, onFlagException, onResolveException }) => {
  const { t } = useTranslation();
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState<BlockExceptionReason>('Block exhausted');
  const [flagNote, setFlagNote] = useState('');
  const [responseNote, setResponseNote] = useState('');

  if (orders.length === 0) {
    return (
      <div className="ps-addon-panel ps-addon-tracking-panel">
        <p className="ps-addon-panel-title">{t('addOnOrder.tracking.title')}</p>
        <div className="ps-addon-empty">{t('addOnOrder.tracking.empty')}</div>
      </div>
    );
  }

  return (
    <div className="ps-addon-panel ps-addon-tracking-panel">
      <p className="ps-addon-panel-title">{t('addOnOrder.tracking.title')}<span>{t('addOnOrder.tracking.count', { count: orders.length })}</span></p>
      <ul className="ps-addon-tracking-list">
        {orders.map(row => (
          <li key={row.order.id} className="ps-addon-tracking-row">
            <div className="ps-addon-tracking-row-top">
              <div>
                <strong>{row.specimenLabel}{row.blockLabel}</strong> — {row.order.stainName}
                {row.order.addOnPanelName && <span className="ps-addon-cart-panel-badge"> · {row.order.addOnPanelName}</span>}
              </div>
              <span className={`ps-addon-stage-badge ${STAGE_CLASS[row.stage] ?? ''}`}>{t(`addOnOrder.tracking.stage.${row.stage.replace(/[ /]/g, '')}`)}</span>
            </div>
            <div className="ps-addon-tracking-row-meta">
              {row.order.orderedByPathologistName && t('addOnOrder.tracking.orderedBy', { name: row.order.orderedByPathologistName })}
              {row.order.addOnPriority && ` · ${t(`addOnOrder.priority.${row.order.addOnPriority.replace(/[\s/-]+/g, '_')}`)}`}
              {row.order.routedQueueLabel && ` · ${row.order.routedQueueLabel}`}
            </div>

            {row.stage === 'Requested' && (
              <button type="button" className="ps-addon-row-btn" onClick={() => onMarkBlockRetrieved(row.blockId, row.order.id)}>
                {t('addOnOrder.tracking.markRetrieved')}
              </button>
            )}

            {row.stage !== 'Exception' && row.stage !== 'Cancelled' && row.stage !== 'Checked Out / Scanned' && (
              flagTargetId === row.order.id ? (
                <div className="ps-addon-exception-form">
                  <select className="ps-addon-field-input" value={flagReason} onChange={e => setFlagReason(e.target.value as BlockExceptionReason)}>
                    {BLOCK_EXCEPTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input className="ps-addon-field-input" placeholder={t('addOnOrder.tracking.exceptionNote') as string} value={flagNote} onChange={e => setFlagNote(e.target.value)} />
                  <div className="ps-addon-exception-actions">
                    <button type="button" className="ps-btn-primary" onClick={() => { onFlagException(row.blockId, row.order.id, flagReason, flagNote || undefined); setFlagTargetId(null); setFlagNote(''); }}>{t('addOnOrder.tracking.confirmFlag')}</button>
                    <button type="button" className="ps-btn-secondary" onClick={() => setFlagTargetId(null)}>{t('addOnOrder.tracking.cancelFlag')}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ps-addon-row-btn ps-addon-row-btn--warn" onClick={() => setFlagTargetId(row.order.id)}>
                  {t('addOnOrder.tracking.flagException')}
                </button>
              )
            )}

            {row.stage === 'Exception' && (
              <div className="ps-addon-exception-banner">
                <div><strong>{row.order.exception?.reason}</strong> {row.order.exception?.note && `— ${row.order.exception.note}`}</div>
                <div className="ps-addon-tracking-row-meta">{t('addOnOrder.tracking.flaggedBy', { name: row.order.exception?.flaggedByName })}</div>
                <input className="ps-addon-field-input" placeholder={t('addOnOrder.tracking.responseNote') as string} value={responseNote} onChange={e => setResponseNote(e.target.value)} />
                <div className="ps-addon-exception-actions">
                  <button type="button" className="ps-btn-primary" onClick={() => { onResolveException(row.blockId, row.order.id, 'approve_destructive_cut', responseNote || undefined, undefined); setResponseNote(''); }}>
                    {t('addOnOrder.tracking.approveDestructive')}
                  </button>
                  <button type="button" className="ps-btn-secondary" onClick={() => { onResolveException(row.blockId, row.order.id, 'modify', responseNote || undefined, {}); setResponseNote(''); }}>
                    {t('addOnOrder.tracking.modify')}
                  </button>
                  <button type="button" className="ps-btn-secondary" onClick={() => { onResolveException(row.blockId, row.order.id, 'cancel', responseNote || undefined, undefined); setResponseNote(''); }}>
                    {t('addOnOrder.tracking.cancelOrder')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OrderTrackingDashboard;
