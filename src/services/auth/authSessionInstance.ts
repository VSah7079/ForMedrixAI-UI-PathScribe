// src/services/auth/authSessionInstance.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): the app's one authSession, wired to this build's
// settings and services. Exported from `@/services` as `authSession`.
//
// The demo accounts are loaded only when VITE_AUTH_MODE is not exactly
// "sso". Vite writes the setting into the code at build time, so in an
// "sso" build the import below is dead code and the accounts module is not
// in the bundle (checked in Batch 343 by building and searching dist/).
// Any other unrecognised value still turns password sign-in off
// (authConfig.ts), it just doesn't strip the module.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveServiceEndpoint } from '@/utils/serviceEndpoint';
import { mockUserService } from '../users/mockUserService';
import { mockRoleService } from '../roles/mockRoleService';
import { mockAuditService } from '../auditlog/mockAuditService';
import { mockDraftCacheService } from '../drafts/mockDraftCacheService';
import { shouldShowBiometricWizard, verifyBiometric } from '../biometric/mockBiometricService';
import * as markers from '../session/sessionSupersedeService';
import { resolveAuthConfig } from './authConfig';
import { createAuthSession } from './authSession';
import { readSessionProfile, writeSessionProfile } from './sessionProfile';
import { createSsoClient, type ISsoClient } from './sso/ssoClient';
import { setAccessTokenSource } from './accessTokenSource';
import { createSignerConfirmation, type SigningLockState } from './signerConfirmation';
import { createSignatureGate } from './signatureEvidence';
import { mockSignatureRecordService } from '../signatures/mockSignatureRecordService';

const isProduction = !!import.meta.env.PROD;

export const authConfig = resolveAuthConfig(import.meta.env as unknown as Record<string, string | undefined>, isProduction);
for (const problem of authConfig.problems) console.error(`[auth] ${problem}`);

const API_ENV_VAR = 'VITE_API_BASE_URL';
const configuredApi = import.meta.env.VITE_API_BASE_URL;
let apiBaseUrl: string | null = null;
if (configuredApi) {
  const r = resolveServiceEndpoint({ name: 'PathScribe API server', envVar: API_ENV_VAR, configured: configuredApi, devDefault: '', isProduction });
  if (r.ok === false) console.error(`[auth] ${r.message} Signed-in users are matched in the browser instead.`);
  else apiBaseUrl = r.url;
}
if (!apiBaseUrl && authConfig.providers.length > 0 && isProduction) {
  console.warn('[auth] No PathScribe API server is configured (VITE_API_BASE_URL), so SSO users are matched to staff in the browser against the demo directory. That is for demonstrations only.');
}

const verifyDemoCredentials = import.meta.env.VITE_AUTH_MODE !== 'sso'
  ? async (email: string, password: string) => (await import('./demo/demoAccounts')).verifyDemoCredentials(email, password)
  : null;

let ssoClient: ISsoClient | null = null;
const getSsoClient = () => (ssoClient ??= createSsoClient(authConfig.providers, { origin: window.location.origin }));

export const authSession = createAuthSession({
  config: authConfig,
  verifyDemoCredentials,
  ssoClient: getSsoClient,
  apiBaseUrl,
  userService: mockUserService,
  roleService: mockRoleService,
  auditService: mockAuditService,
  draftCacheService: mockDraftCacheService,
  markers,
  profileStore: { read: readSessionProfile, write: writeSessionProfile },
  shouldShowBiometricWizard,
});

setAccessTokenSource(() => authSession.accessToken());

// ── Batch 344: confirming who signs (services/auth/signerConfirmation.ts) ──
// The lock survives a reload (localStorage, per user); the "already gave
// the username in this sign-in session" note is per tab (sessionStorage).
const SIGNING_LOCK_KEY = (userId: string) => `pathscribe_signing_lock_${userId}`;
const SIGNING_SESSION_KEY = 'pathscribe_signing_confirmed_session';

export const signerConfirmation = createSignerConfirmation({
  config: authConfig,
  readProfile: readSessionProfile,
  verifyDemoCredentials,
  ssoClient: getSsoClient,
  auditService: mockAuditService,
  lockStore: {
    read: userId => {
      try { return JSON.parse(localStorage.getItem(SIGNING_LOCK_KEY(userId)) ?? 'null') as SigningLockState | null; } catch { return null; }
    },
    write: (userId, state) => {
      try { localStorage.setItem(SIGNING_LOCK_KEY(userId), JSON.stringify(state)); } catch { /* storage unavailable */ }
    },
  },
  signingSession: {
    current: () => markers.getOwnSessionId(),
    lastConfirmed: () => { try { return sessionStorage.getItem(SIGNING_SESSION_KEY); } catch { return null; } },
    markConfirmed: id => { try { sessionStorage.setItem(SIGNING_SESSION_KEY, id); } catch { /* storage unavailable */ } },
  },
  biometric: { verify: verifyBiometric },
});

// ── Batch 345: checking each signature when the signed record is saved ────
// (services/auth/signatureEvidence.ts). The ids already used are the mock
// server's memory of which confirmations and ID tokens have backed a
// signature, so none can back two.
const SIGNATURE_USED_KEY = 'pathscribe_signature_used';
const USED_KEEP = 500;

export const signatureGate = createSignatureGate({
  config: authConfig,
  readProfile: readSessionProfile,
  recordService: mockSignatureRecordService,
  auditService: mockAuditService,
  usedStore: {
    read: () => {
      try {
        const v = JSON.parse(localStorage.getItem(SIGNATURE_USED_KEY) ?? 'null');
        return { confirmationIds: v?.confirmationIds ?? [], tokenHashes: v?.tokenHashes ?? [] };
      } catch { return { confirmationIds: [], tokenHashes: [] }; }
    },
    add: (confirmationId, tokenHash) => {
      try {
        const v = JSON.parse(localStorage.getItem(SIGNATURE_USED_KEY) ?? 'null') ?? {};
        const confirmationIds = [...(v.confirmationIds ?? []), confirmationId].slice(-USED_KEEP);
        const tokenHashes = [...(v.tokenHashes ?? []), ...(tokenHash ? [tokenHash] : [])].slice(-USED_KEEP);
        localStorage.setItem(SIGNATURE_USED_KEY, JSON.stringify({ confirmationIds, tokenHashes }));
      } catch { /* storage unavailable */ }
    },
  },
});
