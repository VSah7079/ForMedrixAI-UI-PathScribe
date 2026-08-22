// src/pages/SynopticReportPage/components/GrossingReleasePanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow: "The PA sees the pre-resolved default cassettes
// queued up on screen (e.g., 'Block A1: GREEN / MESH'). The PA can
// accept them as-is, adjust the block count (e.g., add A2 or delete
// A1), or override the resolved color."
//
// Shown only for a specimen with at least one real, still-'Pending'
// block that hydrateGrossingBlocks.ts has already resolved a
// cassetteColorId for — a real specimen with no such blocks renders
// nothing extra at all, same posture as every other conditional
// section in MaterialTreePanel.tsx.
//
// No business logic here — purely displays already-resolved real
// data and reports the PA's own choices (remove, override color,
// release) via callbacks; every real decision (which color, which
// default count) already happened in hydrateGrossingBlocks.ts before
// this component ever renders.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import CassetteColorControl from '../modals/CassetteColorControl';
import type { HistologyBlock } from '@/types/case/Specimen';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';

interface GrossingReleasePanelProps {
  specimenLabel: string;
  pendingBlocks: HistologyBlock[];
  cassetteColors: CassetteColorDefinition[];
  onOverrideColor: (blockId: string, colorId: string) => void;
  onRemove: (blockId: string) => void;
  onRelease: (blockIds: string[]) => void;
}

const GrossingReleasePanel: React.FC<GrossingReleasePanelProps> = ({ specimenLabel, pendingBlocks, cassetteColors, onOverrideColor, onRemove, onRelease }) => {
  if (pendingBlocks.length === 0) return null;

  return (
    <div className="ps-grossing-release-panel">
      <div className="ps-grossing-release-panel-title">
        {pendingBlocks.length} cassette{pendingBlocks.length === 1 ? '' : 's'} resolved — ready to release
      </div>
      {pendingBlocks.map(block => (
        <div key={block.id} className="ps-grossing-release-row">
          <div className="ps-grossing-release-label">Block {specimenLabel}{block.label}</div>
          <CassetteColorControl
            colorId={block.cassetteColorId}
            overridden={block.cassetteColorOverridden}
            colors={cassetteColors}
            onChange={colorId => onOverrideColor(block.id, colorId)}
          />
          <button
            type="button"
            className="ps-grossing-release-remove"
            onClick={() => onRemove(block.id)}
            title={`Remove Block ${specimenLabel}${block.label} — not physically created`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ps-teal-action-btn ps-teal-action-btn--block"
        onClick={() => onRelease(pendingBlocks.map(b => b.id))}
      >
        🖨️ Release &amp; Print All
      </button>
    </div>
  );
};

export default GrossingReleasePanel;
