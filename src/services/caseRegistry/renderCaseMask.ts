// src/services/caseRegistry/renderCaseMask.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, extracted during the i18n/cleanup sweep (batch 80): this exact
// token-substitution algorithm was independently duplicated three times
// — as a private renderMask() in both caseMaskService.ts (Firestore) and
// mockCaseMaskService.ts (the active implementation), and a third time
// inline inside CaseMaskConfigSection.tsx's own runPreview(), which
// needs to render a live, unsaved draft mask rather than a persisted
// one, so it can't just call previewNextCaseNumber(). All three now
// share this one implementation.
//
// Pure, data-only — same reasoning as resolveCaseMaskScopeCandidates.ts:
// takes every value it needs as a parameter rather than fetching
// anything itself, so it works identically whether the mask being
// rendered is already persisted (the two services) or still a draft in
// an open modal (the admin screen's own live preview).
// ─────────────────────────────────────────────────────────────────────────────
import { getFacilityDateParts } from '@/utils/facilityTime';

/** Renders a mask pattern given a resolved prefix and sequence number.
 *  {SEQ:N} is the only parameterized token; N is read from
 *  sequenceDigits rather than re-parsed out of the pattern string
 *  itself. No {SITE}/{CAT}/{DEPT} — see CaseMask.ts's own header
 *  comment for why those tokens' real job no longer exists. */
export function renderCaseMask(pattern: string, prefix: string, seq: number, sequenceDigits: number, timezone: string): string {
  const { year: year4num } = getFacilityDateParts(new Date(), timezone);
  const year4 = String(year4num);
  const year2 = year4.slice(-2);

  return pattern
    .split('{PREFIX}').join(prefix)
    .split('{YEAR:4}').join(year4)
    .split('{YEAR:2}').join(year2)
    .replace(/\{SEQ:(\d+)\}/, (_m, digits) => String(seq).padStart(Number(digits) || sequenceDigits, '0'));
}
