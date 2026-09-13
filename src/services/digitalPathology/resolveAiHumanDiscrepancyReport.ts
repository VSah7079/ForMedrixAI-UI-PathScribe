// src/services/digitalPathology/resolveAiHumanDiscrepancyReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own earlier DP/AI vendor research plan
// ("resolveAiHumanDiscrepancyReport.ts + resolveAiScreeningTimeoutStatus.ts
// — QA reports"). A real, per-vendor discordance-rate report — the
// kind of real, ongoing monitoring a lab's own QA program needs to
// judge whether a given real AI product is actually trustworthy in
// practice, not a one-off deficiency count.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

export interface AiVendorDiscrepancyStats {
  vendorId: string;
  reviewedCount: number;
  concordantCount: number;
  discordantCount: number;
  /** Real, 0-1 — undefined when reviewedCount is 0 (never a fabricated
   *  0% or divide-by-zero NaN). */
  discordanceRate?: number;
}

export interface AiHumanDiscrepancyReport {
  byVendor: AiVendorDiscrepancyStats[];
  totalReviewed: number;
  totalDiscordant: number;
}

export function resolveAiHumanDiscrepancyReport(results: AiScreeningResult[]): AiHumanDiscrepancyReport {
  const byVendorMap = new Map<string, AiScreeningResult[]>();
  for (const r of results) {
    if (r.humanConcordant === undefined) continue;
    const list = byVendorMap.get(r.vendorId) ?? [];
    list.push(r);
    byVendorMap.set(r.vendorId, list);
  }

  const byVendor: AiVendorDiscrepancyStats[] = Array.from(byVendorMap.entries()).map(([vendorId, list]) => {
    const reviewedCount = list.length;
    const discordantCount = list.filter(r => r.humanConcordant === false).length;
    const concordantCount = reviewedCount - discordantCount;
    return {
      vendorId, reviewedCount, concordantCount, discordantCount,
      discordanceRate: reviewedCount > 0 ? discordantCount / reviewedCount : undefined,
    };
  });

  return {
    byVendor,
    totalReviewed: byVendor.reduce((sum, v) => sum + v.reviewedCount, 0),
    totalDiscordant: byVendor.reduce((sum, v) => sum + v.discordantCount, 0),
  };
}
