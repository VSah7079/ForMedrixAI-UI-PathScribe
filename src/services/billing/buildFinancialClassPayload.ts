// src/services/billing/buildFinancialClassPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("is the data captured that a downstream
// fin application can manage this... the engine may need to package
// differently" / "the json object should contain all the elements
// that the engine will then recognize and format appropriately"):
// same real posture as jsonWebhookBuilder.ts's own
// ChargeCaptureEventPayload — "PathScribe is not generating HL7
// transactions, we are just sending json file to the interface
// engine. That is where the magic happens." This builder resolves and
// surfaces every real, known fact a downstream financial/RCM engine
// would need to perform its own primary-entitlement-deduction and
// secondary/patient-gap adjudication — it never attempts that
// adjudication itself. No dollar amounts, no coverage percentages, no
// invoice generation: this app has no real fee schedule or payer-
// specific reimbursement rate data, and fabricating either would be
// exactly the kind of guessed regulatory/financial data this app has
// avoided all session (see services/billing/README.md's own AMA/CPT
// modifier and CMS Place of Service posture).
//
// Same PRE-INTEGRATION SCAFFOLDING posture as jsonWebhookBuilder.ts/
// dftBuilder.ts — nothing dispatches this yet, no real HTTP transport
// exists. A real, tested payload shape, ready for when a real
// integration is built.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { MasterPaymentType, GuarantorRequirement } from '@/types/billing/MasterPaymentType';
import type { JurisdictionPaymentMapping } from '@/types/billing/JurisdictionPaymentMapping';
import { mockMasterPaymentTypeService } from './mockMasterPaymentTypeService';
import { mockJurisdictionPaymentMappingService } from './mockJurisdictionPaymentMappingService';

export interface FinancialClassCoverage {
  /** Real, per direct guidance: the SPECIFIC local scheme this
   *  coverage follows — the one fact a downstream engine actually
   *  needs to pick the right outbound claims format/local rules; see
   *  OutsidePatientFinancialData.ts's own header for the real
   *  ambiguity a bare master-category id would have left. */
  jurisdictionMappingId: string;
  countryCode: string;
  localSchemeCode: string;
  localDisplayTerminology: string;
  primaryOutboundFormat: string;
  masterPaymentTypeId: string;
  masterPaymentTypeDisplayName: string;
  requiresSubscriberId: boolean;
  subscriberIdLabel?: string;
  requiresGuarantor: GuarantorRequirement;
  supportsSplitBilling: boolean;
  payerName?: string;
  /** Policy/coverage number for primary coverage, member/card id for
   *  secondary — same real field this app's own
   *  OutsidePatientFinancialData already distinguishes by name. */
  memberOrPolicyNumber?: string;
}

export interface FinancialClassPayload {
  messageId: string;
  eventType: 'FinancialClassReady';
  eventTimestamp: string;
  caseId: string;
  intakeType: 'standard' | 'downtime' | 'outside';
  accountBillingType?: string;
  localIdNumber?: string;
  primaryCoverage?: FinancialClassCoverage;
  secondaryCoverage?: FinancialClassCoverage;
}

async function resolveCoverage(
  jurisdictionMappingId: string | undefined,
  payerName: string | undefined,
  memberOrPolicyNumber: string | undefined,
  mappingsById: Map<string, JurisdictionPaymentMapping>,
  typesById: Map<string, MasterPaymentType>
): Promise<FinancialClassCoverage | undefined> {
  if (!jurisdictionMappingId) return undefined;
  const mapping = mappingsById.get(jurisdictionMappingId);
  if (!mapping) return undefined;
  const masterType = typesById.get(mapping.masterPaymentTypeId);
  if (!masterType) return undefined;
  return {
    jurisdictionMappingId: mapping.id,
    countryCode: mapping.countryCode,
    localSchemeCode: mapping.localSchemeCode,
    localDisplayTerminology: mapping.localDisplayTerminology,
    primaryOutboundFormat: mapping.primaryOutboundFormat,
    masterPaymentTypeId: masterType.id,
    masterPaymentTypeDisplayName: masterType.displayName,
    requiresSubscriberId: masterType.requiresSubscriberId,
    subscriberIdLabel: masterType.subscriberIdLabel,
    requiresGuarantor: masterType.requiresGuarantor,
    supportsSplitBilling: masterType.supportsSplitBilling,
    payerName,
    memberOrPolicyNumber,
  };
}

/**
 * Real, per direct guidance: builds the full Financial Class payload
 * for one real case. Returns undefined coverage fields honestly (not
 * fabricated placeholders) when a case has no outsidePatientData at
 * all (Standard/Downtime intake), or when a referenced
 * JurisdictionPaymentMapping id no longer resolves (e.g. an admin
 * deactivated/removed it after this case was accessioned) — a
 * downstream engine seeing an absent field should treat it as
 * genuinely unknown, never assume a default.
 */
export async function buildFinancialClassPayload(caseData: Case): Promise<FinancialClassPayload> {
  const outsideData = caseData.order.outsidePatientData;

  const [typesRes, mappingsRes] = await Promise.all([
    mockMasterPaymentTypeService.getAll(),
    mockJurisdictionPaymentMappingService.getAll(),
  ]);
  const typesById = new Map((typesRes.ok ? typesRes.data : []).map(t => [t.id, t]));
  const mappingsById = new Map((mappingsRes.ok ? mappingsRes.data : []).map(m => [m.id, m]));

  const [primaryCoverage, secondaryCoverage] = await Promise.all([
    resolveCoverage(outsideData?.primaryJurisdictionMappingId, outsideData?.primaryPayerName, outsideData?.coveragePolicyNumber, mappingsById, typesById),
    outsideData?.hasSecondaryCoverage
      ? resolveCoverage(outsideData?.secondaryJurisdictionMappingId, outsideData?.secondaryPayerName, outsideData?.secondaryMemberId, mappingsById, typesById)
      : undefined,
  ]);

  return {
    messageId: `fin-${caseData.id}-${Date.now().toString(36)}`,
    eventType: 'FinancialClassReady',
    eventTimestamp: new Date().toISOString(),
    caseId: caseData.id,
    intakeType: caseData.order.intakeType ?? 'standard',
    accountBillingType: outsideData?.accountBillingType,
    localIdNumber: outsideData?.localIdNumber,
    primaryCoverage,
    secondaryCoverage,
  };
}
