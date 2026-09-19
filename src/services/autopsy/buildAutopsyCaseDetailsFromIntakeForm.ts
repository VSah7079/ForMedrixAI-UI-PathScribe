// src/services/autopsy/buildAutopsyCaseDetailsFromIntakeForm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "no business logic in the
// UI" requirement — the real, pure transform from a real, validated
// intake form into a real AutopsyCaseDetails record. Only ever called
// after resolveAutopsyIntakeFormValidation.ts confirms the real,
// minimal bar is met.
//
// Real, deliberate defaults for what a temporary accession
// genuinely doesn't know yet: `scope: 'full'` is a real, provisional
// placeholder (never itself authorization for anything — see
// resolveAutopsyGrossExaminationGate.ts, which this value never
// affects), `addenda: []` and `ancillaryHold: { active: false }` are
// the real, empty starting state every real case begins in.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';
import type { AutopsyIntakeFormState } from './resolveAutopsyIntakeFormValidation';

export function buildAutopsyCaseDetailsFromIntakeForm(form: AutopsyIntakeFormState): AutopsyCaseDetails {
  const details: AutopsyCaseDetails = {
    jurisdiction: form.jurisdiction as AutopsyCaseDetails['jurisdiction'],
    caseAuthority: form.caseAuthority as AutopsyCaseDetails['caseAuthority'],
    scope: 'full',
    addenda: [],
    ancillaryHold: { active: false },
  };

  if (form.caseAuthority === 'medicolegal_forensic') {
    details.forensicAuthorization = {
      authorityType: form.authorityType.trim(),
      authorityName: form.authorityName.trim() || undefined,
      verbalOrderReceivedAt: form.verbalOrderReceivedAt,
      verbalOrderReceivedFrom: form.verbalOrderReceivedFrom.trim(),
      orderReference: '',
      orderDate: '',
    };
  }

  if (form.caseAuthority === 'hospital_consented' && form.consentingRelativeName.trim()) {
    details.hospitalConsent = {
      consentingRelativeName: form.consentingRelativeName.trim(),
      consentingRelativeRelationship: form.consentingRelativeRelationship.trim(),
      consentGivenAt: '',
      consentScope: [],
    };
  }

  return details;
}
