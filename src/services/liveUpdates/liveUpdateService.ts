// src/services/liveUpdates/liveUpdateService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: picks the live-update transport once, at start-up.
//   VITE_LIVE_UPDATES_HUB_URL set (https:// in production)  → SignalR hub
//   not set                                                 → local only
// Exported from `@/services` as `liveUpdateService`.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveServiceEndpoint } from '@/utils/serviceEndpoint';
import { selectLiveUpdateTransport } from './liveUpdatePolicy';
import { localLiveUpdateService } from './localLiveUpdateService';
import { createSignalRLiveUpdateService } from './signalRLiveUpdateService';
import type { ILiveUpdateService } from './ILiveUpdateService';
import { getAccessToken } from '../auth/accessTokenSource';

const HUB_ENV_VAR = 'VITE_LIVE_UPDATES_HUB_URL';
const isProduction = !!import.meta.env.PROD;

export const liveTransportChoice = selectLiveUpdateTransport({
  configured: import.meta.env[HUB_ENV_VAR] as string | undefined,
  isProduction,
  resolve: configured => {
    const r = resolveServiceEndpoint({ name: 'live-update hub', envVar: HUB_ENV_VAR, configured, devDefault: '', isProduction });
    return r.ok === false ? { ok: false as const, message: r.message } : { ok: true as const, url: r.url };
  },
});

if (liveTransportChoice.transport === 'local' && liveTransportChoice.reason === 'invalid') {
  console.error(`[liveUpdates] ${liveTransportChoice.message} Live updates fall back to polling.`);
}

export const liveUpdateService: ILiveUpdateService = liveTransportChoice.transport === 'signalr'
  // PS-60: the signed-in user's SSO access token (sent as access_token,
  // docs/architecture/LIVE_UPDATES_SIGNALR.md §4). OR terminals' device
  // tokens are still to come.
  ? createSignalRLiveUpdateService({ hubUrl: liveTransportChoice.hubUrl, accessTokenFactory: getAccessToken })
  : localLiveUpdateService;
