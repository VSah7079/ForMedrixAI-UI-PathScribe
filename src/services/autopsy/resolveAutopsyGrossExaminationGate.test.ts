import { describe, it, expect } from 'vitest';
import { resolveAutopsyGrossExaminationGate } from './resolveAutopsyGrossExaminationGate';
import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

function baseCase(overrides: Partial<AutopsyCaseDetails>): AutopsyCaseDetails {
  return {
    jurisdiction: 'US',
    caseAuthority: 'medicolegal_forensic',
    scope: 'full',
    addenda: [],
    ancillaryHold: { active: false },
    ...overrides,
  } as AutopsyCaseDetails;
}

describe('resolveAutopsyGrossExaminationGate — medicolegal/forensic path', () => {
  it('a real case with no forensicAuthorization record at all is blocked', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({}));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toHaveLength(1);
  });

  it('a real forensicAuthorization with an empty orderReference is blocked \u2014 never a free-text justification standing in for a real order', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      forensicAuthorization: { authorityType: 'coroner', orderReference: '', orderDate: '2026-09-01' },
    }));
    expect(result.allowed).toBe(false);
  });

  it('a real, whitespace-only orderReference is treated the same as empty \u2014 blocked', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      forensicAuthorization: { authorityType: 'coroner', orderReference: '   ', orderDate: '2026-09-01' },
    }));
    expect(result.allowed).toBe(false);
  });

  it('a real forensicAuthorization missing its own orderDate is blocked', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      forensicAuthorization: { authorityType: 'coroner', orderReference: 'CO-2026-4471', orderDate: '' },
    }));
    expect(result.allowed).toBe(false);
  });

  it('a real, complete forensicAuthorization (real order reference and date) is allowed', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      forensicAuthorization: { authorityType: 'coroner', orderReference: 'CO-2026-4471', orderDate: '2026-09-01' },
    }));
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('a real, logged verbal order alone \u2014 with no real written orderReference/orderDate yet \u2014 never satisfies the gate, even though it already authorized real intake/refrigeration', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      forensicAuthorization: {
        authorityType: 'coroner',
        verbalOrderReceivedAt: '2026-09-01T02:15:00Z',
        verbalOrderReceivedFrom: 'On-call Deputy Coroner',
        orderReference: '',
        orderDate: '',
      },
    }));
    expect(result.allowed).toBe(false);
  });
});

describe('resolveAutopsyGrossExaminationGate — hospital-consented path', () => {
  it('a real case with no hospitalConsent record at all is blocked', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({ caseAuthority: 'hospital_consented' }));
    expect(result.allowed).toBe(false);
  });

  it('a real hospitalConsent record with no consentGivenAt is blocked', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      caseAuthority: 'hospital_consented',
      hospitalConsent: { consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner', consentGivenAt: '', consentScope: ['full'] },
    }));
    expect(result.allowed).toBe(false);
  });

  it('a real, active consent with no revokedOrNarrowedAt at all is allowed', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      caseAuthority: 'hospital_consented',
      hospitalConsent: { consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner', consentGivenAt: '2026-09-01T10:00:00Z', consentScope: ['full'] },
    }));
    expect(result.allowed).toBe(true);
  });

  it('a real, present revokedOrNarrowedAt blocks conservatively, even when the real revocationNote suggests it was only a scope narrowing, not a full revocation', () => {
    const result = resolveAutopsyGrossExaminationGate(baseCase({
      caseAuthority: 'hospital_consented',
      hospitalConsent: {
        consentingRelativeName: 'Jane Doe', consentingRelativeRelationship: 'spouse_or_partner',
        consentGivenAt: '2026-09-01T10:00:00Z', consentScope: ['full'],
        revokedOrNarrowedAt: '2026-09-02T09:00:00Z',
        revocationNote: 'Family narrowed scope to exclude brain retention; autopsy itself still authorized.',
      },
    }));
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]).toContain('revocation or scope narrowing');
  });
});
