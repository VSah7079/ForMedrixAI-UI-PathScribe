// src/utils/safeInternalPath.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-344: accepts a navigation target only if it is a path inside PathScribe.
// React Router 6 treats "/\evil.example" (and "//evil.example") as a link to
// another site (GHSA-wrjc-x8rr-h8h6; fixed only in React Router 7.18). Any
// target that comes from stored data rather than code, such as a message's
// config link, goes through this before navigate().
// ─────────────────────────────────────────────────────────────────────────────

/** The target if it is a same-site path ("/audit?tab=errors"), else null. */
export function safeInternalPath(target: unknown): string | null {
  if (typeof target !== 'string') return null;
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  // Backslashes, whitespace and control characters are never part of a
  // PathScribe route; browsers normalise some of them into "//".
  if (/[\\\s\u0000-\u001f\u007f]/.test(target)) return null;
  return target;
}
