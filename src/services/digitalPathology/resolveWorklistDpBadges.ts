// src/services/digitalPathology/resolveWorklistDpBadges.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed Digital Readiness spec and
// the follow-up decision to integrate DP data into the existing,
// single worklist (WorklistTable.tsx) rather than a second, separate
// page a pathologist would have to remember to also check. These are
// the real, pure badge-resolution functions that table renders —
// kept out of the row JSX since the vendor-shape reconciliation below
// (triageLevel vs. reviewRecommended vs. findings-only, per vendor)
// is genuine logic, not display formatting.
// ─────────────────────────────────────────────────────────────────────────────

import type { WsiScanSlide } from './IWsiScanBatchService';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

export type DigitalReadinessLevel = 'ready' | 'partial' | 'error';

export interface DigitalReadinessBadge {
  level: DigitalReadinessLevel;
  /** Real, e.g. "4/4 Ready (QC Passed)", "3/4 Partial (1 Scanning)",
   *  "2/3 Error (Focus Fail)" — matches the real spec's own worklist
   *  summary format. */
  summaryText: string;
}

/** Real, per direct guidance's own confirmed spec: green requires
 *  every real slide scanned AND every real, reported QC check passed
 *  — a real slide with qcPassed undefined (the real IMS hasn't
 *  reported a result yet) is NOT the same as a real, confirmed pass,
 *  so it never counts toward "ready" on its own. Red for any real
 *  scan failure or any real, reported QC failure; yellow otherwise
 *  (still scanning, or scanned but QC not yet reported). Undefined
 *  slides list (no real WsiScanBatch data for this case at all)
 *  returns undefined — never a fabricated badge for a case with no
 *  real digital slide data. */
export function resolveDigitalReadinessBadge(slides: WsiScanSlide[] | undefined): DigitalReadinessBadge | undefined {
  if (!slides || slides.length === 0) return undefined;
  const total = slides.length;
  const failed = slides.filter(s => s.scanStatus === 'failed' || s.qcPassed === false);
  const readyCount = slides.filter(s => s.scanStatus === 'completed' && s.qcPassed === true).length;

  if (failed.length > 0) {
    const reason = failed.find(s => s.failureReason)?.failureReason;
    return { level: 'error', summaryText: `${readyCount}/${total} Error${reason ? ` (${reason})` : ''}` };
  }
  if (readyCount === total) {
    return { level: 'ready', summaryText: `${readyCount}/${total} Ready (QC Passed)` };
  }
  const scanning = slides.filter(s => s.scanStatus === 'scanning').length;
  return { level: 'partial', summaryText: `${readyCount}/${total} Partial${scanning ? ` (${scanning} Scanning)` : ''}` };
}

export type DpTriageLevel = 'high_risk' | 'equivocal' | 'unremarkable';

export interface DpTriageBadge {
  level: DpTriageLevel;
  /** Real, e.g. "Malignancy Detected", "Atypical Crypts Flagged",
   *  "Pre-screened Unremarkable" — the one, real headline label a
   *  worklist row shows. */
  primaryText: string;
  /** Real, e.g. "Ki-67: 18% | Gleason: 4+3 (Est)" — undefined for a
   *  real vendor that reports no real, quantitative biomarkers. */
  biomarkerSummary?: string;
}

/** Real, per direct guidance's own confirmed spec — reconciles the
 *  three genuinely different real shapes this app's own real vendors
 *  report (see AiSlideTriageSummary's own doc comments):
 *  triageLevel (Paige/Ibex-style, real 3-level), reviewRecommended
 *  (BD FocalPoint-style, real binary gate), or findings[] alone
 *  (Hologic Genius-style, no real slide-level summary at all). Real,
 *  deliberate choice: a real binary "review recommended" gate maps to
 *  'equivocal', never 'high_risk' — that vendor's own real product
 *  never actually claims malignancy, only that a human should look,
 *  so a worklist badge claiming more than the vendor itself reported
 *  would be dishonest. Undefined for a real case with no real
 *  completed AiScreeningResult at all. */
export function resolveDpTriageBadge(result: AiScreeningResult | undefined): DpTriageBadge | undefined {
  if (!result || result.status !== 'completed') return undefined;

  const biomarkerSummary = result.biomarkers?.length
    ? result.biomarkers.map(b => `${b.name}: ${b.value}`).join(' | ')
    : undefined;

  const triage = result.slideTriage;
  if (triage?.triageLevel) {
    const levelMap: Record<string, DpTriageLevel> = { high_risk: 'high_risk', equivocal_review: 'equivocal', unremarkable: 'unremarkable' };
    return {
      level: levelMap[triage.triageLevel],
      primaryText: triage.primaryFinding ?? result.findings[0]?.label ?? 'AI Result Available',
      biomarkerSummary,
    };
  }
  if (triage && typeof triage.reviewRecommended === 'boolean') {
    return {
      level: triage.reviewRecommended ? 'equivocal' : 'unremarkable',
      primaryText: triage.reviewRecommended ? 'Review Recommended' : 'No Further Review',
      biomarkerSummary,
    };
  }
  if (result.findings.length > 0) {
    return {
      level: 'equivocal',
      primaryText: `${result.findings.length} AI-Flagged Finding${result.findings.length === 1 ? '' : 's'}`,
      biomarkerSummary,
    };
  }
  return { level: 'unremarkable', primaryText: 'Pre-screened Unremarkable', biomarkerSummary };
}
