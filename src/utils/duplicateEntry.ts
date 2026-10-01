// src/utils/duplicateEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generic half of the "duplicate this entry, edit it slightly, save as new"
// pattern. Entity-specific rules — which identity fields a copy must never
// carry, which lists must be deep-copied, which records may be duplicated
// at all — live in services/duplication/ (see its README); this file only
// marks the copy's display name so two entries never look silently
// identical in a list right after duplicating.
//
// International support (PS-73, Sep 2026): the copy marker used to be a
// hard-coded English " (Copy)", which was then SAVED as data — a German
// admin duplicating a stain got "Hämatoxylin (Copy)" stored permanently.
// The marker is now always supplied by the caller from the user's own
// language (`t('common.copyOfName', { name })`), never defaulted here.
//
// preparePersonDuplicate() was removed in the same change: its only
// consumer was the Physicians screen, and per Pete's duplication framework
// real people are never duplicated (see services/duplication/duplicatePolicy.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Produces the display name for a copy, in the user's language —
 *  e.g. `name => t('common.copyOfName', { name })`. */
export type CopyNameFormatter = (name: string) => string;

export function prepareDuplicate<T extends object>(
  source: T,
  nameKey: keyof T,
  copyName: CopyNameFormatter,
): T {
  const currentName = source[nameKey];
  if (typeof currentName !== 'string' || !currentName.trim()) return { ...source };
  return { ...source, [nameKey]: copyName(currentName) };
}
