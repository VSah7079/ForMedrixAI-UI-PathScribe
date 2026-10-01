// src/services/billing/canCaseExportDft.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the original Trigger A/B governance design's own "Resolution
// & Governance Workflow": "Block Billing Export: Any case with an OPEN
// billing deficiency status is automatically suppressed from the HL7
// DFT / EDI 837 output stream." A pure function, same established
// pattern as every other real check this session
// (checkSignOutBillingDeficiencies.ts/validateChargeMetadata.ts) -
// real data in, real answer out, never touches storage itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingDeficiencyRecord } from '@/types/billing/BillingDeficiencyRecord';

export interface DftExportGate {
  allowed: boolean;
  /** Real, genuinely blocking records - OPEN or UNDER_REVIEW only.
   *  RESOLVED and OVERRIDDEN_WITH_JUSTIFICATION are real, permanent
   *  history but no longer block anything, matching the same real
   *  status lifecycle Financials pillar's own resolve action already
   *  produces. */
  blocking: BillingDeficiencyRecord[];
}

/** Real, per direct guidance - checks a case's real billing deficiencies
 *  for this specific case before it's cleared for real HL7 DFT export. */
export function canCaseExportDft(caseDeficiencies: BillingDeficiencyRecord[]): DftExportGate {
  const blocking = caseDeficiencies.filter(d => d.status === 'OPEN' || d.status === 'UNDER_REVIEW');
  return { allowed: blocking.length === 0, blocking };
}
