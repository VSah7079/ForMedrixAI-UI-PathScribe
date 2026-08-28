// api/webhooks/engine/_lib/firebaseAdmin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared Firebase Admin SDK init for every real inbound Engine webhook
// (cassette dispatch outcome, block exception, material location,
// engraver status). Deliberately separate from the frontend's own
// Firebase client SDK init (src/firebase/) — this runs server-side, in
// a Vercel serverless function, with a service account, never the
// browser's own Auth context. One shared singleton so a cold start
// only pays Admin SDK init cost once per function instance, not once
// per request.
//
// Underscore-prefixed folder (_lib) so Vercel's own file-based routing
// never treats this as a callable endpoint — matches this project's
// established convention of keeping shared helpers out of the
// routable surface.
//
// Real, per direct guidance's own integration-testing decision: when
// FIRESTORE_EMULATOR_HOST is set, this connects to a real, local
// Firestore emulator with no real service account credential at all —
// the emulator doesn't authenticate, and a real production credential
// should never be loaded into a process that's about to point at a
// local emulator anyway. This is the ONLY thing that makes
// applyEngineCaseUpdate.integration.test.ts /
// upsertEngraverStatus.integration.test.ts /
// idempotency.integration.test.ts runnable at all.
// ─────────────────────────────────────────────────────────────────────────────

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App;

/** Real, standard Vercel pattern: the service account's private key is
 *  stored as a single env var (FIREBASE_SERVICE_ACCOUNT_KEY, the full
 *  JSON credential as a string) rather than a mounted file — serverless
 *  functions don't get a persistent filesystem to read a real key file
 *  from. Never logged, never returned in any response body. */
function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  // Real, standard Firebase emulator convention — checked first, since
  // a real deployment never has this env var set at all, and a local
  // integration-test run should never require (or want) a real
  // credential just to reach a local emulator.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'pathscribe-emulator-test' });
    return app;
  }

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is not set. Every engine webhook needs a real ' +
      'Firebase service account credential to write to Firestore — see this project\'s ' +
      'own deployment docs for how to generate one in the Firebase console ' +
      '(Project Settings → Service Accounts → Generate new private key). If you\'re ' +
      'trying to run the integration tests instead, set FIRESTORE_EMULATOR_HOST — ' +
      'see applyEngineCaseUpdate.integration.test.ts\'s own header for the full setup.'
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawKey);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is set but is not valid JSON.');
  }

  app = initializeApp({ credential: cert(parsed as any) });
  return app;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

