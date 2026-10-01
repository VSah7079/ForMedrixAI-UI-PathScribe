// src/types/billing/MasterPaymentType.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.1): the
// jurisdiction-agnostic "financial mechanics" half of the payment-type
// model. A MasterPaymentType describes HOW a payment category behaves
// (does it need a subscriber ID, a guarantor, does it support split
// billing) — never which country or local scheme it belongs to. That
// mapping lives one level up, in JurisdictionPaymentMapping.ts, so the
// same 11 real categories here can be reused across every real
// jurisdiction's own local schemes rather than duplicated per country.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real, per the source spec: the "Requires Guarantor" column has three
 * genuinely distinct values, not two — SELF_PAY specifically is
 * "Optional," not simply True or False. Modeled as its own three-way
 * type rather than `boolean | 'optional'`, since every real
 * consumption site needs to handle all three explicitly.
 */
export type GuarantorRequirement = 'required' | 'optional' | 'not_required';

export interface MasterPaymentType {
  /** Real, stable Master Category ID from the source spec — e.g.
   *  'SELF_PAY', 'STATUTORY_SOCIAL_HEALTH'. Never regenerated; every
   *  real JurisdictionPaymentMapping row references this id directly. */
  id: string;
  displayName: string;
  requiresSubscriberId: boolean;
  /**
   * Real, per the source spec: PUBLIC_NHS and
   * OCCUPATIONAL_WORKERS_COMP each have their own real, distinct name
   * for what "Subscriber ID" actually means in that category ("NHS
   * Number", "Claim #") — shown in place of the generic label
   * wherever this field is ever rendered. Undefined for every
   * category the spec didn't give one to; never a fabricated default.
   */
  subscriberIdLabel?: string;
  requiresGuarantor: GuarantorRequirement;
  supportsSplitBilling: boolean;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
