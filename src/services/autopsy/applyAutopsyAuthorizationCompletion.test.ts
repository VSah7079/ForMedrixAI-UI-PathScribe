import { describe, it, expect } from 'vitest';
import { applyAutopsyAuthorizationCompletion } from './applyAutopsyAuthorizationCompletion';
import { resolveAutopsyGrossExaminationGate } from './resolveAutopsyGrossExaminationGate';
import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

function baseCase(overrides: Partial<AutopsyCaseDetails>): AutopsyCaseDetails {
  return {
    jurisdiction: 'US', caseAuthority: 'medicolegal_forensic', scope: 'full',
    addenda: [], ancillaryHold: { active: false }, ...overrides,
  } as AutopsyCaseDetails;
}

describe('applyAutopsyAuthorizationCompletion', () => {
  it('a real, temporary forensic case (verbal order only) has the real written order merged in, preserving the real verbal order fields already on file', () => {
    const original = baseCase({
      forensicAuthorization: { authorityType: 'coroner', verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner', orderReference: '', orderDate: '' },
    });
    const updated = applyAutopsyAuthorizationCompletion(original, { orderReference: 'CO-2026-4471', orderDate: '2026-09-01', consentGivenAt: '', consentScope: '' });
    expect(updated.forensicAuthorization).toEqual({
      authorityType: 'coroner', verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner',
      orderReference: 'CO-2026-4471', orderDate: '2026-09-01',
    });
  });

  it('the real, updated forensic case now correctly passes resolveAutopsyGrossExaminationGate \u2014 the two functions genuinely agree', () => {
    const original = baseCase({
      forensicAuthorization: { authorityType: 'coroner', verbalOrderReceivedAt: '2026-09-01T02:15:00Z', verbalOrderReceivedFrom: 'On-call Deputy Coroner', orderReference: '', orderDate: '' },
    });
    const updated = applyAutopsyAuthorizationCompletion(original, { orderReference: 'CO-2026-4471', orderDate: '2026-09-01', consentGivenAt: '', consentScope: '' });
    expect(resolveAutopsyGrossExaminationGate(updated).allowed).toBe(true);
  });

  it('a real, temporary hospital-consented case (relative name only) has the real consent grant merged in, preserving the real relative name/relationship already on file, and real consentScope is split into a real array', () => {
    const original = baseCase({
      caseAuthority: 'hospital_consented',
      hospitalConsent: { consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner', consentGivenAt: '', consentScope: [] },
    });
    const updated = applyAutopsyAuthorizationCompletion(original, { orderReference: '', orderDate: '', consentGivenAt: '2026-09-01T10:00:00Z', consentScope: 'full, no organ retention' });
    expect(updated.hospitalConsent).toEqual({
      consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner',
      consentGivenAt: '2026-09-01T10:00:00Z', consentScope: ['full', 'no organ retention'],
    });
    expect(resolveAutopsyGrossExaminationGate(updated).allowed).toBe(true);
  });
});
