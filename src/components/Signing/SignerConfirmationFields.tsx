// src/components/Signing/SignerConfirmationFields.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 344 (PS-60 follow-up): the "confirm it's you" part of a signing
// screen. Renders only; the state comes from useSignerConfirmation and the
// decisions from services/auth/signerConfirmation.ts.
//
//   password session → username (first signature in this sign-in) + password
//   SSO session      → a line saying the provider will ask them to sign in again
//   neither          → why signing isn't available
//
// `onSubmit` runs on Enter in a field; it must call signer.confirm() directly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { SignerConfirmationState } from '@/hooks/useSignerConfirmation';

interface Props {
  signer: SignerConfirmationState;
  onSubmit: () => void;
  /** 'stacked' for modals, 'inline' for the pre-finalisation signing bar. */
  variant?: 'stacked' | 'inline';
  autoFocus?: boolean;
}

export const SignerConfirmationFields: React.FC<Props> = ({ signer, onSubmit, variant = 'stacked', autoFocus = true }) => {
  const { t } = useTranslation();
  const id = useId();
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !signer.busy) { e.preventDefault(); onSubmit(); }
  };
  const errorId = `${id}-error`;
  const invalid = signer.error ? true : undefined;

  return (
    <div className={`ps-signer ps-signer--${variant}`}>
      <p className="ps-signer-identity">
        {signer.signerCredentials
          ? t('signerConfirmation.signingAsWithCredentials', { name: signer.signerName, credentials: signer.signerCredentials })
          : t('signerConfirmation.signingAs', { name: signer.signerName })}
      </p>

      {signer.method === 'password' && (
        <p className="ps-signer-note">
          {signer.needsUsername ? t('signerConfirmation.promptUsernamePassword') : t('signerConfirmation.promptPassword')}
        </p>
      )}

      {signer.method === 'password' && (
        <div className="ps-signer-fields">
          {signer.needsUsername && (
            <div className="ps-signer-field">
              <label className="ps-modal-dark-label" htmlFor={`${id}-user`}>{t('signerConfirmation.username')}</label>
              <input
                id={`${id}-user`}
                type="text"
                autoComplete="username"
                autoFocus={autoFocus}
                value={signer.username}
                onChange={e => signer.setUsername(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t('signerConfirmation.usernamePlaceholder')}
                aria-invalid={invalid}
                aria-describedby={signer.error ? errorId : undefined}
                className={`ps-modal-dark-input${signer.error ? ' ps-modal-dark-input--error' : ''}`}
              />
            </div>
          )}
          <div className="ps-signer-field">
            <label className="ps-modal-dark-label" htmlFor={`${id}-pw`}>{t('signerConfirmation.password')}</label>
            <input
              id={`${id}-pw`}
              type="password"
              autoComplete="current-password"
              autoFocus={autoFocus && !signer.needsUsername}
              value={signer.password}
              onChange={e => signer.setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('signerConfirmation.passwordPlaceholder')}
              aria-invalid={invalid}
              aria-describedby={signer.error ? errorId : undefined}
              className={`ps-modal-dark-input${signer.error ? ' ps-modal-dark-input--error' : ''}`}
            />
          </div>
        </div>
      )}

      {signer.method === 'sso' && (
        <p className="ps-signer-note">
          {t('signerConfirmation.ssoNote')}
        </p>
      )}

      {signer.method === 'unavailable' && (
        <p className="ps-signer-error" role="alert">{t('signerConfirmation.error.unavailable')}</p>
      )}

      {signer.busy && signer.method === 'sso' && (
        <p className="ps-signer-note" role="status">{t('signerConfirmation.waitingForProvider')}</p>
      )}

      {signer.error && (
        <p id={errorId} className="ps-signer-error" role="alert">{signer.error}</p>
      )}
    </div>
  );
};

export default SignerConfirmationFields;
