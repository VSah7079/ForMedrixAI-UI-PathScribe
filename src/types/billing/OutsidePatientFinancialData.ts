// src/types/billing/OutsidePatientFinancialData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 4 — "UI
// Specifications: Updated Accessioning Screen"): the real, structured
// data the Accessioning Screen's own Outside Patient Data tab
// collects, captured on OrderMetadata.outsidePatientData
// (types/case/Case.ts) only when Intake Type is 'outside' — never
// populated for a Standard or Downtime accession.
//
// Deliberately does NOT duplicate fields this app's own Accessioning
// Screen already collects elsewhere on the Case & Patient tab — Client
// Account reuses the existing order.facilityId/Client search (a real
// Facility can already represent an outside/reference-lab client, per
// direct confirmation there's no separate outside-client directory to
// build); Ordering Provider reuses the existing
// order.requestingProvider/orderingPhysicianId. This type only holds
// what's genuinely new: jurisdiction identification and financial
// class/coverage routing.
// ─────────────────────────────────────────────────────────────────────────────

export interface OutsidePatientFinancialData {
  /** Real, per direct guidance: auto-populated from the selected
   *  Client Account's own Facility.defaultAccountBillingType
   *  (services/facilities/IFacilityService.ts) when available, but
   *  always editable — the source spec's own dynamic-behavior rule 1
   *  describes a real default, not a locked value. */
  accountBillingType?: string;
  /** Real ISO-ish country/region code — the same real vocabulary
   *  JurisdictionPaymentMapping.countryCode uses
   *  (services/billing/mockJurisdictionPaymentMappingService.ts), e.g.
   *  'FR', 'UK', 'CA_ON'. Drives the real, dynamic Local ID Number
   *  label/placeholder per the source spec's own dynamic-behavior
   *  rule 2 (SSN in US, NHS Number in UK, NIR in France, CRN in
   *  Australia). */
  primaryJurisdictionCountryCode?: string;
  /** Real, free-text local patient identifier — NIR/Carte Vitale,
   *  NHS Number, SSN, CRN, etc., per whichever jurisdiction is
   *  selected above. Deliberately free text, not validated against a
   *  jurisdiction-specific format/checksum — that real validation
   *  logic is separate, later work the source spec doesn't scope
   *  here. */
  localIdNumber?: string;
  /**
   * Real, per direct guidance: the SPECIFIC JurisdictionPaymentMapping.id
   * actually selected — NOT the derived Master Payment Type alone.
   * Real, confirmed gap this replaces: a bare masterPaymentTypeId
   * (e.g. STATUTORY_SOCIAL_HEALTH) is genuinely ambiguous the moment
   * a country has more than one real local scheme mapping to the same
   * master category — nothing in the dictionary schema prevents that,
   * even though today's seed data happens not to have a case of it.
   * A downstream financial engine needs to know EXACTLY which real
   * local scheme applied (to pick the right outbound claims format,
   * apply the right local rules) — that's this field's whole job. The
   * master category, subscriber/guarantor requirements, and outbound
   * format are all real, resolvable facts derived FROM this id at
   * export time (see services/billing/buildFinancialClassPayload.ts),
   * not re-cached here where they could drift from the real mapping
   * if it's ever edited.
   */
  primaryJurisdictionMappingId?: string;
  /**
   * Real, per direct guidance: free text, not a structured payer/fund
   * directory — confirmed directly that no such registry exists in
   * this app yet (a real payer/fund could have hundreds of regional
   * entries per country; building that full registry is real,
   * separate, larger work beyond this dictionary's own Step 1 scope).
   * The source spec's own mockup example ("Caisse Primaire
   * d'Assurance Maladie (CPAM - Paris)") is a specific regional office,
   * one level more granular than the Jurisdiction Payment Mapping
   * dictionary's own local-scheme rows.
   */
  primaryPayerName?: string;
  coveragePolicyNumber?: string;
  /** Real, per the source spec's own "Split-Billing Toggle" dynamic
   *  behavior rule 3: exposes the two fields below only when true. */
  hasSecondaryCoverage?: boolean;
  /** Real, per direct guidance: same precise-mapping-id fix as
   *  primaryJurisdictionMappingId above, applied to the secondary/
   *  complementary coverage side. */
  secondaryJurisdictionMappingId?: string;
  secondaryPayerName?: string;
  secondaryMemberId?: string;
}
