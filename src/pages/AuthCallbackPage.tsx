/**
 * AuthCallbackPage.tsx — src/pages/AuthCallbackPage.tsx
 * PS-60 (Batch 343). Public route /auth/callback/:providerId, where the
 * identity provider sends the browser back after sign-in.
 *
 *   signed in                  → the page the user was trying to open
 *   already signed in elsewhere → the same prompt as the password form;
 *                                continuing signs the other tab out
 *   refused                    → the login page, which explains why
 *
 * The work is in services/auth (via useAuth); this page only shows progress.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import '../pathscribe.css';
import { useAuth } from '../contexts/AuthContext';
import ConfirmModal from '../components/Common/ConfirmModal';
import type { LoginRouteState } from './LoginPage';

const AuthCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { providerId = '' } = useParams();
  const { completeSsoSignIn, resolvePendingSsoSignIn } = useAuth();
  const [conflictReturnPath, setConflictReturnPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // completeSsoSignIn returns the same result for a repeated call with
    // the same URL, so React StrictMode's second run is harmless.
    void completeSsoSignIn(providerId, window.location.href).then(r => {
      if (cancelled) return;
      if (r.outcome === 'success') navigate(r.returnPath, { replace: true });
      else if (r.outcome === 'session_conflict') setConflictReturnPath(r.returnPath);
      else navigate('/login', { replace: true, state: { ssoError: r.reason } satisfies LoginRouteState });
    });
    return () => { cancelled = true; };
  }, [providerId, completeSsoSignIn, navigate]);

  return (
    <div className="ps-login-page">
      <div className="ps-login-bg" aria-hidden="true" />
      <div className="ps-login-wrap">
        <div className="ps-login-card ps-auth-callback" role="status" aria-live="polite">
          <img src="/pathscribe-logo-clean.png" alt="PathScribe" className="ps-login-hero" />
          <p className="ps-auth-callback-text">{t('login.ssoCompleting')}</p>
        </div>
      </div>

      <ConfirmModal
        show={conflictReturnPath !== null}
        title={t('login.sessionConflictTitle')}
        message={t('login.sessionConflictMessage')}
        confirmLabel={t('login.signInHere')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          const target = conflictReturnPath ?? '/';
          setConflictReturnPath(null);
          if (await resolvePendingSsoSignIn(true)) navigate(target, { replace: true });
          else navigate('/login', { replace: true });
        }}
        onCancel={async () => {
          setConflictReturnPath(null);
          await resolvePendingSsoSignIn(false);
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
};

export default AuthCallbackPage;
