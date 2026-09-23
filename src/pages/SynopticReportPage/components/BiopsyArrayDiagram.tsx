// src/pages/SynopticReportPage/components/BiopsyArrayDiagram.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct confirmation: "I wanted to be able to assign each
// core to a specific section of a single block... so the Pathologist can
// always identify what section of the block the core tissue was embedded
// into." "I like the Physical block diagram, but only if it doesn't impact
// performance."
//
// Deliberately plain, static SVG — a handful of <rect>/<text> elements
// computed once per render from real block data, no canvas, no animation, no
// charting library, nothing that recomputes per-frame. At realistic
// Biopsy Array sizes (2-12 positions — a full prostate mapping biopsy is the
// upper end of what any real lab does) this is trivially cheap; the same
// order of cost as the existing BlockIcon/SlideChip components already
// rendered throughout MaterialTreePanel.tsx.
//
// i18n note: `cassetteLabel`/`p.specimenLabel`/`p.specimenDescription`/
// `p.position` are real block/specimen data, interpolated into
// translated sentences, never translated themselves.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export interface BiopsyArrayPosition {
  position: number;
  specimenLabel: string;
  specimenDescription?: string;
  blockId: string;
  blockLabel: string;
}

interface BiopsyArrayDiagramProps {
  cassetteLabel: string;
  positions: BiopsyArrayPosition[];
  onOpenBlockEditor: (blockId: string) => void;
}

// Real, fixed layout constants — not computed per-render, not configurable.
// Grid columns scale gently with count so the block reads as roughly
// square regardless of how many positions it holds (a 3-core Biopsy Array
// isn't a single long strip; a 12-core one isn't a single tall column).
export function columnsFor(count: number): number {
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  return 4;
}

/**
 * Real, per direct spec (PS-93's Array Mapper): a human-facing "Core
 * Coordinate" (e.g. "A1", "A2", "B1") for a given 1-indexed
 * MatrixBlockParticipant.positionInBlock, laid out row-major against
 * the exact same columnsFor(count) shape this diagram already renders
 * — so a coordinate shown in the Array Mapper always matches the same
 * cell's real position in this diagram, never a second, independently-
 * computed layout that could disagree. Deliberately distinct from
 * MatrixBlock.label ("M1") and matrixBlockIdentifier() (types/labels/
 * LabelData.ts, the printed cassette identifier) — this is a
 * within-block position, not an identifier for the block itself.
 */
export function positionToCoreCoordinate(position: number, totalCount: number): string {
  const cols = columnsFor(totalCount);
  const zeroIndexed = position - 1;
  const row = Math.floor(zeroIndexed / cols);
  const col = (zeroIndexed % cols) + 1;
  const rowLetter = String.fromCharCode(65 + row); // 65 = 'A'
  return `${rowLetter}${col}`;
}

const CELL = 46;
const GAP = 4;
const PAD = 10;

const BiopsyArrayDiagram: React.FC<BiopsyArrayDiagramProps> = ({ cassetteLabel, positions, onOpenBlockEditor }) => {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...positions].sort((a, b) => a.position - b.position),
    [positions]
  );
  const cols = columnsFor(sorted.length);
  const rows = Math.ceil(sorted.length / cols);
  const width  = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + rows * CELL + (rows - 1) * GAP + 20; // +20 for the cassette-label strip

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 40, marginBottom: 12 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
        {/* Cassette outline — same amber/brown language as BlockIcon, so a
            Biopsy Array still visually reads as "a block" at a glance. */}
        <rect
          x={1} y={1} width={width - 2} height={height - 2} rx={4}
          fill="rgba(186,117,23,0.10)" stroke="rgba(148,163,184,0.3)" strokeWidth={0.5}
        />
        <text x={width / 2} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#cbd5e1">
          {cassetteLabel}
        </text>
        {sorted.map((p, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = PAD + col * (CELL + GAP);
          const y = 20 + PAD + row * (CELL + GAP);
          return (
            <g
              key={p.blockId}
              onClick={() => onOpenBlockEditor(p.blockId)}
              style={{ cursor: 'pointer' }}
            >
              <title>
                {t('biopsyArrayDiagram.positionTooltip', { position: p.position, label: p.specimenLabel })}
                {p.specimenDescription ? t('biopsyArrayDiagram.tooltipDescriptionSuffix', { description: p.specimenDescription }) : ''}
              </title>
              <rect
                x={x} y={y} width={CELL} height={CELL} rx={3}
                fill="rgba(8,145,178,0.12)" stroke="rgba(148,163,184,0.35)" strokeWidth={0.5}
              />
              <text x={x + CELL / 2} y={y + CELL / 2 - 3} textAnchor="middle" fontSize={13} fontWeight={700} fill="#e2e8f0">
                {p.specimenLabel}
              </text>
              <text x={x + CELL / 2} y={y + CELL / 2 + 11} textAnchor="middle" fontSize={8} fill="#94a3b8">
                {t('biopsyArrayDiagram.positionShort', { position: p.position })}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
        {sorted.map(p => (
          <div key={p.blockId}>
            <Trans
              i18nKey="biopsyArrayDiagram.legendRow"
              values={{ position: p.position, label: p.specimenLabel }}
              components={{ bold: <span style={{ fontWeight: 700, color: '#cbd5e1' }} /> }}
            />
            {p.specimenDescription ? t('biopsyArrayDiagram.legendDescriptionSuffix', { description: p.specimenDescription }) : ''}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BiopsyArrayDiagram;
