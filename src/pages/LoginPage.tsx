/**
 * LoginPage.tsx — src/pages/LoginPage.tsx
 * Public route — shown when the user is not authenticated.
 *
 * Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../pathscribe.css';
import { useAuth } from '../contexts/AuthContext';
import SessionSupersededNotice from '../components/Common/SessionSupersededNotice';
import ConfirmModal from '../components/Common/ConfirmModal';

const SUPERSEDED_NOTICE_KEY = 'pathscribe_show_superseded_notice';

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
const ENVIRONMENTS: Record<string, { label: string; tone: string }> = {
  production:  { label: 'Production',  tone: 'prod' },
  validation:  { label: 'Validation',  tone: 'validation' },
  training:    { label: 'Training',    tone: 'training' },
  development: { label: 'Development', tone: 'dev' },
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
  const { login } = useAuth();
  const navigate  = useNavigate();

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
    try {
      if (sessionStorage.getItem(SUPERSEDED_NOTICE_KEY) === '1') {
        setShowSupersededNotice(true);
        sessionStorage.removeItem(SUPERSEDED_NOTICE_KEY);
      }
    } catch {}
  }, []);

  const attemptLogin = async (forceSupersede: boolean, overrideEmail?: string, overridePassword?: string) => {
    setLoading(true);
    const result = await login(overrideEmail ?? email, overridePassword ?? password, forceSupersede);
    setLoading(false);
    if (result === 'success') {
      navigate('/', { replace: true });
    } else if (result === 'session_conflict') {
      setShowSessionConflict(true);
    } else {
      setError('Incorrect email or password. Please try again.');
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
    if (!realEmail || !realPassword) { setError('Please enter your email and password.'); return; }
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
              src="/pathscribe-logo-clean.svg"
              alt="PathScribe"
              className="ps-login-hero"
            />
            <div className="ps-login-descriptor">Clinical Pathology Reporting</div>

            {environment && (
              <div className={`ps-login-env ps-login-env--${environment.tone}`}>
                {environment.label}
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="ps-login-field">
              <label className="ps-login-field-label" htmlFor="login-email">Email</label>
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
                <label className="ps-login-field-label" htmlFor="login-password">Password</label>
                <a href="#" className="ps-login-forgot" onClick={e => { e.preventDefault(); setError('Password reset isn\u2019t available in this demo \u2014 contact your administrator.'); }}>
                  Forgot password?
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
                  aria-label={showPw ? 'Hide password' : 'Show password'}
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
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Single sign-on — announced, not yet live. Rendered as disabled
              controls so they stay out of the tab order, with aria-disabled
              so assistive tech reports the state rather than the buttons
              simply being unreachable and unexplained. */}
          <div className="ps-login-divider">
            <div className="ps-login-divider-line" />
            <span className="ps-login-divider-text">or continue with</span>
            <div className="ps-login-divider-line" />
          </div>

          <div className="ps-login-social-row">
            <button
              type="button"
              className="ps-login-social"
              disabled
              aria-disabled="true"
              title="Single sign-on is not yet available"
            >
              <GoogleIcon /> Google
              <span className="ps-login-social-badge">Soon</span>
            </button>
            <button
              type="button"
              className="ps-login-social"
              disabled
              aria-disabled="true"
              title="Single sign-on is not yet available"
            >
              <MicrosoftIcon /> Microsoft
              <span className="ps-login-social-badge">Soon</span>
            </button>
          </div>

          {/* Authorised-use notice. This describes how the system behaves; it
              makes no certification claim. */}
          <p className="ps-login-notice">
            This system contains protected health information. Access is
            restricted to authorized users and activity is recorded.
          </p>

          <div className="ps-login-colophon">
            <img
              src="/formedrix-logo-capM-dark.png"
              alt="ForMedrixAI"
              width={175}
              height={41}
              className="ps-login-colophon-logo"
            />
            <div className="ps-login-colophon-tagline">
              Precision <span className="ps-login-tagline-sep">&bull;</span> Care{' '}
              <span className="ps-login-tagline-sep">&bull;</span> Innovation
            </div>
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
        title="Already signed in elsewhere"
        message="This account is already signed in on another tab or window on this browser. Continuing here will sign that session out — any unsaved work there will be preserved and offered for review the next time it's opened. Continue?"
        confirmLabel="Sign In Here"
        cancelLabel="Cancel"
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
