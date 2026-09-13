// src/services/imageAssociation/resolveImageUrlWithFallback.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded spec's own §2.2 (Fallback Resolution Logic):
// "Upon encountering an HTTP 4xx (except 401/403), 5xx, or connection
// timeout from the primary image URL, Pathscribe MUST automatically
// rewrite or re-route the request to the configured fallback Image
// Management Server."
//
// Real, deliberate carve-out kept exact: 401/403 do NOT trigger a
// fallback — those mean "you need to authenticate against THIS
// server," not "this resource doesn't exist here." Falling back to a
// different server wouldn't fix an auth problem and would silently
// mask it as an availability problem — surfaced here as its own,
// genuinely different real outcome (auth_required) rather than
// folded into the generic "both failed" case.
//
// Pure — the real, existing mockAuditService logging call per the
// spec's own "MUST log all fallback triggers" is the caller's job
// (see logImageFallbackTrigger.ts), keeping this function itself
// trivially testable with no service dependency.
// ─────────────────────────────────────────────────────────────────────────────

export type UrlHealthCheckResult =
  | { outcome: 'success' }
  | { outcome: 'error'; statusCode?: number; isTimeout?: boolean };

export type ImageUrlResolution =
  | { action: 'use_primary' }
  | { action: 'use_fallback'; fallbackUrl: string }
  | { action: 'auth_required'; statusCode: 401 | 403 }
  | { action: 'unavailable' };

function isRetryableFailure(result: { statusCode?: number; isTimeout?: boolean }): boolean {
  if (result.isTimeout) return true;
  if (result.statusCode === undefined) return false;
  if (result.statusCode === 401 || result.statusCode === 403) return false;
  return result.statusCode >= 400 && result.statusCode < 600;
}

export function resolveImageUrlWithFallback(
  primaryResult: UrlHealthCheckResult,
  fallbackUrl: string | undefined,
): ImageUrlResolution {
  if (primaryResult.outcome === 'success') return { action: 'use_primary' };

  if (primaryResult.statusCode === 401 || primaryResult.statusCode === 403) {
    return { action: 'auth_required', statusCode: primaryResult.statusCode };
  }

  if (isRetryableFailure(primaryResult) && fallbackUrl) {
    return { action: 'use_fallback', fallbackUrl };
  }

  return { action: 'unavailable' };
}
