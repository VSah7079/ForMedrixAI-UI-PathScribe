// src/components/Common/SessionSupersededNotice.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shown on LoginPage.tsx after a same-browser session-supersede logout —
// not on ProtectedRoute.tsx itself, since that component unmounts and
// redirects to /login the moment logout() runs, giving no time for a modal
// rendered there to actually be seen. LoginPage.tsx checks for the real
// marker this leaves behind (see AuthContext.tsx's logout wiring) and
// renders this once, on arrival.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';

interface SessionSupersededNoticeProps {
  onDismiss: () => void;
}

const SessionSupersededNotice: React.FC<SessionSupersededNoticeProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-overlay">
      <div className="ps-modal-dark ps-modal-sm">
        <span className="ps-modal-dark-title ps-modal-dark-title--session-superseded">
          {t('sessionSupersededNotice.title')}
        </span>
        <p className="ps-modal-dark-body ps-modal-dark-body--session-superseded">
          {t('sessionSupersededNotice.body')}
        </p>
        <div className="ps-modal-dark-footer">
          <button type="button" className="ps-btn-amber" onClick={onDismiss}>
            {t('sessionSupersededNotice.okButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionSupersededNotice;
