// src/utils/serviceEndpoint.ts
// ─────────────────────────────────────────────────────────────────────────────
// HTTPS for the back-end services the browser calls directly (Batch 327,
// Pete: "I noticed we are using HTTP, I want to use HTTPS").
//
// The report renderer and the interface receiver are Cloud Functions set
// through VITE_ env vars. Both used to fall back to http://localhost:8080/
// when the variable was missing, so a production build missing its
// setting would quietly send reports and HL7 payloads to plain HTTP on
// the user's own machine. The rules are now:
//
//   • Production build: the URL must be set, and it must be https://.
//     A missing or plain-HTTP value is refused before any request.
//   • Development build: https:// is accepted. So is plain HTTP to this
//     machine only (localhost / 127.0.0.1 / [::1]), because the local
//     functions-framework emulator has no TLS. With nothing set, the
//     emulator's default applies.
//
// Pure: the caller passes the configured value and whether this is a
// production build (import.meta.env.PROD).
// ─────────────────────────────────────────────────────────────────────────────

export type EndpointProblem = 'NOT_CONFIGURED' | 'NOT_HTTPS' | 'MALFORMED';

export type ServiceEndpoint =
  | { ok: true; url: string }
  | { ok: false; problem: EndpointProblem; message: string };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True for a well-formed https:// URL. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** True for a plain http:// URL that points at this machine. */
export function isLoopbackHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolves a service URL under the rules above. `name` is used in the
 * message and `envVar` names the setting to fix. Messages are plain
 * English, like the other dispatch errors that go to the interface log.
 */
export function resolveServiceEndpoint(input: {
  name: string;
  envVar: string;
  configured: string | undefined;
  devDefault: string;
  isProduction: boolean;
}): ServiceEndpoint {
  const { name, envVar, isProduction } = input;
  const configured = input.configured?.trim();

  if (!configured) {
    if (!isProduction) return { ok: true, url: input.devDefault };
    return { ok: false, problem: 'NOT_CONFIGURED', message: `The ${name} address is not configured. Set ${envVar} to its https:// URL.` };
  }
  try {
    new URL(configured);
  } catch {
    return { ok: false, problem: 'MALFORMED', message: `The ${name} address in ${envVar} is not a valid URL.` };
  }
  if (isHttpsUrl(configured)) return { ok: true, url: configured };
  if (!isProduction && isLoopbackHttpUrl(configured)) return { ok: true, url: configured };
  return { ok: false, problem: 'NOT_HTTPS', message: `The ${name} address in ${envVar} must use https://.` };
}
