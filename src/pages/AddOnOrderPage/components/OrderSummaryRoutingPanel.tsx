// src/pages/AddOnOrderPage/components/OrderSummaryRoutingPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own Right Panel: "Order Summary & Routing —
// active request cart, priority selector, target lab routing, digital
// signature/submission." "Digital signature" here is the real,
// existing actor identity (orderedByPathologistId/Name, stamped by
// createAddOnOrder) — this app has no separate e-signature capture
// mechanism anywhere to reuse or fabricate one for, so submission
// itself (by the authenticated pathologist) is what's recorded as the
// real, attributable order-placing act, same posture every other real
// "ordered by"/"assigned by" field in this app already takes.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Facility } from '@/services/facilities/IFacilityService';
import type { ScanStation } from '@/services/scanStations/IScanStationService';
import { ADD_ON_ORDER_PRIORITIES, SLIDE_MEDIA_TYPES, type AddOnOrderPriority, type SlideMediaType } from '@/types/case/AddOnOrder';
import type { AddOnOrderLineInput, AddOnOrderSubmissionInput } from '@/utils/addOnOrderOperations';

export interface CartLine extends AddOnOrderLineInput {
  cartId: string;
}

export interface OrderSummaryRoutingPanelProps {
  cart: CartLine[];
  onRemoveLine: (cartId: string) => void;
  selectedBlockCount: number;
  priority: AddOnOrderPriority;
  onPriorityChange: (p: AddOnOrderPriority) => void;
  slideMediaType: SlideMediaType;
  onSlideMediaTypeChange: (m: SlideMediaType) => void;
  cuttingInstructions: string;
  onCuttingInstructionsChange: (v: string) => void;
  referenceLabs: Facility[];
  sendOutFacilityId: string;
  onSendOutFacilityChange: (id: string, name: string) => void;
  stationsForLine: (line: AddOnOrderLineInput) => ScanStation[];
  performingLabResolved: boolean;
  onSubmit: (submission: AddOnOrderSubmissionInput) => void;
  submitDisabled: boolean;
}

const OrderSummaryRoutingPanel: React.FC<OrderSummaryRoutingPanelProps> = ({
  cart, onRemoveLine, selectedBlockCount, priority, onPriorityChange, slideMediaType, onSlideMediaTypeChange,
  cuttingInstructions, onCuttingInstructionsChange, referenceLabs, sendOutFacilityId, onSendOutFacilityChange,
  stationsForLine, performingLabResolved, onSubmit, submitDisabled,
}) => {
  const { t } = useTranslation();
  const hasSendOut = cart.some(l => l.orderKind === 'molecular');

  const handleSubmit = () => {
    const lab = referenceLabs.find(f => f.id === sendOutFacilityId);
    onSubmit({
      priority, slideMediaType, cuttingInstructions: cuttingInstructions || undefined,
      sendOutReferenceLabFacilityId: lab?.id, sendOutReferenceLabName: lab?.name,
    });
  };

  return (
    <div className="ps-addon-panel">
      <p className="ps-addon-panel-title">{t('addOnOrder.summary.title')}</p>

      <div className="ps-addon-cart-meta">{t('addOnOrder.summary.blocksSelected', { count: selectedBlockCount })}</div>

      {cart.length === 0 ? (
        <div className="ps-addon-empty">{t('addOnOrder.summary.emptyCart')}</div>
      ) : (
        <ul className="ps-addon-cart-list">
          {cart.map(line => (
            <li key={line.cartId} className="ps-addon-cart-row">
              <div>
                <strong>{line.stainType.name}</strong>
                {line.panelName && <span className="ps-addon-cart-panel-badge"> · {line.panelName}</span>}
                {line.levelDepthMicrons !== undefined && <div className="ps-addon-cart-row-meta">{t('addOnOrder.summary.microns', { count: line.levelDepthMicrons })}</div>}
                {line.controlMode && line.controlMode !== 'none' && <div className="ps-addon-cart-row-meta">{t(`addOnOrder.builder.controlMode.${line.controlMode}`)}</div>}
                <div className="ps-addon-cart-row-meta">
                  {stationsForLine(line).length > 0
                    ? t('addOnOrder.summary.routesTo', { stations: stationsForLine(line).map(s => s.name).join(', ') })
                    : t('addOnOrder.summary.routesToQueueOnly')}
                </div>
              </div>
              <button type="button" className="ps-addon-row-btn" onClick={() => onRemoveLine(line.cartId)}>{t('addOnOrder.summary.remove')}</button>
            </li>
          ))}
        </ul>
      )}

      {!performingLabResolved && cart.length > 0 && (
        <div className="ps-addon-warning-banner">{t('addOnOrder.summary.noPerformingLab')}</div>
      )}

      <label className="ps-addon-field-label">{t('addOnOrder.summary.priority')}</label>
      <div className="ps-addon-kind-toggle">
        {ADD_ON_ORDER_PRIORITIES.map(p => (
          <button key={p} type="button" className={`ps-addon-toggle-btn${priority === p ? ' ps-addon-toggle-btn--active' : ''}`} onClick={() => onPriorityChange(p)}>
            {t(`addOnOrder.priority.${p.replace(/[\s/-]+/g, '_')}`)}
          </button>
        ))}
      </div>

      <label className="ps-addon-field-label">{t('addOnOrder.summary.slideMedia')}</label>
      <div className="ps-addon-kind-toggle">
        {SLIDE_MEDIA_TYPES.map(m => (
          <button key={m} type="button" className={`ps-addon-toggle-btn${slideMediaType === m ? ' ps-addon-toggle-btn--active' : ''}`} onClick={() => onSlideMediaTypeChange(m)}>
            {t(`addOnOrder.slideMedia.${m.replace(/ /g, '_')}`)}
          </button>
        ))}
      </div>

      <label className="ps-addon-field-label">{t('addOnOrder.summary.cuttingInstructions')}</label>
      <textarea className="ps-addon-field-textarea" rows={3} value={cuttingInstructions} onChange={e => onCuttingInstructionsChange(e.target.value)} />

      {hasSendOut && (
        <>
          <label className="ps-addon-field-label">{t('addOnOrder.summary.sendOutLab')}</label>
          <select className="ps-addon-field-input" value={sendOutFacilityId} onChange={e => { const f = referenceLabs.find(rl => rl.id === e.target.value); onSendOutFacilityChange(e.target.value, f?.name ?? ''); }}>
            <option value="">{t('addOnOrder.summary.selectLab')}</option>
            {referenceLabs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </>
      )}

      <button type="button" className="ps-btn-primary ps-addon-submit-btn" disabled={submitDisabled} onClick={handleSubmit}>
        {t('addOnOrder.summary.submit')}
      </button>
    </div>
  );
};

export default OrderSummaryRoutingPanel;
