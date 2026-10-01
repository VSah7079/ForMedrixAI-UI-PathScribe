// src/pages/AddOnOrderPage/components/BlockContextPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own Left Panel: "Block & Tissue Context —
// available blocks, tissue description, remaining block volume/
// thickness warnings, prior levels cut, grossing notes." Block
// selection here (checkbox) is what "Block Selection" in §1's own
// Quick-Add Order Matrix drives — one order can target several blocks
// at once, each getting its own real StainOrder(s) when submitted.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Specimen, HistologyBlock } from '@/types/case/Specimen';
import { isExhausted, isLost, isDamaged } from '@/utils/blockExceptionStates';

export interface BlockContextPanelProps {
  specimens: Specimen[];
  selectedBlockIds: string[];
  onToggleBlock: (blockId: string) => void;
}

const BlockContextPanel: React.FC<BlockContextPanelProps> = ({ specimens, selectedBlockIds, onToggleBlock }) => {
  const { t } = useTranslation();

  const blockDisabled = (block: HistologyBlock) => isExhausted(block) || isLost(block) || isDamaged(block) || block.status === 'Cancelled';
  const blockStatusLabel = (block: HistologyBlock): string | null => {
    if (isExhausted(block)) return t('addOnOrder.blockContext.exhausted');
    if (isLost(block)) return t('addOnOrder.blockContext.lost');
    if (isDamaged(block)) return t('addOnOrder.blockContext.damaged');
    if (block.status === 'Cancelled') return t('addOnOrder.blockContext.cancelled');
    return null;
  };

  return (
    <div className="ps-addon-panel">
      <p className="ps-addon-panel-title">{t('addOnOrder.blockContext.title')}</p>
      {specimens.length === 0 ? (
        <div className="ps-addon-empty">{t('addOnOrder.blockContext.empty')}</div>
      ) : (
        specimens.map(specimen => (
          <div key={specimen.id} className="ps-addon-specimen-group">
            <p className="ps-addon-specimen-label">{t('addOnOrder.blockContext.specimen', { label: specimen.label, description: specimen.description ?? '' })}</p>
            {(specimen.blocks ?? []).length === 0 ? (
              <div className="ps-addon-empty">{t('addOnOrder.blockContext.noBlocks')}</div>
            ) : (
              (specimen.blocks ?? []).map(block => {
                const disabled = blockDisabled(block);
                const statusLabel = blockStatusLabel(block);
                const selected = selectedBlockIds.includes(block.id);
                return (
                  <label key={block.id} className={`ps-addon-block-row${selected ? ' ps-addon-block-row--selected' : ''}${disabled ? ' ps-addon-block-row--disabled' : ''}`}>
                    <input type="checkbox" checked={selected} disabled={disabled} onChange={() => onToggleBlock(block.id)} />
                    <div className="ps-addon-block-row-body">
                      <div className="ps-addon-block-row-top">
                        <strong>{specimen.label}{block.label}</strong>
                        {statusLabel && <span className="ps-addon-block-status-badge">{statusLabel}</span>}
                      </div>
                      <div className="ps-addon-block-row-meta">
                        {t('addOnOrder.blockContext.levelsCut', { count: block.stains.length })}
                        {block.tinyTissue && <span className="ps-addon-block-flag"> · {t('addOnOrder.blockContext.tinyTissue')}</span>}
                        {block.fragile && <span className="ps-addon-block-flag"> · {t('addOnOrder.blockContext.fragile')}</span>}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default BlockContextPanel;
