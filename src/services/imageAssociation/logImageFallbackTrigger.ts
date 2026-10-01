// src/services/imageAssociation/logImageFallbackTrigger.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own §2.2: "Pathscribe MUST log all fallback
// triggers for audit and diagnostic purposes." The one real side
// effect resolveImageUrlWithFallback.ts's own pure decision function
// deliberately doesn't perform itself — kept here so that function
// stays trivially testable with no service dependency.
// ─────────────────────────────────────────────────────────────────────────────

import { mockAuditService } from '../auditlog/mockAuditService';
import { resolveImageUrlWithFallback, type UrlHealthCheckResult, type ImageUrlResolution } from './resolveImageUrlWithFallback';

export async function resolveAndLogImageUrl(
  assetId: string,
  primaryResult: UrlHealthCheckResult,
  fallbackUrl: string | undefined,
): Promise<ImageUrlResolution> {
  const resolution = resolveImageUrlWithFallback(primaryResult, fallbackUrl);

  if (resolution.action === 'use_fallback') {
    await mockAuditService.logEvent({
      type: 'system',
      event: 'Image URL Fallback Triggered',
      detail: `Asset ${assetId}: primary image URL failed (${primaryResult.outcome === 'error' ? (primaryResult.isTimeout ? 'timeout' : `HTTP ${primaryResult.statusCode}`) : 'unknown'}) — rerouted to fallback.`,
      user: 'system', caseId: null, confidence: null,
    }).catch(() => {});
  }

  return resolution;
}
