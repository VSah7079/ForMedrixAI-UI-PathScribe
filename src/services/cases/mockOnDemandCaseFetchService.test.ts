import { describe, it, expect } from 'vitest';
import { mockOnDemandCaseFetchService } from './mockOnDemandCaseFetchService';

describe('mockOnDemandCaseFetchService', () => {
  it('the real demo remote-only accession is genuinely found', async () => {
    const res = await mockOnDemandCaseFetchService.fetchCaseByAccession('S26-9077-SP-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.outcome).toBe('found');
      if (res.data.outcome === 'found') expect(res.data.caseData.accession?.fullAccession).toBe('S26-9077-SP-1');
    }
  });

  it('a real, genuinely unknown accession returns not_found, never a fabricated case', async () => {
    const res = await mockOnDemandCaseFetchService.fetchCaseByAccession('NO-SUCH-ACCESSION');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.outcome).toBe('not_found');
  });
});
