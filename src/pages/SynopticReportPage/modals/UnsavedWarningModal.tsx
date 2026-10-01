/**
 * UnsavedWarningModal.tsx
 * src/pages/SynopticReportPage/modals/UnsavedWarningModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when the user tries to navigate away from a case with unsaved changes.
 *
 * Three options:
 *   Save & Leave   — saves draft and navigates
 *   Discard & Leave — discards changes and navigates
 *   Stay           — cancels navigation, returns to case
 * ─────────────────────────────────────────────────────────────────────────────
 */

// i18n note: `dirtySections` entries are section names passed in by the
// caller (already-resolved display text from the synoptic form's own
// section list), not literal UI chrome authored in this file, so they
// are rendered as-is here. Title reuses
// `synopticEditor.discardConfirm.title` and the Save & Leave button
// reuses `synopticEditor.discardConfirm.saveDraftAndLeaveButton`
// (exact-text matches from that dialog's own equivalent copy, the
// latter already carrying its own 💾 prefix) — body text and the other
// two buttons differ in wording from that dialog, so they got new keys.

import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';

interface UnsavedWarningModalProps {
  show:            boolean;
  dirtySections?:  string[];           // which sections have unsaved changes
  onSaveAndLeave?: () => void;         // save draft then navigate
  onConfirm:       () => void;         // discard and navigate
  onCancel:        () => void;         // stay on page
}

const UnsavedWarningModal: React.FC<UnsavedWarningModalProps> = ({
  show, dirtySections = [], onSaveAndLeave, onConfirm, onCancel,
}) => {
  const { t } = useTranslation();
  if (!show) return null;

  const hasSections = dirtySections.length > 0;

  return (
    <div
      data-capture-hide="true"
      className="ps-overlay ps-overlay--unsaved-warning"
      onClick={onCancel}
    >
      <div
        className="ps-modal-dark ps-modal-dark--narrow ps-modal-dark--centered"
        onClick={e => e.stopPropagation()}
      >
        <div className="ps-modal-dark-emoji">⚠️</div>

        <div className="ps-modal-dark-header ps-modal-dark-header--center">
          <span className="ps-modal-dark-title">{t('synopticEditor.discardConfirm.title')}</span>
        </div>

        <p className="ps-modal-dark-body ps-modal-dark-body--center">
          {t('unsavedWarningModal.body')}
        </p>

        {/* Dirty section list */}
        {hasSections && (
          <div className="ps-unsaved-sections">
            {dirtySections.map(s => (
              <div key={s} className="ps-unsaved-section-row">
                <span className="ps-unsaved-section-dot">●</span>
                <span className="ps-unsaved-section-label">{s}</span>
              </div>
            ))}
          </div>
        )}

        <div className="ps-modal-dark-footer ps-modal-dark-footer--col">
          {/* Save & Leave — primary action */}
          {onSaveAndLeave && (
            <button
              className="ps-btn-primary ps-modal-dark-footer__flex-btn"
              onClick={onSaveAndLeave}
            >
              {t('synopticEditor.discardConfirm.saveDraftAndLeaveButton')}
            </button>
          )}

          {/* Discard & Leave */}
          <button
            className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn ps-unsaved-discard-btn"
            onClick={onConfirm}
          >
            {t('unsavedWarningModal.discardAndLeaveButton')}
          </button>

          {/* Stay */}
          <button
            className="ps-btn-secondary ps-modal-dark-footer__flex-btn"
            onClick={onCancel}
          >
            {t('unsavedWarningModal.stayOnPageButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsavedWarningModal;
