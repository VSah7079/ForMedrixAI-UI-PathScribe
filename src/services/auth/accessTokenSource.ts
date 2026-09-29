// src/services/auth/accessTokenSource.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): where services that call the API server or the
// live-update hub get the signed-in user's access token. authSession
// registers itself here, so those services don't import the sign-in code
// (and the services barrel has no import cycle).
// ─────────────────────────────────────────────────────────────────────────────

type TokenSource = () => Promise<string | null>;

let source: TokenSource = async () => null;

export function setAccessTokenSource(next: TokenSource): void {
  source = next;
}

/** The current access token, or '' when nobody is signed in with SSO. */
export async function getAccessToken(): Promise<string> {
  try {
    return (await source()) ?? '';
  } catch {
    return '';
  }
}
