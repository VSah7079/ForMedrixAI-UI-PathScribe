import { describe, it, expect } from 'vitest';
import { resolveDigitalReadinessBadge, resolveDpTriageBadge } from './resolveWorklistDpBadges';
import type { WsiScanSlide } from './IWsiScanBatchService';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

const slide = (overrides: Partial<WsiScanSlide>): WsiScanSlide => ({
  slidePosition: '1', caseId: 'c1', specimenId: 's1', scanStatus: 'completed', qcPassed: true, ...overrides,
});

const result = (overrides: Partial<AiScreeningResult>): AiScreeningResult => ({
  id: 'r1', caseId: 'c1', vendorId: 'v1', status: 'completed', orderedAt: '2026-01-01', findings: [], ...overrides,
});

describe('resolveDigitalReadinessBadge', () => {
  it('a real case with no WSI data at all returns undefined, never a fabricated badge', () => {
    expect(resolveDigitalReadinessBadge(undefined)).toBeUndefined();
    expect(resolveDigitalReadinessBadge([])).toBeUndefined();
  });

  it('every real slide scanned and QC passed is a real, green "ready" badge', () => {
    const badge = resolveDigitalReadinessBadge([slide({}), slide({ slidePosition: '2' })]);
    expect(badge).toEqual({ level: 'ready', summaryText: '2/2 Ready (QC Passed)' });
  });

  it('a real slide still scanning is a real, yellow "partial" badge, never counted as ready', () => {
    const badge = resolveDigitalReadinessBadge([slide({}), slide({ slidePosition: '2', scanStatus: 'scanning', qcPassed: undefined })]);
    expect(badge).toEqual({ level: 'partial', summaryText: '1/2 Partial (1 Scanning)' });
  });

  it('a real, completed scan with qcPassed still undefined (QC not yet reported) is partial, never silently counted as ready', () => {
    const badge = resolveDigitalReadinessBadge([slide({ qcPassed: undefined })]);
    expect(badge?.level).toBe('partial');
  });

  it('a real scan failure is a red "error" badge, including the real, reported failure reason', () => {
    const badge = resolveDigitalReadinessBadge([slide({ scanStatus: 'failed', qcPassed: undefined, failureReason: 'Focus error' })]);
    expect(badge).toEqual({ level: 'error', summaryText: '0/1 Error (Focus error)' });
  });

  it('a real QC failure on an otherwise successfully-scanned slide is also a red "error" badge', () => {
    const badge = resolveDigitalReadinessBadge([slide({ scanStatus: 'completed', qcPassed: false, failureReason: 'Out-of-focus' })]);
    expect(badge).toEqual({ level: 'error', summaryText: '0/1 Error (Out-of-focus)' });
  });
});

describe('resolveDpTriageBadge', () => {
  it('a real case with no AiScreeningResult at all returns undefined', () => {
    expect(resolveDpTriageBadge(undefined)).toBeUndefined();
  });

  it('a real, non-completed result (still ordered) returns undefined, never a premature badge', () => {
    expect(resolveDpTriageBadge(result({ status: 'ordered' }))).toBeUndefined();
  });

  it('a real, 3-level triageLevel (Paige/Ibex-style) maps directly, including its own real biomarkers', () => {
    const badge = resolveDpTriageBadge(result({
      slideTriage: { reviewRecommended: true, triageLevel: 'high_risk', primaryFinding: 'Malignancy Detected' },
      biomarkers: [{ name: 'Ki-67', value: '18%' }, { name: 'Gleason', value: '4+3 (Est)' }],
    }));
    expect(badge).toEqual({ level: 'high_risk', primaryText: 'Malignancy Detected', biomarkerSummary: 'Ki-67: 18% | Gleason: 4+3 (Est)' });
  });

  it('a real, binary reviewRecommended gate (BD FocalPoint-style) maps to equivocal, never high_risk \u2014 the vendor never claimed malignancy', () => {
    const badge = resolveDpTriageBadge(result({ slideTriage: { reviewRecommended: true } }));
    expect(badge).toEqual({ level: 'equivocal', primaryText: 'Review Recommended', biomarkerSummary: undefined });
  });

  it('a real, binary "no further review" gate maps to unremarkable', () => {
    const badge = resolveDpTriageBadge(result({ slideTriage: { reviewRecommended: false } }));
    expect(badge?.level).toBe('unremarkable');
  });

  it('a real vendor with only findings[] (Hologic Genius-style, no slideTriage at all) maps to equivocal with a real finding count', () => {
    const badge = resolveDpTriageBadge(result({ findings: [{ id: 'f1', label: 'Atypical cells' }, { id: 'f2', label: 'Another' }] }));
    expect(badge).toEqual({ level: 'equivocal', primaryText: '2 AI-Flagged Findings', biomarkerSummary: undefined });
  });

  it('a real vendor with no slideTriage and no findings at all is genuinely unremarkable', () => {
    const badge = resolveDpTriageBadge(result({}));
    expect(badge).toEqual({ level: 'unremarkable', primaryText: 'Pre-screened Unremarkable', biomarkerSummary: undefined });
  });
});
