// src/services/autopsy/resolveAutopsyAuthorizationCompletionValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "no business logic in the
// UI" requirement — the real, pure validation
// AutopsyAuthorizationCompletionForm.tsx only calls and renders.
// Validates exactly the fields resolveAutopsyGrossExaminationGate.ts
// itself requires — never a second, divergent definition of what
// "complete" means.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyCaseAuthority } from '@/types/autopsy/AutopsyCaseDetails';

export interface AutopsyAuthorizationCompletionFormState {
  orderReference: string;
  orderDate: string;
  consentGivenAt: string;
  consentScope: string;
}

export interface AutopsyAuthorizationCompletionValidationResult {
  valid: boolean;
  missingFieldIds: string[];
}

export function resolveAutopsyAuthorizationCompletionValidation(
  caseAuthority: AutopsyCaseAuthority,
  form: AutopsyAuthorizationCompletionFormState,
): AutopsyAuthorizationCompletionValidationResult {
  const missingFieldIds: string[] = [];

  if (caseAuthority === 'medicolegal_forensic') {
    if (!form.orderReference.trim()) missingFieldIds.push('orderReference');
    if (!form.orderDate) missingFieldIds.push('orderDate');
  }

  if (caseAuthority === 'hospital_consented') {
    if (!form.consentGivenAt) missingFieldIds.push('consentGivenAt');
  }

  return { valid: missingFieldIds.length === 0, missingFieldIds };
}
