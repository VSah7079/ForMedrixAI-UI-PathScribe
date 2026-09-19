// src/pages/EmbeddingStationPage/components/EmbeddingCenterPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-285's own Center Panel: "Piece Count Verification,
// Base Mold Size Picker, Orientation Instructions, Discrepancy
// Reporting (one-touch buttons), Multi-Cassette / Split-Block
// Tracking." Same real "alert badges + context fields + row actions"
// panel shape as MicrotomyWorkstationPage.tsx's own left-panel block
// context, under this page's own ps-embedding-* prefix.
//
// Real, deliberate split: Tiny Tissue/Fragile/Decal Required stay
// toggleable badges (real, stored booleans — same as Microtomy's own
// handleSetAlertFlags); Biopsy/Needle Core are rendered read-only
// (ps-embedding-alert-badge--readonly) since they're derived, not
// stored — see resolveEmbeddingAlertBadges's own doc comment. This
// component never guesses which badges are which; the caller passes
// the already-resolved alertBadges array and this panel just renders
// the toggleable ones (from the block's own real flags) plus the
// derived ones by name.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistologyBlock, Specimen, EmbeddingMoldSize, EmbeddingDiscrepancyReason } from '@/types/case/Specimen';
import { EMBEDDING_DISCREPANCY_REASONS, EMBEDDING_MOLD_SIZES, EMBEDDING_ORIENTATION_QUICK_FILLS } from '@/utils/embeddingOperations';

export interface EmbeddingCenterPanelProps {
  specimen: Specimen;
  block: HistologyBlock;
  alertBadges: Array<'Tiny Tissue' | 'Fragile' | 'Decal Required' | 'Biopsy' | 'Needle Core'>;
  splitBlockGroupStatus: { siblings: HistologyBlock[]; allEmbedded: boolean } | null;
  onToggleAlertFlag: (flag: 'tinyTissue' | 'fragile' | 'requiresDecal') => void;
  onConfirmPieceCount: (observedCount: number) => void;
  onFlagDiscrepancy: (reason: EmbeddingDiscrepancyReason) => void;
  onSetMoldAndOrientation: (changes: { moldSize?: EmbeddingMoldSize; orientationInstructions?: string }) => void;
  onGroupSplitBlocks: (siblingBlockIds: string[]) => void;
  onOpenComments: () => void;
}

const STORED_FLAGS = ['tinyTissue', 'fragile', 'requiresDecal'] as const;
const DERIVED_BADGE_LABELS: Record<string, string> = { Biopsy: 'Biopsy', 'Needle Core': 'Needle Core' };

const EmbeddingCenterPanel: React.FC<EmbeddingCenterPanelProps> = ({
  specimen, block, alertBadges, splitBlockGroupStatus,
  onToggleAlertFlag, onConfirmPieceCount, onFlagDiscrepancy, onSetMoldAndOrientation, onGroupSplitBlocks, onOpenComments,
}) => {
  const { t } = useTranslation();
  const [observedCount, setObservedCount] = useState<string>(block.pieceCount != null ? String(block.pieceCount) : '');
  const [orientationText, setOrientationText] = useState<string>(block.orientationInstructions ?? '');
  const [groupPicker, setGroupPicker] = useState<Set<string>>(new Set());

  const siblingCandidates = (specimen.blocks ?? []).filter(b => b.id !== block.id && !b.splitBlockGroupId);
  const isEmbedded = block.status === 'Embedded';

  const handleConfirmClick = () => {
    const n = Number(observedCount);
    if (Number.isNaN(n)) return;
    onConfirmPieceCount(n);
  };

  const handleOrientationBlur = () => {
    if (orientationText !== (block.orientationInstructions ?? '')) onSetMoldAndOrientation({ orientationInstructions: orientationText });
  };

  return (
    <>
      <div className="ps-embedding-panel" style={{ marginBottom: 14 }}>
        <p className="ps-embedding-panel-title">{t('embeddingStation.context.title')}</p>

        <div className="ps-embedding-alert-badges">
          {STORED_FLAGS.map(flag => (
            <button
              key={flag} type="button"
              className={`ps-embedding-alert-badge${block[flag] ? '' : ' ps-embedding-alert-badge--off'}`}
              onClick={() => onToggleAlertFlag(flag)}
            >
              {t(`embeddingStation.context.flag.${flag}`)}
            </button>
          ))}
          {alertBadges.filter(b => b in DERIVED_BADGE_LABELS).map(b => (
            <span key={b} className="ps-embedding-alert-badge ps-embedding-alert-badge--readonly">
              {t(`embeddingStation.context.derivedBadge.${b === 'Biopsy' ? 'biopsy' : 'needleCore'}`)}
            </span>
          ))}
        </div>

        <div className="ps-embedding-context-field">{t('embeddingStation.context.status')}<strong>{block.status}</strong></div>
        {block.tissueDescription && (
          <div className="ps-embedding-context-field">{t('embeddingStation.context.tissueDescription')}<strong>{block.tissueDescription}</strong></div>
        )}

        <button type="button" className="ps-embedding-row-btn" onClick={onOpenComments}>
          💬 {t('embeddingStation.context.blockComments')}{block.comments?.length ? ` (${block.comments.length})` : ''}
        </button>
      </div>

      <div className="ps-embedding-panel" style={{ marginBottom: 14 }}>
        <p className="ps-embedding-panel-title">{t('embeddingStation.pieceCount.title')}</p>
        <div className="ps-embedding-context-field">{t('embeddingStation.pieceCount.expected')}<strong>{block.pieceCount ?? '—'}</strong></div>
        <div className="ps-embedding-piece-count-row">
          <input
            type="number" min={0} className="ps-embedding-field-input" style={{ maxWidth: 90 }}
            value={observedCount} onChange={e => setObservedCount(e.target.value)}
            disabled={isEmbedded}
          />
          <button type="button" className="ps-btn-primary" disabled={isEmbedded || observedCount === ''} onClick={handleConfirmClick}>
            ✅ {t('embeddingStation.pieceCount.confirm')}
          </button>
        </div>
        {isEmbedded && (
          <div className="ps-embedding-context-field" style={{ marginTop: 8 }}>
            {t('embeddingStation.pieceCount.observed')}<strong>{block.pieceCountAtEmbedding}</strong>
          </div>
        )}

        <p className="ps-embedding-panel-title" style={{ marginTop: 14 }}>{t('embeddingStation.discrepancy.title')}</p>
        <div className="ps-embedding-discrepancy-grid">
          {EMBEDDING_DISCREPANCY_REASONS.map(reason => (
            <button key={reason} type="button" className="ps-embedding-discrepancy-btn" onClick={() => onFlagDiscrepancy(reason)}>
              {t(`embeddingStation.discrepancy.reason.${reasonKey(reason)}`)}
            </button>
          ))}
        </div>
        {block.lastDiscrepancyReason && (
          <div className="ps-embedding-discrepancy-active">
            ⚠ {t('embeddingStation.discrepancy.lastFlagged', { reason: block.lastDiscrepancyReason, by: block.lastDiscrepancyReportedBy ?? '—' })}
          </div>
        )}
      </div>

      <div className="ps-embedding-panel" style={{ marginBottom: 14 }}>
        <p className="ps-embedding-panel-title">{t('embeddingStation.mold.title')}</p>
        <div className="ps-embedding-mold-grid">
          {EMBEDDING_MOLD_SIZES.map(size => (
            <button
              key={size} type="button"
              className={`ps-embedding-mold-chip${block.moldSize === size ? ' ps-embedding-mold-chip--active' : ''}`}
              onClick={() => onSetMoldAndOrientation({ moldSize: size })}
            >
              {size}
            </button>
          ))}
        </div>

        <label className="ps-embedding-field-label" style={{ marginTop: 10 }}>{t('embeddingStation.orientation.title')}</label>
        <textarea
          className="ps-embedding-comment-textarea"
          value={orientationText}
          placeholder={t('embeddingStation.orientation.placeholder') ?? ''}
          onChange={e => setOrientationText(e.target.value)}
          onBlur={handleOrientationBlur}
        />
        <div className="ps-embedding-orientation-quickfills">
          {EMBEDDING_ORIENTATION_QUICK_FILLS.map(fill => (
            <button
              key={fill} type="button" className="ps-embedding-row-btn"
              onClick={() => { setOrientationText(fill); onSetMoldAndOrientation({ orientationInstructions: fill }); }}
            >
              {fill}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-embedding-panel">
        <p className="ps-embedding-panel-title">{t('embeddingStation.splitBlock.title')}</p>
        {splitBlockGroupStatus ? (
          <div className={`ps-embedding-split-banner${splitBlockGroupStatus.allEmbedded ? ' ps-embedding-split-banner--complete' : ''}`}>
            {t(splitBlockGroupStatus.allEmbedded ? 'embeddingStation.splitBlock.allEmbedded' : 'embeddingStation.splitBlock.pending', {
              labels: splitBlockGroupStatus.siblings.map(b => b.label).join(', '),
            })}
          </div>
        ) : siblingCandidates.length === 0 ? (
          <div className="ps-embedding-context-field">{t('embeddingStation.splitBlock.none')}</div>
        ) : (
          <>
            <div className="ps-embedding-context-field">{t('embeddingStation.splitBlock.pickPrompt')}</div>
            {siblingCandidates.map(sib => (
              <label key={sib.id} className="ps-embedding-checkbox-label" style={{ marginBottom: 4 }}>
                <input
                  type="checkbox" checked={groupPicker.has(sib.id)}
                  onChange={e => setGroupPicker(prev => { const next = new Set(prev); e.target.checked ? next.add(sib.id) : next.delete(sib.id); return next; })}
                />
                {sib.label}
              </label>
            ))}
            <button
              type="button" className="ps-btn-secondary" style={{ marginTop: 6 }}
              disabled={groupPicker.size === 0}
              onClick={() => { onGroupSplitBlocks(Array.from(groupPicker)); setGroupPicker(new Set()); }}
            >
              {t('embeddingStation.splitBlock.group')}
            </button>
          </>
        )}
      </div>
    </>
  );
};

// Real, small, honest helper: maps a real EmbeddingDiscrepancyReason
// string to the i18n leaf-key naming convention used for the other
// enum-like keys in this namespace (camelCase, no slashes/spaces).
function reasonKey(reason: EmbeddingDiscrepancyReason): string {
  switch (reason) {
    case 'Missing Tissue/Empty Cassette': return 'missingTissue';
    case 'Extra Tissue Found': return 'extraTissue';
    case 'Unopened Cassette/Unprocessed Tissue': return 'unopenedCassette';
    case 'Damaged Cassette/Broken Hinge': return 'damagedCassette';
    default: return 'other';
  }
}

export default EmbeddingCenterPanel;
