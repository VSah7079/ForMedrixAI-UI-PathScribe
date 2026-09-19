// src/services/autopsy/resolveAutopsyIntakeFormValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "no business logic in the
// UI" requirement — the real, pure validation AutopsyIntakeForm.tsx
// only calls and renders. Deliberately validates the MINIMAL, real
// bar for temporary accession (receiving and refrigerating a body),
// never the full authorization resolveAutopsyGrossExaminationGate.ts
// requires for gross examination — those are two genuinely different
// real gates, per this whole module's own established design.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyCaseAuthority } from '@/types/autopsy/AutopsyCaseDetails';
import type { Jurisdiction } from '@/types/systemConfig';

export interface AutopsyIntakeFormState {
  jurisdiction: Jurisdiction | '';
  caseAuthority: AutopsyCaseAuthority | '';
  authorityType: string;
  authorityName: string;
  verbalOrderReceivedAt: string;
  verbalOrderReceivedFrom: string;
  consentingRelativeName: string;
  consentingRelativeRelationship: string;
}

export interface AutopsyIntakeFormValidationResult {
  valid: boolean;
  missingFieldIds: string[];
}

/** Real, per direct guidance's own confirmed research: even an
 *  urgent, verbal-only forensic order requires SOME real authority
 *  engagement on record — a real jurisdiction, a real authority type,
 *  and a real, logged verbal-order timestamp. A real hospital-
 *  consented case needs only a real jurisdiction to be received —
 *  per this whole module's own established design, a body is never
 *  blocked from intake/refrigeration while a family decides. */
export function resolveAutopsyIntakeFormValidation(form: AutopsyIntakeFormState): AutopsyIntakeFormValidationResult {
  const missingFieldIds: string[] = [];

  if (!form.jurisdiction) missingFieldIds.push('jurisdiction');
  if (!form.caseAuthority) missingFieldIds.push('caseAuthority');

  if (form.caseAuthority === 'medicolegal_forensic') {
    if (!form.authorityType.trim()) missingFieldIds.push('authorityType');
    if (!form.verbalOrderReceivedAt) missingFieldIds.push('verbalOrderReceivedAt');
    if (!form.verbalOrderReceivedFrom.trim()) missingFieldIds.push('verbalOrderReceivedFrom');
  }

  return { valid: missingFieldIds.length === 0, missingFieldIds };
}
