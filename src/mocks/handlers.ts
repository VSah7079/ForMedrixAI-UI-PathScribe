// src/mocks/handlers.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on testing PS-239's own real endpoint
// with mock data — see mockInterfaceEngineSettings.ts's own header for
// the full account of what this is and why it's safely gated. This
// file's own only job: intercept the real POST
// /api/v1/events/molecular-worklist call dispatchMolecularWorklist.ts
// already, genuinely makes, and answer it according to whatever mode
// is currently configured — read fresh on every real request, not
// cached at worker-startup, so toggling the control panel takes
// effect immediately without needing to restart anything.
// ─────────────────────────────────────────────────────────────────────────────

import { http, HttpResponse, delay } from 'msw';
import { getMockInterfaceEngineSettings } from '../services/mockInterfaceEngine/mockInterfaceEngineSettings';

export const handlers = [
  http.post('/api/v1/events/molecular-worklist', async () => {
    const settings = getMockInterfaceEngineSettings();

    if (settings.mode === 'timeout') {
      // Real, per this file's own header — simulates a real, hung
      // connection (an unreachable or overloaded real Interface
      // Engine), never actually resolving. dispatchMolecularWorklist.ts
      // has no real client-side timeout of its own, so this
      // genuinely leaves the real "Dispatching…" state showing,
      // exactly matching a real hung network call would.
      await delay('infinite');
    }

    if (settings.mode === 'always_fail') {
      return new HttpResponse(null, { status: settings.failureStatus });
    }

    return HttpResponse.json({ received: true }, { status: 200 });
  }),
];
