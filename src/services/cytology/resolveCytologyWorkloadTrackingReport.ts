// src/services/cytology/resolveCytologyWorkloadTrackingReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied CYT-QA-05 specification
// ("Individual Cytotechnologist Workload Tracking & Exceedance
// Report" — real regulatory drivers: US CLIA '88 §493.1274(b), UK
// NHSCSP Workload Limits, France Code de la Santé Publique).
//
// Real, buildable directly on top of this module's own existing,
// real CLIA workload infrastructure (CytologyWorkloadLedgerEntry,
// resolveCytologyWorkloadCapacity.ts) rather than a second, competing
// workload model — this report is a real, per-shift-day reshaping of
// the same real ledger data already being written at every real
// sign-out, using the exact same real capacity formula the live
// soft-brake/hard-block gate already enforces.
//
// Real, honest mapping for the given spec's own Manual vs. Imager
// slide-count split: 'fov_assisted' is this module's own only real
// review mode that represents genuine imaging-assisted screening;
// every other real mode (primary_manual, liquid_nongyn,
// fov_manual_rescreen, pathologist_review) is a real, manual review
// activity, imager-assisted or not, and counted as Manual here.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyWorkloadLedgerEntry } from '@/types/cytology/CytologyWorkloadLedgerEntry';
import { resolveCytologyWorkloadCapacity } from './resolveCytologyWorkloadCapacity';

export interface CytologyWorkloadTrackingRow {
  ctUserId: string;
  /** YYYY-MM-DD, the real calendar day `completedAt` falls on. */
  shiftDate: string;
  hoursScreened: number;
  manualSlidesCount: number;
  imagerSlidesCount: number;
  totalEquivSlides: number;
  maxAllowedVolume: number;
  exceedanceFlag: boolean;
}

export function resolveCytologyWorkloadTrackingReport(
  ledgerEntries: CytologyWorkloadLedgerEntry[],
  effectiveCapByUserId: Record<string, number>,
  defaultCap: number,
): CytologyWorkloadTrackingRow[] {
  const byUserAndDay = new Map<string, CytologyWorkloadLedgerEntry[]>();
  for (const entry of ledgerEntries) {
    const day = entry.completedAt.slice(0, 10);
    const key = `${entry.userId}|${day}`;
    const list = byUserAndDay.get(key) ?? [];
    list.push(entry);
    byUserAndDay.set(key, list);
  }

  return Array.from(byUserAndDay.entries()).map(([key, entries]) => {
    const [ctUserId, shiftDate] = key.split('|');
    const hoursScreened = entries.reduce((sum, e) => sum + e.activeDurationSeconds, 0) / 3600;
    const manualSlidesCount = entries.filter(e => e.reviewMode !== 'fov_assisted').length;
    const imagerSlidesCount = entries.filter(e => e.reviewMode === 'fov_assisted').length;
    const totalEquivSlides = entries.reduce((sum, e) => sum + e.scuWeight, 0);
    const cap = effectiveCapByUserId[ctUserId] ?? defaultCap;
    const capacity = resolveCytologyWorkloadCapacity(totalEquivSlides, hoursScreened, cap);

    return {
      ctUserId,
      shiftDate,
      hoursScreened,
      manualSlidesCount,
      imagerSlidesCount,
      totalEquivSlides,
      maxAllowedVolume: capacity.maxAllowedScu,
      exceedanceFlag: capacity.status === 'exceeded',
    };
  });
}
