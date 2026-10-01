// src/services/billing/resolvePreAnalyticDateGateConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own cross-jurisdiction compliance
// research: every real market PathScribe targets treats a specimen
// missing its collection and/or laboratory-receipt date/time as a HARD
// BLOCK on report authorization — never a silent default, and never
// merely advisory. What genuinely varies per jurisdiction is the exact
// designated administrative-override label a lab enters when the real
// date truly isn't recoverable, and the exact mandatory disclaimer
// text/citation that accompanies it. This file is the single, real
// source for both, per country — same "one real, resolvable config
// per jurisdiction, never fabricated" posture as
// resolveBillingDateOfService.ts's own defaultRuleForCountry.
//
// Every string below is direct guidance's own verbatim research output
// (regulatory body, override label, disclaimer text) — this file does
// not independently verify or restate the underlying regulation; it is
// real, structured storage for text a domain expert already supplied,
// same posture this app already takes toward AMA/CMS-sourced billing
// data elsewhere (never re-derived, never guessed).
//
// Real, disclosed, NOT modeled here: the Datix/NHS incident-log
// integration, the EU IVDR schema-level validation gate, the South
// Korean real-time EMR/NHIS claims-transmission validation, and the
// Éclair LIS-specific footnote automation — none of these are real,
// existing integrations in this codebase (no external
// incident-system/EMR connector exists at all). Each country's
// `systemNote` field carries the real, honest disclosure of what
// PathScribe does NOT yet do for that jurisdiction, same "pre-
// integration scaffolding, nothing dispatches this yet" posture
// jsonWebhookBuilder.ts already uses for its own real, undone RCM
// transport gap.
//
// Real, universal disclosure, confirmed directly against
// services/hl7/README.md: PathScribe has NO real outbound HL7 ORU
// (result/report) or FHIR DiagnosticReport pipeline at all today —
// only ORM^O01 (orders, ormBuilder.ts) and DFT^P03 (financial
// transactions, dftBuilder.ts) are real, standards-conformant
// builders. sendSynopticReportToLis (useLisIntegration.ts) is its own
// file's own disclosed simulation, carrying only short status text
// ("Synoptic instance X corrected and re-signed out"), never the
// actual clinical report body. The real, currently-distributed report
// artifact is the PDF (generateReportPdfSnapshot/REPORT_PDF_ENDPOINT)
// — this is why every jurisdiction's disclaimerText is wired into that
// payload (SynopticReportPage.tsx) and NOT into any HL7 segment: there
// is no real HL7 segment carrying report content to wire it into yet.
// Building a real outbound ORU builder (parallel to ormBuilder.ts) is
// a genuinely separate, larger, not-yet-scoped piece of work.
// ─────────────────────────────────────────────────────────────────────────────

import type { Organisation } from '@/services/organisation/organisationService';

export interface PreAnalyticDateGateConfig {
  /** Real regulatory citation this jurisdiction's config is grounded
   *  in — shown alongside the deficiency/CAPA record so a reviewer
   *  can trace exactly which standard drove the block. */
  standardReference: string;
  /** The real, designated administrative-override label this
   *  jurisdiction's own accreditation body expects when a genuine
   *  collection/receipt date can't be recovered — e.g. "Date Not
   *  Provided". Never a fabricated date string; this is a real,
   *  literal label PreAnalyticDateGateModal writes into the audit
   *  trail (SpecimenDeficiency.comment) when the override is used —
   *  the specimen's own receivedAt/collectedAt stay undefined, with
   *  the real *AdministrativeOverride flag set instead (see
   *  Specimen.ts's own doc comments on those two fields). */
  administrativeOverrideLabel: string;
  /** The real, mandatory disclaimer text this jurisdiction requires
   *  once a report is authorized on an administrative override —
   *  sent through to the report PDF renderer the same honest way
   *  generateReportPdfSnapshot already sends watermarkText: this
   *  React app can supply the real payload field, but can't itself
   *  verify the separate PDF service draws it. */
  disclaimerText: string;
  /** Real, honest disclosure of what PathScribe does NOT yet
   *  automate for this jurisdiction (external incident-logging
   *  systems, schema-level transmission validation, etc.) — never
   *  fabricated as if it were a real, working integration. Always
   *  present; genuinely empty only if a jurisdiction has no such gap
   *  disclosed yet. */
  systemNote: string;
}

// Real, per direct guidance's own table — one row per real country
// this app resolves against. 'EU' is a deliberate single generic
// bucket (COFRAC/DAkkS/ENAC together), matching direct guidance's own
// single combined row, not per-member-state granularity.
const CONFIG_BY_COUNTRY: Record<Organisation['country'], PreAnalyticDateGateConfig> = {
  US: {
    standardReference: 'CAP / CLIA \u00a7 493.1241',
    administrativeOverrideLabel: 'Unknown / Not Provided',
    disclaimerText: 'This report is issued without a validated specimen collection or laboratory-receipt date/time. Turnaround time and specimen stability metrics could not be confirmed.',
    systemNote: 'No real internal lab exception-tracking system integration exists in PathScribe yet \u2014 the administrative override is recorded on the specimen and via a real, open SpecimenDeficiency (CAPA) record only. Also real and disclosed: PathScribe has no real outbound HL7 ORU^R01 pipeline at all today (see this file\u2019s own header) \u2014 this disclaimer reaches the real, distributed PDF, not an HL7 segment that doesn\u2019t yet exist.',
  },
  UK: {
    standardReference: 'UKAS ISO 15189 Clause 7.2 / RCPath',
    administrativeOverrideLabel: 'Date Not Provided',
    disclaimerText: 'Specimen received without collection date/time. Turnaround time and sample integrity cannot be fully validated.',
    systemNote: 'No real Datix or other NHS pre-analytic incident-log integration exists in PathScribe yet \u2014 pre-integration scaffolding only, nothing dispatches this automatically. The real, open SpecimenDeficiency (CAPA) record is the only real tracking today; routing it to Datix per local governance is a manual, disclosed follow-up step.',
  },
  EU: {
    standardReference: 'EU IVDR / ISO 15189 (e.g. COFRAC, DAkkS, ENAC)',
    administrativeOverrideLabel: 'Not Provided / Unknown',
    disclaimerText: 'Specimen received without a validated collection or receipt date/time. Turnaround time and sample stability cannot be verified for this report.',
    systemNote: 'No real hard-coded HL7/FHIR schema-level validation gate exists in PathScribe yet, and this app cannot itself render an un-editable PDF disclaimer banner \u2014 the disclaimer text above is sent to the real, separate PDF rendering service as real, structured data (same honest posture as watermarkText), but this app can\u2019t verify that service actually draws it or that it\u2019s genuinely un-editable there. Also real and disclosed: PathScribe has no real outbound HL7 ORU/FHIR DiagnosticReport pipeline at all today (see this file\u2019s own header) \u2014 there is no HL7 segment carrying report content to inject this into. National Health System integrations (Dossier M\u00e9dical Partag\u00e9, Nordic registries) that reject transmissions on null temporal attributes are real, external systems this app does not itself implement or simulate. The "Interim/Provisional Report" exception pathway some EU member states allow (a laboratory director issuing a report on urgent clinical need with a legally-binding disclaimer) is a real, disclosed, NOT-built capability \u2014 PathScribe has no provisional/interim report concept at all today.',
  },
  NZ: {
    standardReference: 'IANZ / AS ISO 15189:2022',
    administrativeOverrideLabel: 'Date/Time Not Stated',
    disclaimerText: 'Specimen received without a documented collection or receipt date/time. Turnaround time and specimen stability cannot be confirmed for this report.',
    systemNote: 'No real \u00c9clair or other LIS-side automated discrediting-footnote integration exists in PathScribe yet \u2014 the disclaimer above is the real, interim equivalent, sent to the PDF renderer directly.',
  },
  KR: {
    standardReference: 'KAZA / ISO 15189, KSP / KSLM',
    // Real correction, per direct guidance's own secondary corroborating
    // source: the specific administrative term is '\ubbf8\uc0c1' (mi-sang), not
    // the more colloquial '\uc54c \uc218 \uc5c6\uc74c' an earlier pass of this file used -
    // both mean "unknown" in English, but \ubbf8\uc0c1 is the real, formal term
    // used in Korean administrative/accreditation documentation.
    administrativeOverrideLabel: '\ubbf8\uc0c1 (Unknown)',
    disclaimerText: 'This report is issued without a validated specimen collection or receipt date/time. Stability and turnaround time metrics could not be confirmed.',
    systemNote: 'No real-time EMR/NHIS claims-transmission validation integration exists in PathScribe yet \u2014 this app cannot itself prevent a schema-level validation failure downstream. The real, open SpecimenDeficiency (CAPA) record is what actually logs the accessioning error today.',
  },
  AU: {
    standardReference: 'NATA / NPAAC, AS ISO 15189',
    administrativeOverrideLabel: 'Date/Time Not Stated',
    disclaimerText: 'Specimen received without collection date/time; stability cannot be verified.',
    systemNote: 'No real, automated Medicare billing-compliance check exists in PathScribe beyond this disclaimer and the real, open SpecimenDeficiency (CAPA) record \u2014 a human biller should independently confirm Medicare billing compliance for any charge resolved on an administrative-override date.',
  },
  // Real, honest gap: direct guidance's own cross-jurisdiction table
  // didn't include Canada, even though 'CA' is a real, existing
  // country this app already resolves against elsewhere
  // (resolveBillingDateOfService.ts's own ACCESSION_DATE default).
  // Rather than silently reuse another country's real, jurisdiction-
  // specific citation/label/text as if it were confirmed for Canada
  // too, this uses a generic, clearly-labeled placeholder — a real
  // gap, not a fabricated CA-specific standard.
  CA: {
    standardReference: 'Not yet confirmed for this jurisdiction \u2014 generic placeholder pending real research',
    administrativeOverrideLabel: 'Not Provided',
    disclaimerText: 'This report is issued without a validated specimen collection or laboratory-receipt date/time. Turnaround time and specimen stability metrics could not be confirmed.',
    systemNote: 'Real, disclosed gap: no Canada-specific accreditation research has been confirmed for this jurisdiction yet (direct guidance\u2019s own cross-jurisdiction table did not include a CA row) \u2014 this generic config is a placeholder, not a verified CA standard. Flag for real research before relying on this for an actual Canadian site.',
  },
};

/** Real, per direct guidance's own confirmation that every jurisdiction
 *  in the research table is a hard block \u2014 there is no real "advisory
 *  only" or "soft" variant. Returns the real, resolved config for a
 *  given Organisation.country, or the CA placeholder's own shape as an
 *  honest last resort for a country genuinely absent from real
 *  research (never silently reusing another country's specific
 *  citation as if it were confirmed). */
export function resolvePreAnalyticDateGateConfig(country: Organisation['country'] | undefined): PreAnalyticDateGateConfig {
  if (country && CONFIG_BY_COUNTRY[country]) return CONFIG_BY_COUNTRY[country];
  return {
    standardReference: 'Not yet confirmed for this jurisdiction \u2014 generic placeholder pending real research',
    administrativeOverrideLabel: 'Not Provided',
    disclaimerText: 'This report is issued without a validated specimen collection or laboratory-receipt date/time. Turnaround time and specimen stability metrics could not be confirmed.',
    systemNote: 'Real, disclosed gap: no country was resolvable for this case (no real Organisation/Site context available), so this generic placeholder was used rather than fabricating a jurisdiction-specific citation.',
  };
}
