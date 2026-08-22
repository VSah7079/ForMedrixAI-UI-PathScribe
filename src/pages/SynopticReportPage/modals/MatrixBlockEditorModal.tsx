// src/pages/SynopticReportPage/modals/MatrixBlockEditorModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, architectural fix, per direct follow-up: "the matrix block
// itself is the tracked asset." A real MatrixBlock (types/case/
// MatrixBlock.ts) is no longer one of a specimen's own HistologyBlock
// records, so BlockStainEditorModal.tsx's own editor — which only
// ever knows how to read/write a block nested under one specimen —
// has nowhere to point once a shared cassette has real participants
// instead. This is that real, dedicated editor: same real fields
// (status, piece tracking) as the ordinary block editor, same
// established UI conventions (ps-conf-* classes), scoped to what a
// MatrixBlock actually has. Slide/stain editing on MatrixBlock.slides
// is deliberately NOT included here yet — a real, separate, later
// pass, same honest scoping this whole migration has used throughout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import type { MatrixBlock } from '@/types/case/MatrixBlock';
import type { Specimen } from '@/types/case/Specimen';
import { findForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';
import { buildSecondaryLabelDataForMatrixBlock } from '@/utils/labels/buildSecondaryLabelData';
import { buildSecondaryLabelHtml } from '@/utils/labels/buildLabelHtml';
import { printLabels } from '@/utils/labels/printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';
import ForeignIdFields from './ForeignIdFields';

const BLOCK_STATUSES = ['Pending', 'Grossed', 'Embedded', 'Exhausted', 'Lost', 'Damaged'] as const;

interface MatrixBlockEditorModalProps {
  matrixBlock: MatrixBlock;
  specimens: Specimen[];
  fullAccession: string;
  onUpdate: (matrixBlockId: string, changes: Partial<MatrixBlock>) => void;
  onPrintCassette: () => void;
  onEditMembership: () => void;
  onClose: () => void;
}

const MatrixBlockEditorModal: React.FC<MatrixBlockEditorModalProps> = ({
  matrixBlock, specimens, fullAccession, onUpdate, onPrintCassette, onEditMembership, onClose,
}) => {
  // Real feature, per direct follow-up: "If the lab receives a block
  // and it has an engraved id, we treat that as a foreign id." Same
  // real, on-blur collision check as BlockStainEditorModal.tsx's own
  // identical fields — see that file's own comment for the full
  // reasoning on why this checks on blur, not every keystroke.
  const [foreignIdCollision, setForeignIdCollision] = useState<ForeignIdCollision | null>(null);

  // Real fix, per direct follow-up: "the rapid-keystroke race
  // condition on onUpdateBlock/onUpdateDecant." Now takes the real,
  // just-typed values directly (from ForeignIdFields' own local state
  // at blur) rather than reading matrixBlock.externalId/
  // externalIdSource — see BlockStainEditorModal.tsx's own identical
  // fix for the full reasoning.
  const checkCollision = async (externalId: string, externalIdSource: string) => {
    if (!externalId || !externalIdSource) {
      setForeignIdCollision(null);
      return;
    }
    const result = await findForeignIdCollision(externalIdSource, externalId, matrixBlock.id);
    setForeignIdCollision(result);
  };

  // Real feature, per direct follow-up: "Fallback Physical Relabeling
  // (Secondary Labeling)... place an adhesive slide/cassette secondary
  // label over the non-tissue side... rather than attempting laser
  // re-engraving." Real, honest guard baked into
  // buildSecondaryLabelDataForMatrixBlock itself — returns null
  // without a real foreign id on file, so this silently no-ops rather
  // than printing a meaningless label; the button below is only shown
  // once a real foreign id exists in the first place, so this should
  // never actually hit that guard in practice.
  const printSecondaryLabel = () => {
    const data = buildSecondaryLabelDataForMatrixBlock(fullAccession, matrixBlock);
    if (!data) return;
    const preset = getLabelSizePreset('histology_secondary_overlay');
    if (!preset) return;
    const html = buildSecondaryLabelHtml(data, preset);
    printLabels([html], preset, `Secondary Label — ${data.recordLabel}`);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Biopsy Array {matrixBlock.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                One real, physical cassette — status and piece tracking apply to the whole object, not any one participant.
              </div>
            </div>
            {/* Real feature, per direct follow-up: "primary label
                printing for matrix blocks." Same real, on-demand
                reprint capability as an ordinary block's own — always
                available here, unlike the secondary/fallback label
                below which only appears once a real foreign id is on
                file. */}
            <button
              type="button" onClick={onPrintCassette}
              className="ps-teal-action-btn ps-teal-action-btn--inline"
            >
              🖨️ Reprint Cassette Label
            </button>
          </div>
        </div>

        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
            Participants ({matrixBlock.participants.length})
          </div>
          <div style={{ marginBottom: 16 }}>
            {matrixBlock.participants
              .slice()
              .sort((a, b) => a.positionInBlock - b.positionInBlock)
              .map(p => {
                const sp = specimens.find(s => s.id === p.specimenId);
                return (
                  <div key={p.specimenId} style={{ fontSize: 12, color: '#cbd5e1', padding: '3px 0' }}>
                    Position {p.positionInBlock} — Specimen {sp?.label ?? '?'}{sp?.description ? ` (${sp.description})` : ''}
                  </div>
                );
              })}
            <button
              type="button" onClick={onEditMembership}
              style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              ✏️ Edit membership
            </button>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="matrix-block-status">Status</label>
              <select
                id="matrix-block-status" className="ps-conf-select" value={matrixBlock.status}
                onChange={e => onUpdate(matrixBlock.id, { status: e.target.value as MatrixBlock['status'] })}
              >
                {BLOCK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="matrix-piece-count">Pieces Grossed</label>
              <input
                id="matrix-piece-count" type="number" min={0} className="ps-conf-select"
                value={matrixBlock.pieceCount ?? ''}
                placeholder="e.g. 3"
                onChange={e => {
                  const n = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdate(matrixBlock.id, { pieceCount: n });
                }}
              />
            </div>
            <div className="ps-conf-form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 22 }}>
                <input
                  type="checkbox"
                  checked={matrixBlock.isEntirelySubmitted ?? true}
                  onChange={e => onUpdate(matrixBlock.id, { isEntirelySubmitted: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>Entirely submitted (none held in wet storage)</span>
              </label>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="matrix-piece-desc">Piece Description</label>
            <input
              id="matrix-piece-desc" type="text" className="ps-conf-select"
              value={matrixBlock.pieceDescription ?? ''}
              placeholder="e.g. 2 core fragments, 1 tiny dust piece"
              onChange={e => onUpdate(matrixBlock.id, { pieceDescription: e.target.value || undefined })}
            />
          </div>

          {/* Real feature, per direct follow-up: "If the lab receives
              a block and it has an engraved id, we treat that as a
              foreign id." A real, received, shared cassette (a
              referring institution's own multi-specimen block) gets
              the identical treatment as an ordinary received block —
              reuses MatrixBlock.externalId/externalIdSource directly,
              the same established fields, never a second, competing
              mechanism. */}
          <ForeignIdFields
            key={matrixBlock.id}
            externalId={matrixBlock.externalId}
            externalIdSource={matrixBlock.externalIdSource}
            idPrefix={`matrix-${matrixBlock.id}`}
            sourcePlaceholder="e.g. Riverside Medical Center"
            idPlaceholder="e.g. the id already engraved on the cassette"
            collision={foreignIdCollision}
            onCommit={changes => onUpdate(matrixBlock.id, changes)}
            onCheckCollision={checkCollision}
          />
          {/* Real feature, per direct follow-up: "Fallback Physical
              Relabeling (Secondary Labeling)... place an adhesive
              slide/cassette secondary label over the non-tissue side
              or associate a local print tag rather than attempting
              laser re-engraving." Only shown once a real foreign id
              exists — this is a fallback specifically for a foreign,
              pre-engraved barcode that a hardware scanner can't read,
              never a substitute for the real engrave-dispatch path an
              ordinary, PathScribe-created cassette already uses. */}
          {matrixBlock.externalId && matrixBlock.externalIdSource && (
            <button
              type="button" onClick={printSecondaryLabel}
              className="ps-teal-action-btn ps-teal-action-btn--block"
            >
              🖨️ Print Secondary Label (barcode unreadable)
            </button>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(148,163,184,0.15)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: '#0891B2', border: 'none', color: 'white', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatrixBlockEditorModal;
