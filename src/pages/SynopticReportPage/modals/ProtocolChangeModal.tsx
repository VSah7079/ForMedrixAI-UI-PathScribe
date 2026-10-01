// src/pages/SynopticReportPage/modals/ProtocolChangeModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shown when AI re-evaluates synoptic protocol assignments after microscopic
// description is submitted. Displays a diff of current vs proposed protocols
// with per-change checkboxes and a commit action.
//
// Trigger: microscopic saved → AI evaluates → if changes proposed → this modal.
//
// i18n note: `change.reason` is a real, AI-generated justification string
// (data) — interpolated into a translated quoted template, never itself
// translated, same as other real reason/justification strings elsewhere
// (e.g. BlockStainEditorModal.tsx's cancel/restain reason lines).
// `change.specimenLabel`/`.specimenDesc`/`.currentTemplateName`/
// `.proposedTemplateName` are likewise real data.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import type { ProtocolChange, ProtocolChangeAction } from '@/types/case/Case';

// ProtocolChange / ProtocolChangeAction moved to Case.ts (see comment
// there) — this file no longer defines them, only imports and uses them.
export type { ProtocolChange, ProtocolChangeAction };

interface ProtocolChangeModalProps {
  show:       boolean;
  changes:    ProtocolChange[];
  /** Called with the IDs of changes the pathologist approved */
  onCommit:   (acceptedIds: string[]) => void | Promise<void>;
  onCancel:   () => void;
}

// ── Confidence colour ─────────────────────────────────────────────────────────

function confColor(c: number): string {
  return c >= 85 ? '#34d399' : c >= 70 ? '#fbbf24' : '#f87171';
}

// ── Change row ────────────────────────────────────────────────────────────────

const ChangeRow: React.FC<{
  change:    ProtocolChange;
  selected:  boolean;
  onToggle:  () => void;
}> = ({ change, selected, onToggle }) => {
  const { t } = useTranslation();
  return (
    <div
      className={`ps-proto-change-row${selected ? ' ps-proto-change-row--selected' : ''}`}
      onClick={onToggle}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        className="ps-proto-change-checkbox"
      />

      <div className="ps-proto-change-body">
        {/* Specimen label */}
        <div className="ps-proto-change-specimen">
          <span className="ps-proto-change-specimen-badge">{change.specimenLabel}</span>
          <span className="ps-proto-change-specimen-desc">{change.specimenDesc}</span>
        </div>

        {/* Protocol diff — 'add' has no current template, 'remove' has no proposed one */}
        <div className="ps-proto-change-diff">
          <div className="ps-proto-change-current">
            <span className="ps-proto-change-diff-label">{t('protocolChangeModal.currentLabel')}</span>
            <span className="ps-proto-change-diff-name ps-proto-change-diff-name--current">
              {change.currentTemplateName ?? t('protocolChangeModal.noneAssigned')}
            </span>
          </div>
          <span className="ps-proto-change-arrow">→</span>
          <div className="ps-proto-change-proposed">
            <span className="ps-proto-change-diff-label">{t('protocolChangeModal.proposedLabel')}</span>
            <span className="ps-proto-change-diff-name ps-proto-change-diff-name--proposed">
              {change.proposedTemplateName ?? t('protocolChangeModal.removeNoLongerNeeded')}
            </span>
          </div>
        </div>

        {/* AI reason */}
        <p className="ps-proto-change-reason">{t('protocolChangeModal.reasonQuoted', { reason: change.reason })}</p>

        {/* Confidence */}
        <span
          className="ps-proto-change-confidence"
          style={{ '--ps-hue': confColor(change.confidence) } as React.CSSProperties}
        >
          ✦ {t('protocolChangeModal.confidencePercent', { percent: change.confidence })}
        </span>
      </div>
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────────

export const ProtocolChangeModal: React.FC<ProtocolChangeModalProps> = ({
  show, changes, onCommit, onCancel,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(changes.map(c => c.id)));

  // Reset selection when modal opens with new changes
  React.useEffect(() => {
    if (show) setSelected(new Set(changes.map(c => c.id)));
  }, [show, changes]);

  const allSelected  = selected.size === changes.length;
  const noneSelected = selected.size === 0;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(changes.map(c => c.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCommit = () => onCommit(Array.from(selected));

  if (!show || changes.length === 0) return null;

  return (
    <div className="ps-overlay ps-overlay--proto-change">
      <div className="ps-modal-dark ps-proto-modal">

        {/* Header */}
        <div className="ps-proto-modal-header">
          <div className="ps-proto-modal-header-left">
            <div className="fm-eyebrow fm-eyebrow--sky">
              ✦ {t('protocolChangeModal.eyebrow')}
            </div>
            <h2 className="ps-modal-dark-title ps-modal-dark-title--no-margin">
              {t('protocolChangeModal.title')}
            </h2>
            <p className="ps-modal-dark-hint ps-modal-dark-hint--tight">
              {t('protocolChangeModal.subtitle', { count: changes.length })}
            </p>
          </div>
          <button onClick={onCancel} className="ps-modal-close">×</button>
        </div>

        {/* Select all */}
        <div className="ps-proto-select-all" onClick={toggleAll}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            onClick={e => e.stopPropagation()}
            ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
            className="ps-proto-change-checkbox"
          />
          <span className="ps-proto-select-all-label">
            {allSelected ? t('protocolChangeModal.deselectAll') : t('protocolChangeModal.selectAll')}
          </span>
          <span className="ps-proto-select-all-count">
            {t('protocolChangeModal.selectedCount', { selected: selected.size, total: changes.length })}
          </span>
        </div>

        {/* Change list */}
        <div className="ps-proto-modal-list">
          {changes.map(change => (
            <ChangeRow
              key={change.id}
              change={change}
              selected={selected.has(change.id)}
              onToggle={() => toggle(change.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button className="ps-btn-ghost-dark ps-proto-modal-footer-btn--flex1" onClick={onCancel}>
            {t('protocolChangeModal.keepExistingButton')}
          </button>
          <button
            onClick={handleCommit}
            disabled={noneSelected}
            className={`ps-proto-modal-footer-btn--flex2 ${noneSelected ? 'ps-btn-ghost-dark' : 'ps-btn-primary'}`}
          >
            {noneSelected
              ? t('protocolChangeModal.noChangesSelected')
              : t('protocolChangeModal.applyChangesButton', { count: selected.size })}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ProtocolChangeModal;
