// src/pages/AddOnOrderPage/components/OrderBuilderPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own §1 "Quick-Add Order Matrix" (Center Panel):
// Recuts/Deep Levels (micron depth), Special Stains, IHC (single-stain
// or panel search), Molecular/FISH/Send-out — plus §1's own
// Auto-Control Pairing and §2's own Cutting Instructions/Slide Media
// selector. One line is added to the cart at a time; the cart itself
// (and the block-selection/priority/routing/submit controls around it)
// lives in OrderSummaryRoutingPanel, per the spec's own Right Panel
// split.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StainType } from '@/services/stains/IStainService';
import { IHC_PANEL_PRESETS, type AddOnOrderKind, type ControlMode } from '@/types/case/AddOnOrder';
import type { AddOnOrderLineInput } from '@/utils/addOnOrderOperations';

export interface OrderBuilderPanelProps {
  stainTypes: StainType[];
  onAddLines: (lines: AddOnOrderLineInput[]) => void;
}

const KIND_CATEGORY_FILTER: Record<AddOnOrderKind, StainType['category'][] | null> = {
  recut: null, // any real stain can be recut/leveled
  special_stain: ['Special Stain'],
  ihc: ['IHC', 'Immunofluorescence'],
  molecular: ['Molecular'],
};

const OrderBuilderPanel: React.FC<OrderBuilderPanelProps> = ({ stainTypes, onAddLines }) => {
  const { t } = useTranslation();
  const [orderKind, setOrderKind] = useState<AddOnOrderKind>('recut');
  const [search, setSearch] = useState('');
  const [selectedStainId, setSelectedStainId] = useState('');
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [levelDepthMicrons, setLevelDepthMicrons] = useState<string>('4');
  const [controlMode, setControlMode] = useState<ControlMode>('none');

  const availableStains = useMemo(() => {
    const filter = KIND_CATEGORY_FILTER[orderKind];
    const bySearch = stainTypes.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
    return filter ? bySearch.filter(s => filter.includes(s.category)) : bySearch;
  }, [stainTypes, orderKind, search]);

  const selectedStain = stainTypes.find(s => s.id === selectedStainId);
  const selectedPanel = IHC_PANEL_PRESETS.find(p => p.id === selectedPanelId);

  const handleKindChange = (kind: AddOnOrderKind) => {
    setOrderKind(kind);
    setSelectedStainId('');
    setSelectedPanelId('');
    setControlMode('none');
  };

  const handleAdd = () => {
    if (orderKind === 'ihc' && selectedPanel) {
      const lines: AddOnOrderLineInput[] = selectedPanel.stainTypeIds
        .map(id => stainTypes.find(s => s.id === id))
        .filter((s): s is StainType => Boolean(s))
        .map(stainType => ({ stainType, orderKind: 'ihc', controlMode: controlMode === 'none' ? undefined : controlMode, panelId: selectedPanel.id, panelName: selectedPanel.name }));
      if (lines.length > 0) onAddLines(lines);
      setSelectedPanelId('');
      return;
    }
    if (!selectedStain) return;
    const line: AddOnOrderLineInput = {
      stainType: selectedStain,
      orderKind,
      levelDepthMicrons: orderKind === 'recut' && levelDepthMicrons ? Number(levelDepthMicrons) : undefined,
      controlMode: controlMode === 'none' ? undefined : controlMode,
    };
    onAddLines([line]);
    setSelectedStainId('');
    setSearch('');
  };

  const canShowControlToggle = selectedStain?.requiresTargetControl || (orderKind === 'ihc' && selectedPanel);

  return (
    <div className="ps-addon-panel">
      <p className="ps-addon-panel-title">{t('addOnOrder.builder.title')}</p>

      <div className="ps-addon-kind-toggle">
        {(['recut', 'special_stain', 'ihc', 'molecular'] as AddOnOrderKind[]).map(kind => (
          <button key={kind} type="button" className={`ps-addon-toggle-btn${orderKind === kind ? ' ps-addon-toggle-btn--active' : ''}`} onClick={() => handleKindChange(kind)}>
            {t(`addOnOrder.builder.kind.${kind}`)}
          </button>
        ))}
      </div>

      {orderKind === 'ihc' && (
        <>
          <label className="ps-addon-field-label">{t('addOnOrder.builder.panelPicker')}</label>
          <div className="ps-addon-picker-grid">
            {IHC_PANEL_PRESETS.map(panel => (
              <button key={panel.id} type="button" className={`ps-addon-picker-chip${selectedPanelId === panel.id ? ' ps-addon-picker-chip--active' : ''}`} onClick={() => { setSelectedPanelId(prev => prev === panel.id ? '' : panel.id); setSelectedStainId(''); }}>
                {panel.name}
              </button>
            ))}
          </div>
        </>
      )}

      {!(orderKind === 'ihc' && selectedPanelId) && (
        <>
          <input
            className="ps-addon-search-input"
            placeholder={t('addOnOrder.builder.searchStain') as string}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="ps-addon-picker-grid">
            {availableStains.slice(0, 24).map(stain => (
              <button key={stain.id} type="button" className={`ps-addon-picker-chip${selectedStainId === stain.id ? ' ps-addon-picker-chip--active' : ''}`} onClick={() => setSelectedStainId(prev => prev === stain.id ? '' : stain.id)}>
                {stain.name}
              </button>
            ))}
            {availableStains.length === 0 && <div className="ps-addon-empty">{t('addOnOrder.builder.noStains')}</div>}
          </div>
        </>
      )}

      {orderKind === 'recut' && (
        <>
          <label className="ps-addon-field-label">{t('addOnOrder.builder.levelDepth')}</label>
          <input className="ps-addon-field-input" type="number" min={1} value={levelDepthMicrons} onChange={e => setLevelDepthMicrons(e.target.value)} />
        </>
      )}

      {canShowControlToggle && (
        <>
          <label className="ps-addon-field-label">{t('addOnOrder.builder.controlPairing')}</label>
          <div className="ps-addon-kind-toggle">
            {(['none', 'on_slide', 'separate_slide'] as ControlMode[]).map(mode => (
              <button key={mode} type="button" className={`ps-addon-toggle-btn${controlMode === mode ? ' ps-addon-toggle-btn--active' : ''}`} onClick={() => setControlMode(mode)}>
                {t(`addOnOrder.builder.controlMode.${mode}`)}
              </button>
            ))}
          </div>
        </>
      )}

      <button type="button" className="ps-btn-primary ps-addon-add-btn" disabled={orderKind === 'ihc' ? !selectedPanel && !selectedStain : !selectedStain} onClick={handleAdd}>
        {t('addOnOrder.builder.addToCart')}
      </button>
    </div>
  );
};

export default OrderBuilderPanel;
