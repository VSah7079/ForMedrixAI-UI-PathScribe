// src/services/spellcheck/customDictionaryRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 336): rules for the two override tiers (AC5).
//   • Personal dictionary — any user adds words for themselves.
//   • Facility dictionary — a lab-wide list (local acronyms, shorthand).
//     Per Pete (Sep 26): an administrator's addition takes effect at once,
//     and every addition or removal is written to the audit log.
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomWordEntry {
  word: string;
  addedBy: { userId: string; userName: string };
  addedAt: string;
}

export type CustomWordRefusal = 'EMPTY' | 'NOT_A_WORD' | 'TOO_LONG' | 'NOT_PERMITTED' | 'NOT_FOUND';

export const MAX_CUSTOM_WORD_LENGTH = 64;

/** A single word: letters, marks and digits, with inner apostrophes or
 *  hyphens allowed. Normalised to Unicode NFC and trimmed. */
export function normalizeCustomWord(raw: string): { ok: true; word: string } | { ok: false; code: CustomWordRefusal } {
  const word = (raw ?? '').normalize('NFC').trim().replace(/’/g, "'");
  if (!word) return { ok: false, code: 'EMPTY' };
  if (word.length > MAX_CUSTOM_WORD_LENGTH) return { ok: false, code: 'TOO_LONG' };
  if (!/^[\p{L}\p{M}\p{N}]+(?:['-][\p{L}\p{M}\p{N}]+)*$/u.test(word)) return { ok: false, code: 'NOT_A_WORD' };
  return { ok: true, word };
}

/** Who may change a facility's dictionary: the admin-tier roles. */
export function canManageFacilityDictionary(role: string | undefined): boolean {
  return role === 'admin' || role === 'pathologist-admin' || role === 'superadmin';
}

/** Adds a word unless it's already there (compared case-insensitively). */
export function withCustomWord(list: readonly CustomWordEntry[], entry: CustomWordEntry): { list: CustomWordEntry[]; added: boolean } {
  if (list.some(e => e.word.toLowerCase() === entry.word.toLowerCase())) return { list: [...list], added: false };
  return { list: [...list, entry].sort((a, b) => a.word.localeCompare(b.word)), added: true };
}

export function withoutCustomWord(list: readonly CustomWordEntry[], word: string): { list: CustomWordEntry[]; removed: boolean } {
  const next = list.filter(e => e.word.toLowerCase() !== word.toLowerCase());
  return { list: next, removed: next.length !== list.length };
}

/** Audit entry for a facility-dictionary change. Literal English. */
export function facilityDictionaryAuditEntry(kind: 'added' | 'removed', word: string, facilityLabel: string, actorName: string, facilityId: string) {
  return {
    type: 'user' as const,
    event: kind === 'added' ? 'Facility spelling dictionary word added' : 'Facility spelling dictionary word removed',
    detail: `"${word}" ${kind === 'added' ? 'added to' : 'removed from'} the spelling dictionary of ${facilityLabel}`,
    user: actorName,
    caseId: null,
    confidence: null,
    facilityId,
  };
}
