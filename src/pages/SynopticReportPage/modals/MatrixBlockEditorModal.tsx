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
import { useTranslation } from 'react-i18next';
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
// Real, persisted enum values (matrixBlock.status) stay as data — only
// the displayed option text translates, same LABEL_KEY pattern used
// elsewhere in this sweep for other persisted status enums (and the
// same real English text as BlockStainEditorModal.tsx's own identical
// BLOCK_STATUSES, translated fresh here under this component's own
// namespace per this session's established per-component convention).
const BLOCK_STATUS_LABEL_KEY: Record<typeof BLOCK_STATUSES[number], string> = {
  Pending: 'matrixBlockEditorModal.blockStatusLabels.pending',
  Grossed: 'matrixBlockEditorModal.blockStatusLabels.grossed',
  Embedded: 'matrixBlockEditorModal.blockStatusLabels.embedded',
  Exhausted: 'matrixBlockEditorModal.blockStatusLabels.exhausted',
  Lost: 'matrixBlockEditorModal.blockStatusLabels.lost',
  Damaged: 'matrixBlockEditorModal.blockStatusLabels.damaged',
};

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
  const { t } = useTranslation();
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

  return (
    <div onClick={onClose} className="ps-ms-overlay">
      <div onClick={e => e.stopPropagation()} className="ps-ms-modal ps-matrixblock-modal">
        <div className="ps-matrixblock-header">
          <div className="ps-matrixblock-header-top">
            <div>
              <div className="ps-matrixblock-title">{t('matrixBlockEditorModal.header.title', { label: matrixBlock.label })}</div>
              <div className="ps-matrixblock-subtitle">
                {t('matrixBlockEditorModal.header.subtitle')}
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
              🖨️ {t('matrixBlockEditorModal.header.reprintCassette')}
            </button>
          </div>
          <div className="ps-matrixblock-tabs">
            <button
              className={`ps-matrixblock-tab-btn${tab === 'details' ? ' ps-matrixblock-tab-btn--active' : ''}`}
              onClick={() => setTab('details')}
            >
              {t('matrixBlockEditorModal.tabs.details')}
            </button>
            <button
              className={`ps-matrixblock-tab-btn${tab === 'array_mapping' ? ' ps-matrixblock-tab-btn--active' : ''}`}
              onClick={() => setTab('array_mapping')}
            >
              {t('matrixBlockEditorModal.tabs.arrayMapping')}
            </button>
          </div>
        </div>

        {tab === 'details' && (
        <div className="ps-matrixblock-body">
          <div className="ps-matrixblock-section-title">
            {t('matrixBlockEditorModal.details.participantsHeading', { count: matrixBlock.participants.length })}
          </div>
          <div className="ps-matrixblock-participants-list">
            {sortedParticipants
              .map(p => {
                const sp = specimens.find(s => s.id === p.specimenId);
                return (
                  <div key={p.specimenId} className="ps-matrixblock-participant-row">
                    {t('matrixBlockEditorModal.details.participantRow', { position: p.positionInBlock, label: sp?.label ?? '?' })}{sp?.description ? ` (${sp.description})` : ''}
                  </div>
                );
              })}
            <button
              type="button" onClick={onEditMembership}
              className="ps-matrixblock-edit-membership-btn"
            >
              ✏️ {t('matrixBlockEditorModal.details.editMembership')}
            </button>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="matrix-block-status">{t('matrixBlockEditorModal.details.statusLabel')}</label>
              <select
                id="matrix-block-status" className="ps-conf-select" value={matrixBlock.status}
                onChange={e => onUpdate(matrixBlock.id, { status: e.target.value as MatrixBlock['status'] })}
              >
                {BLOCK_STATUSES.map(s => <option key={s} value={s}>{t(BLOCK_STATUS_LABEL_KEY[s])}</option>)}
              </select>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="matrix-piece-count">{t('matrixBlockEditorModal.details.piecesGrossedLabel')}</label>
              <input
                id="matrix-piece-count" type="number" min={0} className="ps-conf-select"
                value={matrixBlock.pieceCount ?? ''}
                placeholder={t('matrixBlockEditorModal.details.piecesGrossedPlaceholder')}
                onChange={e => {
                  const n = e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdate(matrixBlock.id, { pieceCount: n });
                }}
              />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-matrixblock-checkbox-label">
                <input
                  type="checkbox"
                  checked={matrixBlock.isEntirelySubmitted ?? true}
                  onChange={e => onUpdate(matrixBlock.id, { isEntirelySubmitted: e.target.checked })}
                  className="ps-matrixblock-checkbox-input"
                />
                <span className="ps-matrixblock-checkbox-text">{t('matrixBlockEditorModal.details.entirelySubmitted')}</span>
              </label>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="matrix-piece-desc">{t('matrixBlockEditorModal.details.pieceDescriptionLabel')}</label>
            <input
              id="matrix-piece-desc" type="text" className="ps-conf-select"
              value={matrixBlock.pieceDescription ?? ''}
              placeholder={t('matrixBlockEditorModal.details.pieceDescriptionPlaceholder')}
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
            sourcePlaceholder={t('matrixBlockEditorModal.details.foreignIdSourcePlaceholder')}
            idPlaceholder={t('matrixBlockEditorModal.details.foreignIdPlaceholder')}
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
              🖨️ {t('matrixBlockEditorModal.details.printSecondaryLabel')}
            </button>
          )}
        </div>
        )}

        {tab === 'array_mapping' && (
        <div className="ps-matrixblock-body">
          <div className="ps-matrixblock-section-title ps-matrixblock-section-title--tight">
            {t('matrixBlockEditorModal.arrayMapping.heading')}
          </div>
          <div className="ps-matrixblock-array-desc">
            {t('matrixBlockEditorModal.arrayMapping.description')}
          </div>

          <div
            className="ps-matrixblock-core-grid"
            style={{
              gridTemplateColumns: `repeat(${columnsFor(sortedParticipants.length)}, 1fr)`,
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
                  className={`ps-matrixblock-core-btn${selected ? ' ps-matrixblock-core-btn--selected' : ''}`}
                >
                  <span className="ps-matrixblock-core-coord">{coord}</span>
                  <span className="ps-matrixblock-core-label">{sp?.label ?? '?'}</span>
                  <span className="ps-matrixblock-core-check">{selected ? '☑' : '☐'}</span>
                </button>
              );
            })}
          </div>

          {/* Real, per direct spec: an "Order Ancillary Stain" action
              bar that uncollapses once one or more cores are selected. */}
          {selectedSpecimenIds.size > 0 && (
            <div className="ps-matrixblock-order-bar">
              <div className="ps-matrixblock-order-bar-title">
                {t('matrixBlockEditorModal.arrayMapping.orderBarTitle', { count: selectedSpecimenIds.size })}
              </div>
              <input
                type="text" className="ps-conf-select"
                placeholder={t('matrixBlockEditorModal.arrayMapping.searchStainsPlaceholder')}
                value={stainQuery}
                onChange={e => setStainQuery(e.target.value)}
                disabled={ordering}
              />
              {stainQuery.trim().length > 0 && (
                <div className="ps-matrixblock-stain-results">
                  {stainMatches.length === 0 && (
                    <div className="ps-matrixblock-stain-empty">{t('matrixBlockEditorModal.arrayMapping.noMatchingStains')}</div>
                  )}
                  {stainMatches.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={ordering}
                      onClick={() => handleOrderStain(s.name)}
                      className="ps-matrixblock-stain-btn"
                    >
                      {s.name} <span className="ps-matrixblock-stain-cat">({s.category})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ps-matrixblock-section-title">
            {t('matrixBlockEditorModal.arrayMapping.ancillaryStainsHeading')}
          </div>
          {matrixBlock.slides.filter(s => s.stainName !== 'H&E').length === 0 ? (
            <div className="ps-matrixblock-stain-empty">{t('matrixBlockEditorModal.arrayMapping.noAncillaryStains')}</div>
          ) : (
            matrixBlock.slides.filter(s => s.stainName !== 'H&E').map(s => {
              const targetLabels = (s.targetSpecimenIds ?? [])
                .map(id => specimens.find(sp => sp.id === id)?.label ?? id)
                .join(', ');
              return (
                <div key={s.id} className="ps-matrixblock-slide-row">
                  <span className="ps-matrixblock-slide-name">{s.stainName}</span>
                  {' — '}
                  {targetLabels ? (
                    <span className="ps-matrixblock-slide-target">{t('matrixBlockEditorModal.arrayMapping.targeted', { targets: targetLabels })}</span>
                  ) : (
                    <span className="ps-matrixblock-slide-target--missing">{t('matrixBlockEditorModal.arrayMapping.noCoreTargeted')}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}

        <div className="ps-matrixblock-footer">
          <button
            onClick={onClose}
            className="ps-matrixblock-done-btn"
          >
            {t('matrixBlockEditorModal.doneButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatrixBlockEditorModal;
