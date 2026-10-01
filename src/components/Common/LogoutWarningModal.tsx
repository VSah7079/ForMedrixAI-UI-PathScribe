// src/components/Common/LogoutWarningModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Moved here from pages/WorklistPage/LogoutWarningModal.tsx -- was one of
// TWO separate implementations of the same "unsaved changes, log out
// anyway?" dialog (the other lived at
// pages/SynopticReportPage/modals/LogoutWarningModal.tsx, with a
// different prop interface: show/onCancel/onConfirm instead of this
// one's isOpen/onClose/onLogout, and its own separate, uncorrected
// zIndex: 25000 bug). Consolidated into one shared component specifically
// because SynopticReportPage.tsx is a critical, high-traffic file where
// two same-named components with different behavior is a real support-
// analyst confusion risk, not just a style inconsistency.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';

interface LogoutWarningModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  onLogout: () => void;
}

const LogoutWarningModal: React.FC<LogoutWarningModalProps> = ({ isOpen, onClose, onLogout }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;
  return (
    <div className="ps-overlay" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="ps-modal-dark ps-modal-dark--logout-warning">
        <div className="ps-logout-warning-icon-wrap">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <span className="ps-modal-dark-title">{t('logoutWarningModal.title')}</span>
        <p className="ps-modal-dark-body">
          {t('logoutWarningModal.body')}
        </p>
        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch ps-modal-dark-footer--stretch-stacked">
          <button className="ps-btn-primary ps-btn-primary--full" onClick={onClose} autoFocus>
            ← {t('logoutWarningModal.returnToPageButton')}
          </button>
          <button className="ps-btn-red ps-btn-red--full" onClick={onLogout}>
            {t('logoutWarningModal.logOutAndDiscardButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutWarningModal;
