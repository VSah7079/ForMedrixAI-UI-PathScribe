/**
 * LoginPage.tsx — src/pages/LoginPage.tsx
 * Public route — shown when the user is not authenticated.
 *
 * File-by-file cleanup sweep: this page already had a handful of strings
 * on t() from an earlier pass (email/password labels, sign-in button);
 * this pass closed the gap on everything that was still hardcoded
 * (descriptor, environment badge labels, forgot-password, SSO row,
 * PHI notice, error strings, and the session-conflict modal's text) —
 * see src/i18n/README.md. No inline CSS or extractable business logic
 * found; the login/autofill handling below is UI-bound by nature.
 *
 * PS-60 (Batch 343): single sign-on. Each provider configured for this
 * build (services/auth/authConfig.ts) gets a working button; with none
 * configured, the disabled "Soon" row stays as before. The password form
 * shows only when this build allows password sign-in (demo accounts).
 * After signing in, the user goes to the page they were trying to open
 * (ProtectedRoute passes it as `from`), checked by resolvePostSignInPath.
 * A refused SSO sign-in comes back from /auth/callback with its reason.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import '../pathscribe.css';
import { useAuth } from '../contexts/AuthContext';
import SessionSupersededNotice from '../components/Common/SessionSupersededNotice';
import ConfirmModal from '../components/Common/ConfirmModal';
import { consumeSupersededNotice } from '@/services/session/sessionSupersedeService';
import { resolvePostSignInPath } from '@/services/auth/sessionRole';
import { isSsoDenialReason } from '@/services/auth/externalIdentity';
import type { SsoProviderId } from '@/services/auth/authConfig';

/** Route state LoginPage reads: where the user was going, and why an SSO sign-in was refused. */
export interface LoginRouteState {
  from?: string;
  ssoError?: string;
}

const SSO_LABEL_KEYS: Record<SsoProviderId, string> = {
  microsoft: 'login.ssoMicrosoft',
  google: 'login.ssoGoogle',
  oidc: 'login.ssoOrganisation',
};

/**
 * Version is injected at build time from package.json (see vite.config.ts),
 * so package.json stays the single source of truth and `npm version` is the
 * only place a release number is ever typed. The fallback keeps the page
 * rendering if the define is missing — it degrades to no version rather than
 * throwing, and never displays a number that might be wrong.
 */
const APP_VERSION: string | null =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0
    ? __APP_VERSION__
    : null;

/**
 * Environment badge. Labs routinely run Production alongside Validation and
 * Training instances; showing which one you are signing into prevents the
 * "signed into the wrong system" class of error. Driven by VITE_APP_ENV —
 * if it is unset or unrecognised no badge renders, so the page never makes
 * a claim about the environment it cannot substantiate.
 */
const ENVIRONMENTS: Record<string, { labelKey: string; tone: string }> = {
  production:  { labelKey: 'login.environment.production',  tone: 'prod' },
  validation:  { labelKey: 'login.environment.validation',  tone: 'validation' },
  training:    { labelKey: 'login.environment.training',    tone: 'training' },
  development: { labelKey: 'login.environment.development', tone: 'dev' },
};

const resolveEnvironment = () => {
  const raw = String(import.meta.env.VITE_APP_ENV ?? '').toLowerCase().trim();
  return ENVIRONMENTS[raw] ?? null;
};

const EyeIcon: React.FC<{ open: boolean }> = ({ open }) => open ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#F25022" d="M1 1h10v10H1z"/>
    <path fill="#00A4EF" d="M13 1h10v10H13z"/>
    <path fill="#7FBA00" d="M1 13h10v10H1z"/>
    <path fill="#FFB900" d="M13 13h10v10H13z"/>
  </svg>
);

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, passwordSignInEnabled, ssoProviders, beginSsoSignIn } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const routeState = (location.state ?? {}) as LoginRouteState;

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [showSupersededNotice, setShowSupersededNotice] = useState(false);

  // Real fix, per direct bug report: "Sometimes when I log in it fails
  // to copy the user name and password into the login form... after I
  // select [Windows Hello face/PIN], it loads the user name and
  // password... Sometimes it doesn't actually move the data into the
  // fields." Confirmed directly: this is a real, well-documented class
  // of bug, not something specific to this form's own logic — a
  // password manager (especially one gated behind Windows Hello/PIN,
  // which introduces a real delay between the form mounting and the
  // credential actually being filled) writes the value straight into
  // the DOM input, which does NOT fire the real 'input'/'change' event
  // React's controlled value={} + onChange listens for — so React's
  // own state can stay empty even though the field visually looks
  // filled, and clicking Sign In submits the stale, empty state.
  //
  // Two-part fix: (1) a CSS animation on the real, standard
  // :-webkit-autofill pseudo-class (see login-brand.css) fires a real,
  // detectable animationstart DOM event the instant autofill happens
  // — far faster than any polling interval — and syncs React state
  // from the real DOM value immediately. (2) A ref-based fallback:
  // handleSubmit reads the real, current DOM value directly at the
  // moment of submission, never relying solely on React state that
  // may not have caught up — so even a genuinely missed detection
  // (a different browser, a timing edge case) still submits correctly
  // rather than repeating the same "starts blank" failure.
  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleAutofillDetected = (field: 'email' | 'password') => (e: React.AnimationEvent<HTMLInputElement>) => {
    if (e.animationName !== 'ps-login-autofill-detect') return;
    const value = e.currentTarget.value;
    if (field === 'email') setEmail(value); else setPassword(value);
  };

  const environment = resolveEnvironment();

  useEffect(() => {
    if (consumeSupersededNotice()) setShowSupersededNotice(true);
  }, []);

  // A refused SSO sign-in, sent back here by the callback page.
  useEffect(() => {
    if (isSsoDenialReason(routeState.ssoError)) setError(t(`login.ssoError.${routeState.ssoError}`));
  }, [routeState.ssoError, t]);

  const startSso = async (providerId: string) => {
    setError('');
    setLoading(true);
    const reason = await beginSsoSignIn(providerId, routeState.from ?? '/');
    // Still here only if the redirect didn't start.
    if (reason) { setLoading(false); setError(t(`login.ssoError.${reason}`)); }
  };

  const attemptLogin = async (forceSupersede: boolean, overrideEmail?: string, overridePassword?: string) => {
    setLoading(true);
    const result = await login(overrideEmail ?? email, overridePassword ?? password, forceSupersede);
    setLoading(false);
    if (result === 'success') {
      navigate(resolvePostSignInPath(routeState.from), { replace: true });
    } else if (result === 'session_conflict') {
      setShowSessionConflict(true);
    } else {
      setError(t('login.invalidCredentials'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Real fix: reads the actual, current DOM value directly rather
    // than trusting React state alone — the one place in this flow
    // that must never be wrong, since it's the literal moment of
    // submission. If the autofill-detection animation above already
    // caught it, these agree and nothing changes; if it didn't, this
    // still submits the real, current fields instead of silently
    // repeating the same "starts blank" failure.
    const realEmail    = emailRef.current?.value ?? email;
    const realPassword = passwordRef.current?.value ?? password;
    if (realEmail !== email) setEmail(realEmail);
    if (realPassword !== password) setPassword(realPassword);
    if (!realEmail || !realPassword) { setError(t('login.missingFields')); return; }
    setError('');
    await attemptLogin(false, realEmail, realPassword);
  };

  return (
    <div className="ps-login-page">
      <div className="ps-login-bg" aria-hidden="true" />

      <div className="ps-login-wrap">
        <div className="ps-login-card">

          {/* Brand — PathScribe leads, since PathScribe is what you sign in to.
              ForMedrixAI sits in the colophon at the foot of the card. */}
          <div className="ps-login-brand">
            <img
              src="/pathscribe-logo-clean.png"
              alt="PathScribe"
              className="ps-login-hero"
            />
            <div className="ps-login-descriptor">{t('login.descriptor')}</div>

            {environment && (
              <div className={`ps-login-env ps-login-env--${environment.tone}`}>
                {t(environment.labelKey)}
              </div>
            )}
          </div>

          {/* Email + password: demo builds only (VITE_AUTH_MODE unset or "demo"). */}
          {passwordSignInEnabled && (
          <form onSubmit={handleSubmit}>
            <div className="ps-login-field">
              <label className="ps-login-field-label" htmlFor="login-email">{t('login.email')}</label>
              <input
                id="login-email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onAnimationStart={handleAutofillDetected('email')}
                autoComplete="email"
                autoFocus
                className="ps-login-input"
              />
            </div>

            <div className="ps-login-field">
              {/* Label row: pairing the recovery link with the Password label
                  keeps the form on a single left axis and stops the link
                  competing with the primary action below. */}
              <div className="ps-login-label-row">
                <label className="ps-login-field-label" htmlFor="login-password">{t('login.password')}</label>
                <a href="#" className="ps-login-forgot" onClick={e => { e.preventDefault(); setError(t('login.passwordResetUnavailable')); }}>
                  {t('login.forgotPassword')}
                </a>
              </div>
              <div className="ps-login-pw-wrap">
                <input
                  id="login-password"
                  ref={passwordRef}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onAnimationStart={handleAutofillDetected('password')}
                  autoComplete="current-password"
                  className="ps-login-input"
                />
                <button
                  type="button"
                  className="ps-login-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            {error && (
              <div className="ps-login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="ps-login-submit">
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
          )}

          {!passwordSignInEnabled && error && (
            <div className="ps-login-error" role="alert">
              {error}
            </div>
          )}

          {!passwordSignInEnabled && ssoProviders.length === 0 && (
            <div className="ps-login-error" role="alert">
              {t('login.signInNotConfigured')}
            </div>
          )}

          {passwordSignInEnabled && (
            <div className="ps-login-divider">
              <div className="ps-login-divider-line" />
              <span className="ps-login-divider-text">{t('login.continueWith')}</span>
              <div className="ps-login-divider-line" />
            </div>
          )}

          {ssoProviders.length > 0 ? (
            /* Single sign-on with the organisation's identity provider (PS-60). */
            <div className="ps-login-social-row">
              {ssoProviders.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="ps-login-social ps-login-social--live"
                  disabled={loading}
                  onClick={() => { void startSso(p.id); }}
                >
                  {p.id === 'microsoft' ? <MicrosoftIcon /> : p.id === 'google' ? <GoogleIcon /> : null} {t(SSO_LABEL_KEYS[p.id])}
                </button>
              ))}
            </div>
          ) : passwordSignInEnabled && (
            /* No provider configured in this build: announced, not live.
               Disabled controls stay out of the tab order; aria-disabled
               lets assistive tech report the state. */
            <div className="ps-login-social-row">
              <button
                type="button"
                className="ps-login-social"
                disabled
                aria-disabled="true"
                title={t('login.ssoUnavailable')}
              >
                <GoogleIcon /> {t('login.ssoGoogle')}
                <span className="ps-login-social-badge">{t('login.ssoSoon')}</span>
              </button>
              <button
                type="button"
                className="ps-login-social"
                disabled
                aria-disabled="true"
                title={t('login.ssoUnavailable')}
              >
                <MicrosoftIcon /> {t('login.ssoMicrosoft')}
                <span className="ps-login-social-badge">{t('login.ssoSoon')}</span>
              </button>
            </div>
          )}

          {/* Authorised-use notice. This describes how the system behaves; it
              makes no certification claim. */}
          <p className="ps-login-notice">
            {t('login.phiNotice')}
          </p>

          <div className="ps-login-colophon">
            <img
              src="/formedrix-logo-capM-dark.png"
              alt="ForMedrixAI — Precision, Care, Innovation"
              width={175}
              height={44}
              className="ps-login-colophon-logo"
            />
            {APP_VERSION && (
              <span className="ps-login-colophon-meta">v{APP_VERSION}</span>
            )}
          </div>
        </div>
      </div>

      {showSupersededNotice && (
        <SessionSupersededNotice onDismiss={() => setShowSupersededNotice(false)} />
      )}

      <ConfirmModal
        show={showSessionConflict}
        title={t('login.sessionConflictTitle')}
        message={t('login.sessionConflictMessage')}
        confirmLabel={t('login.signInHere')}
        cancelLabel={t('common.cancel')}
        onConfirm={async () => {
          setShowSessionConflict(false);
          await attemptLogin(true);
        }}
        onCancel={() => setShowSessionConflict(false)}
      />
    </div>
  );
};

export default LoginPage;
