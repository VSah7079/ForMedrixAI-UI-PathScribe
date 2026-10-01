// src/services/patientHistory/resolveIsSecureLisEndpoint.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own hard requirement: "It has to be
// safe though. TLS all the way including testing." The one real,
// enforceable piece of that a pure frontend function can actually
// guarantee — refuse before ever attempting a fetch against a
// configured endpoint that isn't HTTPS. Never a substitute for real
// TLS version/cipher/certificate validation (genuine backend/infra
// concerns this function cannot see or test) — a real, honest first
// gate, not the whole real safety story.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveIsSecureLisEndpoint(endpointUrl: string): boolean {
  try {
    return new URL(endpointUrl).protocol === 'https:';
  } catch {
    return false; // a genuinely malformed URL is never treated as secure by default
  }
}
