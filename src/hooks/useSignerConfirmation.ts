// src/hooks/useSignerConfirmation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 344 (PS-60 follow-up): the state a signing screen needs to confirm
// who is signing, around services/auth/signerConfirmation.ts (exported from
// `@/services` as `signerConfirmation`), which makes every decision.
//
//   const signer = useSignerConfirmation('case-sign-out', accession);
//   <SignerConfirmationFields signer={signer} onSubmit={go} />
//   const go = () => signer.confirm().then(c => { if (c) onConfirm(c); });
//
// confirm() must be called straight from the click (no await before it):
// for an SSO session it opens the identity provider's popup, and browsers
// only allow that during the click.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signerConfirmation } from '@/services';
import type { SignatureConfirmation, SignerResult, SigningAction } from '@/services/auth/signerConfirmation';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/utils/formatDate';

export function useSignerConfirmation(action: SigningAction, caseRef?: string | null) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const method = signerConfirmation.method();
  const needsUsername = method === 'password' && signerConfirmation.needsUsername();

  const reset = useCallback(() => {
    setUsername(''); setPassword(''); setError(''); setBusy(false);
  }, []);

  const handle = useCallback((r: SignerResult): SignatureConfirmation | null => {
    setBusy(false);
    if (r.ok === true) { setPassword(''); setError(''); return r.confirmation; }
    const message = r.reason === 'locked' && r.lockedUntil
      ? t('signerConfirmation.error.locked', { time: formatDateTime(r.lockedUntil, i18n.language) })
      : t(`signerConfirmation.error.${r.reason}`);
    setError(r.attemptsLeft !== undefined && r.attemptsLeft > 0
      ? t('signerConfirmation.messageWithAttempts', { message, attempts: t('signerConfirmation.attemptsLeft', { count: r.attemptsLeft }) })
      : message);
    if (r.reason === 'wrong_credentials') setPassword('');
    return null;
  }, [t, i18n.language]);

  /** Resolves with the confirmation, or null (the reason is in `error`). */
  const confirm = useCallback((): Promise<SignatureConfirmation | null> => {
    setError('');
    const pending = method === 'sso'
      ? signerConfirmation.withSso({ action, caseRef })
      : method === 'password'
        ? signerConfirmation.withPassword({ username, password, action, caseRef })
        : Promise.resolve<SignerResult>({ ok: false, reason: 'unavailable' });
    setBusy(true);
    return pending.then(handle);
  }, [method, action, caseRef, username, password, handle]);

  /** The simulated biometric (demo builds only). */
  const confirmBiometric = useCallback((): Promise<SignatureConfirmation | null> => {
    setError('');
    setBusy(true);
    return signerConfirmation.withBiometric({ action, caseRef }).then(handle);
  }, [action, caseRef, handle]);

  return {
    method,
    needsUsername,
    biometricAllowed: signerConfirmation.biometricAllowed(),
    signerName: user?.name ?? '',
    signerCredentials: user?.credentials ?? '',
    username, setUsername,
    password, setPassword,
    error, busy,
    confirm, confirmBiometric, reset,
  };
}

export type SignerConfirmationState = ReturnType<typeof useSignerConfirmation>;
