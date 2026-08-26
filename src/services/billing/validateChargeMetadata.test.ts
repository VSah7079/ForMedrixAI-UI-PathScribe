import { describe, it, expect } from 'vitest';
import { validateChargeMetadata } from './validateChargeMetadata';

describe('validateChargeMetadata - real, direct verification', () => {
  it('flags MISSING_ICD10 when no icd10Codes exist', () => {
    const result = validateChargeMetadata({
      order: { icd10Codes: [] },
      participants: [{ status: 'active', externalIdType: 'NPI', externalId: '1234567890' }],
    });
    expect(result.map(f => f.errorCode)).toContain('MISSING_ICD10');
  });

  it('flags MISSING_PROVIDER_NPI when no active NPI participant exists', () => {
    const result = validateChargeMetadata({
      order: { icd10Codes: [{ code: 'C50.911' }] },
      participants: [{ status: 'active', externalIdType: 'GMC', externalId: 'GMC-123' }],
    });
    expect(result.map(f => f.errorCode)).toContain('MISSING_PROVIDER_NPI');
  });

  it('does not flag a removed participant\'s NPI as satisfying the requirement', () => {
    const result = validateChargeMetadata({
      order: { icd10Codes: [{ code: 'C50.911' }] },
      participants: [{ status: 'removed', externalIdType: 'NPI', externalId: '1234567890' }],
    });
    expect(result.map(f => f.errorCode)).toContain('MISSING_PROVIDER_NPI');
  });

  it('returns no failures when both are genuinely present', () => {
    const result = validateChargeMetadata({
      order: { icd10Codes: [{ code: 'C50.911' }] },
      participants: [{ status: 'active', externalIdType: 'NPI', externalId: '1234567890' }],
    });
    expect(result).toHaveLength(0);
  });

  it('can flag both real gaps at once', () => {
    const result = validateChargeMetadata({});
    expect(result).toHaveLength(2);
  });
});
