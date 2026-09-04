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
// MatrixBlock actually has.
//
// Real, per direct billing-expert guidance (PS-93): now a real,
// tab-gated modal (mirroring FacilityEditorModal.tsx's own tab
// pattern, per direct spec) — "Details" is the original content
// above, "Biopsy Array / Matrix Mapping" is the new Array Mapper: an
// interactive grid for targeting a new ancillary stain order at
// specific cores/specimens. This is the real, deferred "later pass"
// this file's own header used to flag for slide/stain editing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import type { MatrixBlock } from '@/types/case/MatrixBlock';
import type { Specimen } from '@/types/case/Specimen';
import { findForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';
import { buildSecondaryLabelDataForMatrixBlock } from '@/utils/labels/buildSecondaryLabelData';
import { buildSecondaryLabelHtml } from '@/utils/labels/buildLabelHtml';
import { printLabels } from '@/utils/labels/printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';
import { columnsFor, positionToCoreCoordinate } from '../components/BiopsyArrayDiagram';
import { stainTypeService } from '@/services';
import type { StainType } from '@/services/stains/IStainService';
import ForeignIdFields from './ForeignIdFields';

const BLOCK_STATUSES = ['Pending', 'Grossed', 'Embedded', 'Exhausted', 'Lost', 'Damaged'] as const;

type Tab = 'details' | 'array_mapping';

interface MatrixBlockEditorModalProps {
  matrixBlock: MatrixBlock;
  specimens: Specimen[];
  fullAccession: string;
  onUpdate: (matrixBlockId: string, changes: Partial<MatrixBlock>) => void;
  onPrintCassette: () => void;
  onEditMembership: () => void;
  /** Real, per direct billing-expert guidance (PS-93) — the Array
   *  Mapper's own targeted ancillary stain order. See
   *  useSpecimenBlockManagement.ts's own handleOrderTargetedMatrixStain
   *  for the real implementation this is always wired to. */
  onOrderTargetedStain: (matrixBlockId: string, targetSpecimenIds: string[], stainName: string) => Promise<{ ok: boolean }>;
  onClose: () => void;
}

const MatrixBlockEditorModal: React.FC<MatrixBlockEditorModalProps> = ({
  matrixBlock, specimens, fullAccession, onUpdate, onPrintCassette, onEditMembership, onOrderTargetedStain, onClose,
}) => {
  const [tab, setTab] = useState<Tab>('details');

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

  // ── Array Mapper state (PS-93) ────────────────────────────────────────────

  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  useEffect(() => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, []);

  const sortedParticipants = matrixBlock.participants.slice().sort((a, b) => a.positionInBlock - b.positionInBlock);
  const [selectedSpecimenIds, setSelectedSpecimenIds] = useState<Set<string>>(new Set());
  const toggleCore = (specimenId: string) => {
    setSelectedSpecimenIds(prev => {
      const next = new Set(prev);
      if (next.has(specimenId)) next.delete(specimenId); else next.add(specimenId);
      return next;
    });
  };

  const [stainQuery, setStainQuery] = useState('');
  const [ordering, setOrdering] = useState(false);
  const existingStainNames = new Set(matrixBlock.slides.map(s => s.stainName));
  const stainMatches = stainTypes
    .filter(s => !existingStainNames.has(s.name))
    .filter(s => {
      const q = stainQuery.trim().toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    })
    .slice(0, 12);

  const handleOrderStain = async (stainName: string) => {
    if (selectedSpecimenIds.size === 0 || ordering) return;
    setOrdering(true);
    const result = await onOrderTargetedStain(matrixBlock.id, Array.from(selectedSpecimenIds), stainName);
    setOrdering(false);
    if (result.ok) {
      setSelectedSpecimenIds(new Set());
      setStainQuery('');
    }
  };

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    borderBottom: tab === t ? '2px solid #0891b2' : '2px solid transparent',
    color: tab === t ? '#0891b2' : '#64748b',
  });

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, width: 520, maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 20px 0', borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
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
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            <button style={tabStyle('details')} onClick={() => setTab('details')}>Details</button>
            <button style={tabStyle('array_mapping')} onClick={() => setTab('array_mapping')}>Biopsy Array / Matrix Mapping</button>
          </div>
        </div>

        {tab === 'details' && (
        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
            Participants ({matrixBlock.participants.length})
          </div>
          <div style={{ marginBottom: 16 }}>
            {sortedParticipants
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
        )}

        {tab === 'array_mapping' && (
        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>
            Array Mapper
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            Select the core(s) an ancillary stain actually needs to be ordered against, then pick the stain below.
            Billing only fires once a pathologist confirms which cores were genuinely evaluated at sign-out —
            selecting cores here targets the order, it doesn't bill anything by itself.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columnsFor(sortedParticipants.length)}, 1fr)`,
              gap: 8,
              marginBottom: 16,
              maxWidth: columnsFor(sortedParticipants.length) * 96,
            }}
          >
            {sortedParticipants.map(p => {
              const sp = specimens.find(s => s.id === p.specimenId);
              const coord = positionToCoreCoordinate(p.positionInBlock, sortedParticipants.length);
              const selected = selectedSpecimenIds.has(p.specimenId);
              return (
                <button
                  key={p.specimenId}
                  type="button"
                  onClick={() => toggleCore(p.specimenId)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: '10px 6px', borderRadius: 6, cursor: 'pointer',
                    border: selected ? '2px solid #0891b2' : '1px solid rgba(148,163,184,0.3)',
                    background: selected ? 'rgba(8,145,178,0.18)' : 'rgba(8,145,178,0.06)',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{coord}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{sp?.label ?? '?'}</span>
                  <span style={{ fontSize: 15 }}>{selected ? '☑' : '☐'}</span>
                </button>
              );
            })}
          </div>

          {/* Real, per direct spec: an "Order Ancillary Stain" action
              bar that uncollapses once one or more cores are selected. */}
          {selectedSpecimenIds.size > 0 && (
            <div style={{ border: '1px solid rgba(8,145,178,0.4)', borderRadius: 8, padding: 12, marginBottom: 16, background: 'rgba(8,145,178,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                Order Ancillary Stain — targeting {selectedSpecimenIds.size} core{selectedSpecimenIds.size !== 1 ? 's' : ''}
              </div>
              <input
                type="text" className="ps-conf-select"
                placeholder="Search stains (e.g. Ki-67, P53, PIN-4)…"
                value={stainQuery}
                onChange={e => setStainQuery(e.target.value)}
                disabled={ordering}
              />
              {stainQuery.trim().length > 0 && (
                <div style={{ marginTop: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {stainMatches.length === 0 && (
                    <div style={{ fontSize: 12, color: '#64748b', padding: '6px 2px' }}>No matching stains.</div>
                  )}
                  {stainMatches.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={ordering}
                      onClick={() => handleOrderStain(s.name)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 5,
                        fontSize: 13, color: '#e2e8f0', background: 'transparent', border: 'none', cursor: ordering ? 'default' : 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(148,163,184,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {s.name} <span style={{ color: '#64748b', fontSize: 11 }}>({s.category})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
            Ancillary Stains on This Block
          </div>
          {matrixBlock.slides.filter(s => s.stainName !== 'H&E').length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b' }}>No ancillary stains ordered on this Biopsy Array yet.</div>
          ) : (
            matrixBlock.slides.filter(s => s.stainName !== 'H&E').map(s => {
              const targetLabels = (s.targetSpecimenIds ?? [])
                .map(id => specimens.find(sp => sp.id === id)?.label ?? id)
                .join(', ');
              return (
                <div key={s.id} style={{ fontSize: 12, color: '#cbd5e1', padding: '5px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                  <span style={{ fontWeight: 700 }}>{s.stainName}</span>
                  {' — '}
                  {targetLabels ? (
                    <span style={{ color: '#94a3b8' }}>targeted: {targetLabels}</span>
                  ) : (
                    <span style={{ color: '#f59e0b' }}>no core targeted yet</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}

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
