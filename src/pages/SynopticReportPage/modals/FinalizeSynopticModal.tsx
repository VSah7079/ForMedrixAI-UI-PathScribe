// src/pages/SynopticReportPage/modals/FinalizeSynopticModal.tsx
// The per-synoptic finalize confirmation (deferred/amendment flow).
// Batch 344 (PS-60 follow-up): the password typed here used to go nowhere;
// now the signer is confirmed (services/auth/signerConfirmation.ts) before
// onConfirm runs. `activeSynoptic?.title` is data and is not translated;
// its fallback reuses `rightSynopticPanel.templatePicker.title`.

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SignerConfirmationFields } from '@/components/Signing/SignerConfirmationFields';
import { useSignerConfirmation } from '@/hooks/useSignerConfirmation';
import type { SignatureConfirmation } from '@/services/auth/signerConfirmation';
type SynopticReport = any;

interface FinalizeSynopticModalProps {
  show: boolean;
  activeSynoptic: SynopticReport | null;
  finalizeAndNext: boolean;
  /** The case's accession, for the audit entry. */
  caseRef?: string | null;
  onClose: () => void;
  onConfirm: (confirmation: SignatureConfirmation) => void;
}

const FinalizeSynopticModal: React.FC<FinalizeSynopticModalProps> = ({
  show, activeSynoptic, finalizeAndNext, caseRef, onClose, onConfirm,
}) => {
  const { t } = useTranslation();
  const signer = useSignerConfirmation('synoptic-finalize', caseRef);
  const { reset } = signer;
  useEffect(() => { if (!show) reset(); }, [show, reset]);
  if (!show) return null;
  // Straight from the click: for SSO this opens the provider's popup.
  const confirmAndFinalize = () => { void signer.confirm().then(c => { if (c) onConfirm(c); }); };

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
          {t('finalizeSynopticModal.bodyLocks')}
        </p>

        <SignerConfirmationFields signer={signer} onSubmit={confirmAndFinalize} />

        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            onClick={confirmAndFinalize}
            disabled={signer.busy || signer.method === 'unavailable'}
            className="ps-btn-primary ps-modal-dark-footer__flex-btn"
          >
            🔒 {signer.busy ? t('signerConfirmation.confirming') : t('finalizeSynopticModal.confirmButton')}{finalizeAndNext && !signer.busy ? ' →' : ''}
          </button>
        </div>

      </div>
    </div>
  );
};

export default FinalizeSynopticModal;
