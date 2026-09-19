// ─────────────────────────────────────────────────────────────────────────────
// services/types.ts
// Shared types used across all service interfaces.
// ─────────────────────────────────────────────────────────────────────────────

// Optional, additive metadata a service can attach to a successful result.
// Currently used for cursor-based pagination (see CaseFilterParams.pageSize/
// cursor and ICaseService.getAll's real Firestore implementation) - kept
// generic and optional here rather than a case-specific type, since any
// service could reasonably need to signal "there's more" without changing
// its own data shape.
export interface ServiceResultMeta {
  hasMore?: boolean;
  /** Opaque cursor - pass back as CaseFilterParams.cursor to fetch the next page. */
  nextCursor?: string;
}

// Real, direct follow-up (PS-69): a discriminated-union narrowing failure
// on ServiceResult<T> recurred three separate times while building the
// ForMedrixAI Store feature (mockModelStoreService.ts's getAvailable()/
// download(), both still carrying an `as { ok: false; error: string }`
// workaround cast below at the time this was investigated). Reproduced the
// reported shape directly (see this ticket's own history) — narrowing on
// `authRes.ok === false` genuinely DOES work today, even inside a generic
// function, because ok is already a literal (true/false) discriminant on
// each union member, not a widened `boolean`. So the type itself needed no
// change. What was missing was the named success/failure types + type
// guard the ticket's own research recommended — adding those here, and
// removing the now-provably-unnecessary casts at the real call sites
// (mockModelStoreService.ts) in the same pass, so nobody re-adds a "fix"
// for a narrowing failure that isn't actually happening.
export type ServiceResultSuccess<T> = { ok: true; data: T; meta?: ServiceResultMeta };
export type ServiceResultFailure = { ok: false; error: string };

export type ServiceResult<T> = ServiceResultSuccess<T> | ServiceResultFailure;

export function isServiceOk<T>(result: ServiceResult<T>): result is ServiceResultSuccess<T> {
  return result.ok === true;
}

export type ID = string;
