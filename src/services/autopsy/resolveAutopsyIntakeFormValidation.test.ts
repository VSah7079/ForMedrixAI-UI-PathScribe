import { describe, it, expect } from 'vitest';
import { resolveAutopsyIntakeFormValidation, type AutopsyIntakeFormState } from './resolveAutopsyIntakeFormValidation';

function baseForm(overrides: Partial<AutopsyIntakeFormState>): AutopsyIntakeFormState {
  return {
    jurisdiction: '', caseAuthority: '', authorityType: '', authorityName: '',
    verbalOrderReceivedAt: '', verbalOrderReceivedFrom: '',
    consentingRelativeName: '', consentingRelativeRelationship: '',
    ...overrides,
  };
}

describe('resolveAutopsyIntakeFormValidation', () => {
  it('a real, completely empty form is missing both real, universal required fields', () => {
    const result = resolveAutopsyIntakeFormValidation(baseForm({}));
    expect(result.valid).toBe(false);
    expect(result.missingFieldIds).toEqual(['jurisdiction', 'caseAuthority']);
  });

  it('a real hospital-consented case needs only a real jurisdiction \u2014 never blocked from intake while a family decides', () => {
    const result = resolveAutopsyIntakeFormValidation(baseForm({ jurisdiction: 'US', caseAuthority: 'hospital_consented' }));
    expect(result.valid).toBe(true);
  });

  it('a real forensic case additionally requires a real authority type and a real, logged verbal order', () => {
    const result = resolveAutopsyIntakeFormValidation(baseForm({ jurisdiction: 'US', caseAuthority: 'medicolegal_forensic' }));
    expect(result.valid).toBe(false);
    expect(result.missingFieldIds).toEqual(['authorityType', 'verbalOrderReceivedAt', 'verbalOrderReceivedFrom']);
  });

  it('a real, complete forensic intake (jurisdiction, authority type, and a real logged verbal order) is valid \u2014 the real written order is never required at this stage', () => {
    const result = resolveAutopsyIntakeFormValidation(baseForm({
      jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', authorityType: 'coroner',
      verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner',
    }));
    expect(result.valid).toBe(true);
  });
});
