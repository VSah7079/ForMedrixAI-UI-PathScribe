// i18n note: `activeSynoptic?.title` (a real report title) and
// `finalizeError` (a runtime validation-error string; currently never
// actually set anywhere in the app — `setFinalizeError` from
// `useSynopticFinalize.ts` has no caller — so this branch is
// presently unreachable, but left in place rather than removed since
// ripping it out would mean also touching that hook and
// `SynopticReportPage.tsx`'s own prop wiring, outside this file's own
// scope) are both real/dynamic values, not literal chrome, so neither
// is translated. The title's own "Synoptic Report" fallback reuses
// `rightSynopticPanel.templatePicker.title`, and the password field's
// placeholder reuses `caseSignOutModal.passwordPlaceholder` — both
// exact-text matches.

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
type SynopticReport = any;

interface FinalizeSynopticModalProps {
  show: boolean;
  activeSynoptic: SynopticReport | null;
  finalizePassword: string;
  finalizeError: string;
  finalizeAndNext: boolean;
  onClose: () => void;
  onPasswordChange: (value: string) => void;
  onConfirm: () => void;
}

const FinalizeSynopticModal: React.FC<FinalizeSynopticModalProps> = ({
  show, activeSynoptic, finalizePassword, finalizeError,
  finalizeAndNext, onClose, onPasswordChange, onConfirm,
}) => {
  const { t } = useTranslation();
  if (!show) return null;

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-modal-dark--narrow ps-modal-dark--centered">

        <div className="ps-modal-dark-emoji">🔒</div>

        <div className="ps-modal-dark-header ps-modal-dark-header--center">
          <span className="ps-modal-dark-title">
            {t('finalizeSynopticModal.title', { name: activeSynoptic?.title ?? t('rightSynopticPanel.templatePicker.title') })}
          </span>
        </div>

        <p className="ps-modal-dark-body ps-modal-dark-body--center">
          <Trans i18nKey="finalizeSynopticModal.body" components={{ br: <br /> }} />
        </p>

        <input
          type="password"
          autoFocus
          value={finalizePassword}
          onChange={e => onPasswordChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConfirm()}
          placeholder={t('caseSignOutModal.passwordPlaceholder')}
          className={"ps-modal-dark-input" + (finalizeError ? " ps-modal-dark-input--error" : "")}
        />

        {finalizeError && (
          <p className="ps-modal-dark-field-error">
            {finalizeError}
          </p>
        )}

        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="ps-btn-primary ps-modal-dark-footer__flex-btn"
          >
            🔒 {t('finalizeSynopticModal.confirmButton')}{finalizeAndNext ? ' →' : ''}
          </button>
        </div>

      </div>
    </div>
  );
};

export default FinalizeSynopticModal;
