// @vitest-environment happy-dom
// src/services/abnormalDetection/mockAbnormalDetectionSignalService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockAbnormalDetectionSignalService } from './mockAbnormalDetectionSignalService';

describe('mockAbnormalDetectionSignalService — PS-137 real agreement-rate stats', () => {
  beforeEach(() => {
    localStorage.removeItem('pathscribe_mock_pathscribe_abnormal_detection_signals');
  });

  it('returns real, honest zero-value stats when no signals have been recorded yet — never an error, never NaN', async () => {
    const res = await mockAbnormalDetectionSignalService.getStats();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.totalSignals).toBe(0);
      expect(res.data.agreementRate).toBe(0);
    }
  });

  it('computes a real, correct overall agreement rate across mixed outcomes', async () => {
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c1', source: 'discrete', reasonClean: 'Margin Status: Positive', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c2', source: 'narrative', reasonClean: '[finding]', suggestedSeverity: 'Abnormal', suggestedConfidence: 70, outcome: 'dismissed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c3', source: 'narrative', reasonClean: '[finding]', suggestedSeverity: 'Malignant', suggestedConfidence: 92, outcome: 'confirmed' });

    const res = await mockAbnormalDetectionSignalService.getStats();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.totalSignals).toBe(3);
      expect(res.data.confirmedCount).toBe(2);
      expect(res.data.dismissedCount).toBe(1);
      expect(res.data.agreementRate).toBeCloseTo(2 / 3);
    }
  });

  it('breaks down real agreement correctly by severity', async () => {
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c1', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c2', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'dismissed' });

    const res = await mockAbnormalDetectionSignalService.getStats();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.bySeverity.Critical).toEqual({ total: 2, confirmed: 1 });
      expect(res.data.bySeverity.Malignant).toEqual({ total: 0, confirmed: 0 });
    }
  });

  it('breaks down real agreement correctly by source (discrete vs. narrative)', async () => {
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c1', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c2', source: 'narrative', reasonClean: 'x', suggestedSeverity: 'Malignant', suggestedConfidence: 90, outcome: 'confirmed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c3', source: 'narrative', reasonClean: 'x', suggestedSeverity: 'Malignant', suggestedConfidence: 60, outcome: 'dismissed' });

    const res = await mockAbnormalDetectionSignalService.getStats();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.bySource.discrete).toEqual({ total: 1, confirmed: 1 });
      expect(res.data.bySource.narrative).toEqual({ total: 2, confirmed: 1 });
    }
  });

  it('getByCaseId returns only the real signals for that case', async () => {
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c1', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c2', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed' });

    const res = await mockAbnormalDetectionSignalService.getByCaseId('c1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].caseId).toBe('c1');
    }
  });

  it('Batch 318: getByStudy and getStats(studyId) scope to one Validation Study', async () => {
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c1', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'confirmed', studyId: 'vs-1' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c2', source: 'discrete', reasonClean: 'x', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'dismissed', studyId: 'vs-1' });
    await mockAbnormalDetectionSignalService.recordSignal({ caseId: 'c3', source: 'narrative', reasonClean: 'x', suggestedSeverity: 'Abnormal', suggestedConfidence: 60, outcome: 'confirmed' });

    const byStudy = await mockAbnormalDetectionSignalService.getByStudy('vs-1');
    expect(byStudy.ok && byStudy.data.map(s => s.caseId)).toEqual(['c1', 'c2']);

    const scoped = await mockAbnormalDetectionSignalService.getStats('vs-1');
    expect(scoped.ok && scoped.data.totalSignals).toBe(2);
    expect(scoped.ok && scoped.data.agreementRate).toBeCloseTo(0.5);

    const all = await mockAbnormalDetectionSignalService.getStats();
    expect(all.ok && all.data.totalSignals).toBe(3);
  });
});
