// src/mocks/browser.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on testing PS-239's own real endpoint
// with mock data — see mockInterfaceEngineSettings.ts's own header.
// This file's own only job: wire this app's own real handlers.ts into
// a real MSW browser worker. Started conditionally from main.tsx —
// never imported or started unconditionally, so a real production
// build (where import.meta.env.DEV is false) never even includes this
// module's own real side effects.
// ─────────────────────────────────────────────────────────────────────────────

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const mockInterfaceEngineWorker = setupWorker(...handlers);
