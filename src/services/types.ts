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
// download(), plus the UI's own handling of both in ModelStoreModal.tsx).
//
// ACTUAL ROOT CAUSE (confirmed by isolated repro, not just this codebase):
// this project's tsconfig has `strictNullChecks: false`. Under that
// setting, TypeScript's control-flow analysis does NOT narrow the `else`
// branch of a plain truthy check — `if (x.ok) {...} else {...}` or
// `if (!x.ok) {...}` — on this union, even though `ok` is already a
// literal `true`/`false` discriminant (not a widened `boolean`). An
// explicit `=== true` / `=== false` comparison, or the isServiceOk() type
// guard below, DOES narrow correctly under the same settings — confirmed
// with a minimal repro outside this codebase, so this isn't specific to
// ServiceResult's own shape. Turning on strictNullChecks project-wide
// would fix this at the root but is a large, separate, real undertaking
// (this project relies on it being off in many places) — out of scope
// here. Given that, the real fix is procedural: never write a plain
// truthy/falsy check on a ServiceResult in this codebase — always use
// isServiceOk() (or, failing that, an explicit `=== true`/`=== false`).
// A first pass fixed the type here but missed applying this at one of the
// three originally-reported call sites (ModelStoreModal.tsx's useEffect,
// which still had the old workaround cast, unremoved, until this pass) —
// see that file's own comment.
export type ServiceResultSuccess<T> = { ok: true; data: T; meta?: ServiceResultMeta };
export type ServiceResultFailure = { ok: false; error: string };

export type ServiceResult<T> = ServiceResultSuccess<T> | ServiceResultFailure;

export function isServiceOk<T>(result: ServiceResult<T>): result is ServiceResultSuccess<T> {
  return result.ok === true;
}

export type ID = string;
