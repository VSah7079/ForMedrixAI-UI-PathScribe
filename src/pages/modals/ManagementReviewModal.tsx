// src/pages/modals/ManagementReviewModal.tsx
// ─────────────────────────────────────────────────────────────
// The real ISO 15189 Management Review activity — a periodic,
// top-level look at a batch of closed deficiencies for patterns, not a
// per-item sign-off. Everything closed-but-unreviewed is in scope by
// default; a reviewer can deselect anything genuinely out of scope
// before submitting. One findings field for the whole batch is the
// actual point of doing this as a review, not a checklist.
// ─────────────────────────────────────────────────────────────
//
// i18n note: `typeName()` resolves a real dictionary entry, and
// `d.caseId`/`d.specimenLabel`/`d.reopenCount`/`findings` are all real
// case data — none of that is translated. The specimen label reuses
// `dispatchHistoryTimeline.specimenLabel`, "Case-level" reuses
// `qualityAssurance.operations.caseLevel` (same reuse as the sibling
// `DeficiencyHistoryModal.tsx`), "Findings" reuses `qualityAssurance
// .reviews.colFindings`, and "Cancel" reuses `common.cancel` — all
// exact-text matches. The required-field `*` marker stays a literal
// character, matching this codebase's convention elsewhere.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { SpecimenDeficiency, DeficiencyType } from '@/services/deficiencies/IDeficiencyService';

interface Props {
  unreviewedClosed: SpecimenDeficiency[];
  deficiencyTypes: DeficiencyType[];
  onSubmit: (deficiencyIds: string[], findings: string) => void;
  onClose: () => void;
}

export const ManagementReviewModal: React.FC<Props> = ({ unreviewedClosed, deficiencyTypes, onSubmit, onClose }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(unreviewedClosed.map(d => d.id)));
  const [findings, setFindings] = useState('');

  const typeName = (id: string) => deficiencyTypes.find(t => t.id === id)?.name ?? id;
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">{t('managementReviewModal.header')}</div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            {t('managementReviewModal.intro', { count: unreviewedClosed.length })}
          </p>

          <div className="ps-mrev-list">
            {unreviewedClosed.map(d => (
              <label key={d.id} className="ps-mrev-item">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                <div className="ps-mrev-item-text">
                  <strong>{d.caseId}</strong> — {d.specimenLabel ? t('dispatchHistoryTimeline.specimenLabel', { label: d.specimenLabel }) : t('qualityAssurance.operations.caseLevel')} — {typeName(d.deficiencyTypeId)}
                  {!!d.reopenCount && <span className="ps-defic-reopen-badge">↺ {d.reopenCount}</span>}
                </div>
              </label>
            ))}
            {unreviewedClosed.length === 0 && (
              <div className="ps-cmnt-thread-empty">{t('managementReviewModal.nothingClosed')}</div>
            )}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="mgmt-review-findings">{t('qualityAssurance.reviews.colFindings')} <span className="ps-conf-required">*</span></label>
            <textarea id="mgmt-review-findings" className="ps-conf-input ps-conf-textarea" value={findings} onChange={e => setFindings(e.target.value)}
              placeholder={t('managementReviewModal.findingsPlaceholder')} />
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={() => onSubmit([...selected], findings.trim())}
            disabled={selected.size === 0 || !findings.trim()}>
            {t('managementReviewModal.completeReviewButton', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
};
