// src/services/supportReferences/supportReferenceRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): the support reference format, pure.
//   SR-XXXX-XXXX, Crockford base 32 (no I, L, O or U, so it reads aloud and
//   copies cleanly). 40 random bits: about a trillion values.
//   normaliseSupportReference accepts what people actually type: lower case,
//   no dashes, spaces, and I/L/O mistaken for 1/1/0.
// ─────────────────────────────────────────────────────────────────────────────
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHAR = '[0-9A-HJKMNP-TV-Z]';

/** A support reference anywhere in a piece of text. */
export const SUPPORT_REFERENCE_IN_TEXT = new RegExp(`(?<![\\w-])SR-?${CHAR}{4}-?${CHAR}{4}(?![\\w-])`, 'gi');

/** A new reference from random bytes (8 are used). Pass crypto.getRandomValues in production. */
export function generateSupportReference(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes.slice(0, 8), b => ALPHABET[b & 31]);
  return `SR-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** The canonical form of a typed reference, or null if it isn't one. */
export function normaliseSupportReference(text: string): string | null {
  const body = text.trim().toUpperCase().replace(/[\s-]/g, '').replace(/^SR/, '')
    .replace(/[IL]/g, '1').replace(/O/g, '0');
  if (body.length !== 8 || [...body].some(c => !ALPHABET.includes(c))) return null;
  return `SR-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function isSupportReference(text: string): boolean {
  return /^\s*SR/i.test(text) && normaliseSupportReference(text) !== null;
}
