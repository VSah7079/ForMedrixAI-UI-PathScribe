import { describe, it, expect, vi } from 'vitest';
import { recordAbnormalDetectionOutcomes, toAbnormalDetectionSignalInput } from './recordAbnormalDetectionOutcomes';
import type { CriticalFindingFlag } from '../clinical/detectCriticalFindings';

const narrative: CriticalFindingFlag = { term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma, 3.2 cm, identified', severity: 'Malignant', confidence: 92 };
const discrete: CriticalFindingFlag = { term: 'Margin Status', sourceField: 'synoptic', sourceQuote: 'Margin Status: Positive', severity: 'Critical', confidence: 100 };
const scope = { clientId: 'fac-1', pathologistId: 'u-1', subspecialtyId: 'breast' };

describe('toAbnormalDetectionSignalInput', () => {
  it('narrative findings are de-identified; discrete labels are stored as-is', () => {
    const n = toAbnormalDetectionSignalInput(narrative, 'c1', 'confirmed', 'vs-1');
    expect(n.source).toBe('narrative');
    expect(n.reasonClean).not.toContain('3.2 cm');
    expect(n.reasonClean).toContain('invasive ductal carcinoma');
    expect(n.studyId).toBe('vs-1');
    const d = toAbnormalDetectionSignalInput(discrete, 'c1', 'dismissed', undefined);
    expect(d).toEqual({ caseId: 'c1', source: 'discrete', reasonClean: 'Margin Status: Positive', suggestedSeverity: 'Critical', suggestedConfidence: 100, outcome: 'dismissed' });
    expect('studyId' in d).toBe(false);
  });
});

describe('recordAbnormalDetectionOutcomes', () => {
  it('resolves the covering Validation Study once and tags every signal with it (PS-137 gap)', async () => {
    const recordSignal = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const getStudyForCase = vi.fn().mockResolvedValue({ ok: true, data: { id: 'vs-demo-001' } });
    const n = await recordAbnormalDetectionOutcomes({ caseId: 'c1', findings: [narrative, discrete], outcome: 'confirmed', scope }, { signalService: { recordSignal }, studyService: { getStudyForCase } });
    expect(n).toBe(2);
    expect(getStudyForCase).toHaveBeenCalledTimes(1);
    expect(getStudyForCase).toHaveBeenCalledWith('fac-1', 'u-1', 'breast');
    expect(recordSignal.mock.calls.map(c => c[0].studyId)).toEqual(['vs-demo-001', 'vs-demo-001']);
  });

  it('records without a studyId when no study covers the case', async () => {
    const recordSignal = vi.fn().mockResolvedValue({ ok: true, data: {} });
    await recordAbnormalDetectionOutcomes({ caseId: 'c1', findings: [discrete], outcome: 'dismissed', scope }, { signalService: { recordSignal }, studyService: { getStudyForCase: vi.fn().mockResolvedValue({ ok: true, data: null }) } });
    expect(recordSignal.mock.calls[0][0].studyId).toBeUndefined();
  });

  it('no findings: nothing recorded and no study lookup', async () => {
    const recordSignal = vi.fn();
    const getStudyForCase = vi.fn();
    expect(await recordAbnormalDetectionOutcomes({ caseId: 'c1', findings: [], outcome: 'confirmed', scope }, { signalService: { recordSignal }, studyService: { getStudyForCase } })).toBe(0);
    expect(recordSignal).not.toHaveBeenCalled();
    expect(getStudyForCase).not.toHaveBeenCalled();
  });

  it('one failed write is logged and does not stop the others', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recordSignal = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue({ ok: true, data: {} });
    const n = await recordAbnormalDetectionOutcomes({ caseId: 'c1', findings: [narrative, discrete], outcome: 'confirmed', scope }, { signalService: { recordSignal }, studyService: { getStudyForCase: vi.fn().mockResolvedValue({ ok: true, data: null }) } });
    expect(n).toBe(1);
    expect(recordSignal).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
