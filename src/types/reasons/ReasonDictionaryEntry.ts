// src/types/reasons/ReasonDictionaryEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: a single, unified reason dictionary rather
// than one bespoke, structurally-identical dictionary per feature. This
// app already had exactly one real, editable "reason dictionary"
// (ResolutionType, services/deficiencies/) before this file existed -
// same id/name/description/status shape this type uses. Rather than
// building a second, separate one for post-signout billing changes
// (the change that prompted this file), a single dictionary scoped by
// `category` lets any future gated resolution flow reuse the same
// underlying service/admin UI instead of each maintaining its own.
//
// Deliberately does NOT migrate ResolutionType itself into this system
// in this same pass - that's real, working code already wired into
// live UI (QualityAssurancePage.tsx's ResolveModal/ContainModal), and
// migrating it isn't required to solve the actual, current ask. A
// real, future, lower-risk consolidation, not bundled in here.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '@/services/types';

/** Real, per direct guidance - which real, gated resolution flow this
 *  entry applies to. Deliberately its own union (not a bare string) so
 *  a typo in a category name is a real compile error, not a silent
 *  runtime mismatch that makes an entry invisible to its own feature's
 *  dropdown. Add a new member here when a future feature needs its own
 *  reason taxonomy - never reuse an existing member for a genuinely
 *  different real purpose just to avoid extending this union.
 *
 *  ADDENDUM/AMENDMENT/CORRECTION real, per direct guidance's own
 *  detailed post-sign-out revision taxonomy - deliberately named to
 *  match AmendmentType's own exact three values ('addendum' |
 *  'amendment' | 'correction', types/reports/AmendmentRecord.ts)
 *  rather than inventing parallel names, since these ARE that same
 *  real taxonomy, just uppercased to match this union's own existing
 *  naming convention. */
export type ReasonDictionaryCategory =
  | 'POST_SIGNOUT_BILLING_CHANGE'
  | 'ADDENDUM'
  | 'AMENDMENT'
  | 'CORRECTION';

export interface ReasonDictionaryEntry {
  id: string;
  category: ReasonDictionaryCategory;
  name: string;
  description: string;
  status: 'Active' | 'Inactive';
}

export interface IReasonDictionaryService {
  /** Real, per direct guidance - category is required, never
   *  optional: every real caller already knows which taxonomy it
   *  needs, and a caller that genuinely wants every category across
   *  every feature (e.g. a future unified admin management screen)
   *  should say so explicitly rather than this defaulting to "all,"
   *  which would silently leak one feature's reasons into another
   *  feature's dropdown if a caller ever forgot to filter. */
  getAll(category: ReasonDictionaryCategory): Promise<ServiceResult<ReasonDictionaryEntry[]>>;
  add(entry: Omit<ReasonDictionaryEntry, 'id'>): Promise<ServiceResult<ReasonDictionaryEntry>>;
  update(id: string, changes: Partial<Omit<ReasonDictionaryEntry, 'id' | 'category'>>): Promise<ServiceResult<ReasonDictionaryEntry>>;
  deactivate(id: string): Promise<ServiceResult<ReasonDictionaryEntry>>;
  reactivate(id: string): Promise<ServiceResult<ReasonDictionaryEntry>>;
}
