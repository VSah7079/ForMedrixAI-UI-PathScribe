import { describe, it, expect } from 'vitest';
import { buildAutopsyCaseDetailsFromIntakeForm } from './buildAutopsyCaseDetailsFromIntakeForm';
import { resolveAutopsyAccessionStatus } from './resolveAutopsyAccessionStatus';
import type { AutopsyIntakeFormState } from './resolveAutopsyIntakeFormValidation';

function baseForm(overrides: Partial<AutopsyIntakeFormState>): AutopsyIntakeFormState {
  return {
    jurisdiction: '', caseAuthority: '', authorityType: '', authorityName: '',
    verbalOrderReceivedAt: '', verbalOrderReceivedFrom: '',
    consentingRelativeName: '', consentingRelativeRelationship: '',
    ...overrides,
  };
}

describe('buildAutopsyCaseDetailsFromIntakeForm', () => {
  it('a real, complete forensic intake form builds a real forensicAuthorization with the written order left genuinely empty', () => {
    const result = buildAutopsyCaseDetailsFromIntakeForm(baseForm({
      jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', authorityType: 'coroner',
      verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner',
    }));
    expect(result.forensicAuthorization).toEqual({
      authorityType: 'coroner', authorityName: undefined,
      verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner',
      orderReference: '', orderDate: '',
    });
    expect(result.scope).toBe('full');
    expect(result.addenda).toEqual([]);
  });

  it('the real built case for a temporary, verbal-only forensic intake correctly reads as temporary via resolveAutopsyAccessionStatus \u2014 the two functions genuinely agree', () => {
    const result = buildAutopsyCaseDetailsFromIntakeForm(baseForm({
      jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', authorityType: 'coroner',
      verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner',
    }));
    expect(resolveAutopsyAccessionStatus(result)).toBe('temporary');
  });

  it('a real hospital-consented intake with a known point-of-contact relative builds a real hospitalConsent record with consent left genuinely ungiven', () => {
    const result = buildAutopsyCaseDetailsFromIntakeForm(baseForm({
      jurisdiction: 'US', caseAuthority: 'hospital_consented',
      consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner',
    }));
    expect(result.hospitalConsent).toEqual({
      consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner',
      consentGivenAt: '', consentScope: [],
    });
    expect(resolveAutopsyAccessionStatus(result)).toBe('temporary');
  });

  it('a real hospital-consented intake with no known relative yet builds no real hospitalConsent record at all, rather than an empty placeholder', () => {
    const result = buildAutopsyCaseDetailsFromIntakeForm(baseForm({ jurisdiction: 'US', caseAuthority: 'hospital_consented' }));
    expect(result.hospitalConsent).toBeUndefined();
  });
});
