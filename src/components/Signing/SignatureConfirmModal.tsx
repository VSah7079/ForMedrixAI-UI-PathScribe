// src/components/Signing/SignatureConfirmModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 344 (PS-60 follow-up): a small modal that confirms who is signing
// before an action that had no confirmation at all: cytology sign-out and
// the autopsy PAD/FAD signatures. The case sign-out, synoptic finalize and
// pre-finalisation screens build the same fields into their own layout.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useSignerConfirmation } from '@/hooks/useSignerConfirmation';
import type { SignatureConfirmation, SigningAction } from '@/services/auth/signerConfirmation';
import { SignerConfirmationFields } from './SignerConfirmationFields';

interface Props {
  show: boolean;
  action: SigningAction;
  /** The case's accession, for the audit entry. */
  caseRef?: string | null;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirmed: (confirmation: SignatureConfirmation) => void;
  onCancel: () => void;
}

export const SignatureConfirmModal: React.FC<Props> = ({ show, action, caseRef, title, message, confirmLabel, onConfirmed, onCancel }) => {
  const { t } = useTranslation();
  const signer = useSignerConfirmation(action, caseRef);
  const { reset } = signer;
  useEffect(() => { if (!show) reset(); }, [show, reset]);
  if (!show) return null;

  // Straight from the click: for SSO this opens the provider's popup.
  const submit = () => { void signer.confirm().then(c => { if (c) onConfirmed(c); }); };

  return (
    <div data-capture-hide="true" className="ps-overlay">
      <div className="ps-modal-dark ps-modal-dark--sm ps-modal-dark--centered" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ps-modal-dark-emoji" aria-hidden="true">✍️</div>
        <h2 className="ps-signer-modal-title">{title}</h2>
        {message && <p className="ps-signer-modal-message">{message}</p>}
        <SignerConfirmationFields signer={signer} onSubmit={submit} />
        <div className="ps-modal-dark-footer ps-modal-dark-footer--stretch">
          <button type="button" className="ps-btn-ghost-dark ps-modal-dark-footer__flex-btn" onClick={onCancel} disabled={signer.busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="ps-btn-green ps-modal-dark-footer__flex-btn"
            onClick={submit}
            disabled={signer.busy || signer.method === 'unavailable'}
          >
            {signer.busy ? t('signerConfirmation.confirming') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureConfirmModal;
