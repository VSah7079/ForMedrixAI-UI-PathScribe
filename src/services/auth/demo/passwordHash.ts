// src/services/auth/demo/passwordHash.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60 (Batch 343): checks a password against a stored PBKDF2-SHA256 hash
// with the browser's Web Crypto API. Used only for the demo accounts; real
// deployments sign in through their identity provider.
// Hashes are made with scripts/auth/hash-demo-password.mjs.
// ─────────────────────────────────────────────────────────────────────────────

export interface StoredPasswordHash {
  iterations: number;
  /** base64 */
  salt: string;
  /** base64, 32 bytes */
  hash: string;
}

const fromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Compares every byte, so the time taken doesn't reveal where they differ. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPasswordHash(password: string, stored: StoredPasswordHash, subtle?: SubtleCrypto): Promise<boolean> {
  try {
    const derived = await derivePasswordHash(password, fromBase64(stored.salt), stored.iterations, subtle);
    return sameBytes(derived, fromBase64(stored.hash));
  } catch {
    return false;
  }
}
