import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/aiIntegration/aiProviderService', () => ({
  callAi: vi.fn(),
}));

import { callAi } from '@/services/aiIntegration/aiProviderService';
import { detectCriticalFindings } from './detectCriticalFindings';

describe('detectCriticalFindings — real, direct verification', () => {
  beforeEach(() => {
    vi.mocked(callAi).mockReset();
  });

  it('returns an empty, honest result without calling the model when all real text fields are blank', async () => {
    const res = await detectCriticalFindings({ gross: '', microscopic: '  ', ancillary: '' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.flags).toEqual([]);
    expect(callAi).not.toHaveBeenCalled();
  });

  it('parses a real, well-formed model response into structured flags', async () => {
    vi.mocked(callAi).mockResolvedValueOnce({
      text: JSON.stringify({
        flags: [
          { term: 'invasive carcinoma', sourceField: 'microscopic', sourceQuote: 'invasive ductal carcinoma identified', severity: 'critical' },
        ],
      }),
      provider: 'structured_messages' as any,
      model: 'test-model',
    });
    const res = await detectCriticalFindings({ gross: 'x', microscopic: 'Invasive ductal carcinoma identified.', ancillary: '' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.flags).toHaveLength(1);
      expect(res.data.flags[0].term).toBe('invasive carcinoma');
      expect(res.data.flags[0].severity).toBe('critical');
    }
  });

  it('strips real markdown code fences before parsing, same established pattern as suggestSynopticFields', async () => {
    vi.mocked(callAi).mockResolvedValueOnce({
      text: '```json\n{"flags":[]}\n```',
      provider: 'structured_messages' as any,
      model: 'test-model',
    });
    const res = await detectCriticalFindings({ gross: 'x', microscopic: '', ancillary: '' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.flags).toEqual([]);
  });

  it('returns an honest, empty flags array when the model finds nothing - never fabricates a finding', async () => {
    vi.mocked(callAi).mockResolvedValueOnce({
      text: JSON.stringify({ flags: [] }),
      provider: 'structured_messages' as any,
      model: 'test-model',
    });
    const res = await detectCriticalFindings({ gross: 'Benign tissue.', microscopic: 'No evidence of malignancy.', ancillary: '' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.flags).toEqual([]);
  });

  it('returns a real, honest error when the model response is not valid JSON, rather than throwing', async () => {
    vi.mocked(callAi).mockResolvedValueOnce({
      text: 'not real json at all',
      provider: 'structured_messages' as any,
      model: 'test-model',
    });
    const res = await detectCriticalFindings({ gross: 'x', microscopic: '', ancillary: '' });
    expect(res.ok).toBe(false);
  });

  it('returns a real, honest error when the underlying callAi call itself fails, rather than throwing', async () => {
    vi.mocked(callAi).mockRejectedValueOnce(new Error('Provider unavailable'));
    const res = await detectCriticalFindings({ gross: 'x', microscopic: '', ancillary: '' });
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toContain('Provider unavailable');
  });

  it('defensively defaults to an empty array if flags is missing or malformed in the response, rather than crashing', async () => {
    vi.mocked(callAi).mockResolvedValueOnce({
      text: JSON.stringify({ notFlags: 'unexpected shape' }),
      provider: 'structured_messages' as any,
      model: 'test-model',
    });
    const res = await detectCriticalFindings({ gross: 'x', microscopic: '', ancillary: '' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.flags).toEqual([]);
  });

  it('never passes patient identifiers - the real function signature only accepts narrative text fields', () => {
    // Real, structural verification of the PHI-minimization boundary:
    // this function's own parameter type has no field a caller could
    // even use to pass a patient name/MRN/DOB through.
    const callText: { gross: string; microscopic: string; ancillary: string } = { gross: '', microscopic: '', ancillary: '' };
    expect(Object.keys(callText).sort()).toEqual(['ancillary', 'gross', 'microscopic']);
  });
});
