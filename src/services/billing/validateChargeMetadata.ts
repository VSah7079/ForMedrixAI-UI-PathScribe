// src/services/billing/validateChargeMetadata.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per Epic: PathScribe Outbound Billing & Charge Event Engine, User
// Story 4 - "Flag charges as FAILED if missing mandatory metadata (e.g.,
// missing ICD-10 link, unassigned provider NPI)." A pure function, same
// established pattern as checkSignOutBillingDeficiencies.ts/
// sweepChargesForOutbox.ts - real, genuinely detectable conditions, not
// simulated. This app really does have the case's real icd10Codes
// (Case.order.icd10Codes) and participant NPI (CaseParticipant.externalId/
// externalIdType) to check against - unlike Story 3's dispatch failures
// (see simulateDispatchFailure.ts's own header), this category is real.
// ─────────────────────────────────────────────────────────────────────────────

export interface CaseForMetadataCheck {
  order?: { icd10Codes?: { code: string }[] };
  participants?: { externalIdType?: 'GMC' | 'NPI'; externalId?: string; status: 'active' | 'removed' }[];
}

export interface MetadataValidationFailure {
  errorCode: 'MISSING_ICD10' | 'MISSING_PROVIDER_NPI';
  errorMessage: string;
}

/** Real, per direct guidance: checks the real case data a queued charge
 *  is about to be dispatched for. Returns every real gap found, not just
 *  the first - a case can genuinely be missing both at once. Empty array
 *  means the real metadata is genuinely complete. */
export function validateChargeMetadata(caseData: CaseForMetadataCheck): MetadataValidationFailure[] {
  const failures: MetadataValidationFailure[] = [];

  if (!caseData.order?.icd10Codes || caseData.order.icd10Codes.length === 0) {
    failures.push({
      errorCode: 'MISSING_ICD10',
      errorMessage: 'No ICD-10 diagnostic code linked to this case — required before this charge can dispatch.',
    });
  }

  const hasActiveNpi = (caseData.participants ?? []).some(
    p => p.status === 'active' && p.externalIdType === 'NPI' && !!p.externalId?.trim()
  );
  if (!hasActiveNpi) {
    failures.push({
      errorCode: 'MISSING_PROVIDER_NPI',
      errorMessage: 'No active participant with a provider NPI on file — required before this charge can dispatch.',
    });
  }

  return failures;
}
