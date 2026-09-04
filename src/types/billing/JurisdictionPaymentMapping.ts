// src/types/billing/JurisdictionPaymentMapping.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.2): the
// jurisdiction-specific "schema" half of the payment-type model — one
// real row per (country, local scheme) pair, mapping it to a real
// MasterPaymentType (MasterPaymentType.ts) and naming its own real
// primary outbound claims format. Deliberately a separate type/table
// from MasterPaymentType, not a nested field on it — the same master
// category (e.g. STATUTORY_SOCIAL_HEALTH) genuinely maps from several
// real, differently-named local schemes across different real
// countries (DE_GKV, FR_CPAM, NL_BASIS, BE_MUT, KR_NHIS all map to it
// in the source spec), so the relationship is real many-to-one, not
// one-to-one.
// ─────────────────────────────────────────────────────────────────────────────

export interface JurisdictionPaymentMapping {
  id: string;
  /** Real ISO-ish country/region code from the source spec — e.g.
   *  'US', 'UK', 'DE', 'FR'. 'CA_ON' is a real, deliberate exception:
   *  Canadian health-scheme administration is provincial, so the
   *  source spec itself scopes this one row to Ontario specifically
   *  rather than a bare 'CA'. */
  countryCode: string;
  /** Real, stable local scheme code — e.g. 'US_MEDICARE', 'DE_GKV'.
   *  Never regenerated; this is the real, human-recognizable key an
   *  admin searches/filters by. */
  localSchemeCode: string;
  /** Real, local-language/local-terminology display name — e.g.
   *  "Gesetzliche Krankenversicherung", "Sécurité Sociale (CPAM)" —
   *  deliberately NOT translated or normalized to English; this is
   *  what the real scheme is actually called in its own jurisdiction. */
  localDisplayTerminology: string;
  /** FK to MasterPaymentType.id — which real, jurisdiction-agnostic
   *  financial-mechanics category this local scheme's own behavior
   *  (subscriber ID / guarantor / split-billing requirements) actually
   *  follows. */
  masterPaymentTypeId: string;
  /** Real, named outbound claims format for this specific local scheme
   *  — e.g. 'X12 837P', 'KBV / KVDT Format', 'SESAM-Vitale / B2'.
   *  Documentation of which real format applies; this dictionary does
   *  not itself generate or validate against any of these formats —
   *  see the source spec's own Phase 2/3 roadmap for that real,
   *  separate, larger integration work. */
  primaryOutboundFormat: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
