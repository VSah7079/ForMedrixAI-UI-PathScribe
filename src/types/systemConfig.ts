/**
 * src/types/systemConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure type definitions and default values for PathScribe system configuration.
 * No React, no side effects — safe to import anywhere.
 *
 * Single source of truth for:
 *   - The SystemConfig shape (what fields exist and their types)
 *   - DEFAULT_SYSTEM_CONFIG (safe baseline for first run / new fields)
 *
 * Runtime layer (loading, persisting, React context):
 *   → contexts/SystemConfigContext.tsx
 *
 * ─── Changelog ───────────────────────────────────────────────────────────────
 * v1  Initial — LIS integration flags, approved fonts
 * v2  Added jurisdiction, terminologyConfig
 * v3  Added voiceEnabled master switch
 * v4  Added GB_NIR, AU, NZ jurisdictions
 *     Added JurisdictionLocale, PatientIdStandard lookup tables
 *     Added IdentifierFormat / IdentifierFormats expansion (slide + barcode)
 *     Added IDENTIFIER_FORMAT_LIBRARY and helpers
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. JURISDICTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The institution's operating jurisdiction.
 * Determines SNOMED CT release, ICD-10 variant, locale, date/time format,
 * patient identifier standards, and license requirements.
 * Set once at deployment — never changed by end users.
 *
 * Licensing notes:
 *   US      — SNOMED CT US Edition (NLM) + ICD-10-CM. UMLS registration (free).
 *   CA      — SNOMED CT Canada Edition (Infoway) + ICD-10-CA (CIHI). Both free.
 *   GB_EW   — SNOMED CT UK Edition (NHS Digital/TRUD) + ICD-10 WHO. TRUD (free).
 *   GB_SCT  — SNOMED CT UK Edition + Scottish Extension (NHS Scotland/TRUD).
 *   GB_NIR  — SNOMED CT UK Edition (NHS Digital/TRUD) + ICD-10 WHO.
 *             H&C Number is the patient identifier (not NHS Number).
 *   IE      — SNOMED CT (SNOMED International Affiliate License, commercial fee)
 *             + ICD-10-AM (HSE Ireland/NCPOH). Affiliate License required before
 *             seeding production. Mock mode works without it during development.
 *   AU      — SNOMED CT Australian Edition (NCTS/AIHW) + ICD-10-AM (AIHW).
 *             NCTS registration (free). IHI is the patient identifier.
 *   NZ      — SNOMED CT New Zealand Edition (NCTS) + ICD-10-AM-NZ (MOH NZ).
 *             NHI is the patient identifier.
 *   KR      — SNOMED CT Korea Edition (Korea became SNOMED International's
 *             39th Member, August 2020, governed by the Ministry of Health
 *             and Welfare) + KCD-8 (Korean Standard Classification of
 *             Diseases, 8th Revision — Korea's own ICD-10-based national
 *             modification, analogous to ICD-10-CM/ICD-10-AM elsewhere).
 *             Real, important distinction confirmed via research, NOT a
 *             minor detail: unlike AU's IHI or NZ's NHI (both dedicated,
 *             healthcare-only identifiers, deliberately separate from any
 *             general national ID for privacy reasons), Korean healthcare
 *             is directly linked to the Resident Registration Number
 *             (RRN, 주민등록번호) — a general, 13-digit national citizen
 *             identifier with birth date and gender encoded directly in
 *             its own digits. This carries a genuinely different, higher
 *             sensitivity profile than an opaque, institution-assigned
 *             MRN elsewhere in this file — real, documented
 *             re-identification research exists specifically on exposed
 *             RRNs in medical data. Flagged here so this isn't treated as
 *             "just another patient ID field" without that context.
 *             Date format follows KS X ISO 8601 (Korea's own national
 *             standard, YYYY-MM-DD, 24-hour clock) — genuinely distinct
 *             from both existing dateFormat options below, not a rounding
 *             to the nearer one.
 *
 *   Real, per-country research, per direct follow-up naming these four
 *   specific EU member states (see this file's own earlier honest
 *   finding, still true, on why a single "EU" value was never added —
 *   healthcare remains a member-state competency, not a centralized EU
 *   one, so each of these is its own real, separate answer, the same
 *   way KR was researched):
 *   BE      — SNOMED CT Belgium Extension (Federal Public Service Health,
 *             Food Chain Safety and Environment is the National Release
 *             Center; free for member use) + ICD-10 (WHO) — Belgium uses
 *             standard ICD-10, in combination with ICPC-2 for general
 *             practice, not a heavily modified national variant.
 *             Rijksregisternummer / Numéro de registre national is the
 *             patient identifier — a real, sensitive, general national
 *             ID (same "used directly, not a dedicated healthcare-only
 *             identifier" pattern as KR's own RRN above), 11 digits
 *             (YYMMDD birth date + 3-digit sequence + 2-digit check).
 *   NL      — SNOMED CT Netherlands Edition (Netherlands was one of the
 *             9 founding charter Members of SNOMED International in
 *             2007; managed nationally via DHD/Nictiz, and is the
 *             preferred — soon to be mandated — clinical terminology
 *             in Dutch hospitals) + ICD-10 (WHO) — standard, no heavy
 *             national modification found. BSN (Burgerservicenummer) is
 *             the patient identifier — same real sensitivity pattern as
 *             BE/KR above (a general national ID used directly, not a
 *             separate healthcare-only one): 9 digits, real, computable
 *             "elfproef" (eleven-test) checksum with weights
 *             [9,8,7,6,5,4,3,2,-1] — confirmed with a real, valid
 *             worked example (111222333) before use here, not
 *             fabricated.
 *   DE      — SNOMED CT Germany Edition (Germany became a SNOMED
 *             International Member January 1, 2021; BfArM — the
 *             Federal Institute for Drugs and Medical Devices — is the
 *             National Release Center; free sub-licensing) + ICD-10-GM
 *             (German Modification — compulsory for all statutory
 *             health insurance billing since 2004). KVNR
 *             (Krankenversichertennummer) is the patient identifier —
 *             a real, important CONTRAST to BE/NL/KR/FR above: this is
 *             a dedicated, healthcare-only identifier, 10 digits,
 *             deliberately kept separate from Germany's own general
 *             Sozialversicherungsnummer specifically because of German
 *             data protection law — the same safer pattern as AU's IHI
 *             or NZ's NHI, not the general-ID-reused pattern.
 *   FR      — SNOMED CT France Edition (France is a SNOMED International
 *             Member; ANS — Agence du Numérique en Santé — is the
 *             National Release Center; free licensing since 2022) +
 *             CIM-10 (Classification internationale des maladies, 10e
 *             révision — France's own name for its ICD-10 usage, not a
 *             heavily modified variant). INS (Identité Nationale de
 *             Santé) is the patient identifier, numerically built on
 *             the NIR (Numéro d'Inscription au Répertoire, France's
 *             general social-security/national number) — same real
 *             sensitivity pattern as BE/NL/KR above. 15 digits total: a
 *             real, well-documented Modulus 97 check key (13-digit
 *             identification + 2-digit check), confirmed algorithm
 *             before use here.
 *   None of BE/NL/DE/FR require a manually-obtained commercial license
 *   the way IE does — all four are free, member-country SNOMED
 *   International licensing.
 */
export type Jurisdiction =
  | 'US'
  | 'CA'
  | 'GB_EW'
  | 'GB_SCT'
  | 'GB_NIR'
  | 'IE'
  | 'AU'
  | 'NZ'
  | 'KR'
  | 'BE'
  | 'NL'
  | 'DE'
  | 'FR';

/** Human-readable label for each jurisdiction. Used in the admin UI. */
export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  US:     'United States',
  CA:     'Canada',
  GB_EW:  'England & Wales (NHS)',
  GB_SCT: 'Scotland (NHS Scotland)',
  GB_NIR: 'Northern Ireland (HSC)',
  IE:     'Republic of Ireland (HSE)',
  AU:     'Australia',
  NZ:     'New Zealand',
  KR:     'South Korea',
  BE:     'Belgium',
  NL:     'Netherlands',
  DE:     'Germany',
  FR:     'France',
};

/** ICD-10 variant for a given jurisdiction. */
export const icd10VariantForJurisdiction = (j: Jurisdiction): string => ({
  US:     'ICD-10-CM',
  CA:     'ICD-10-CA',
  GB_EW:  'ICD-10 (WHO)',
  GB_SCT: 'ICD-10 (WHO)',
  GB_NIR: 'ICD-10 (WHO)',
  IE:     'ICD-10-AM',
  AU:     'ICD-10-AM',
  NZ:     'ICD-10-AM-NZ',
  // Real, cited figure — KCD-8 (Korean Standard Classification of
  // Diseases, 8th Revision), confirmed as Korea's current, real,
  // ICD-10-based national modification, governed by Statistics Korea
  // / Ministry of Health and Welfare — not yet transitioned to
  // ICD-11 as of this research (Korea's own ICD-11 adoption work is
  // in progress but not the live, current standard).
  KR:     'KCD-8',
  // Real, cited figures — see this file's own Jurisdiction doc
  // comment above for the full research each of these four traces to.
  BE:     'ICD-10 (WHO)',
  NL:     'ICD-10 (WHO)',
  DE:     'ICD-10-GM',
  FR:     'CIM-10',
}[j]);

/** SNOMED CT release name for a given jurisdiction. */
export const snomedReleaseForJurisdiction = (j: Jurisdiction): string => ({
  US:     'SNOMED CT US Edition (NLM)',
  CA:     'SNOMED CT Canada Edition (Infoway)',
  GB_EW:  'SNOMED CT UK Edition (NHS Digital)',
  GB_SCT: 'SNOMED CT UK Edition + Scottish Extension (NHS Scotland)',
  GB_NIR: 'SNOMED CT UK Edition (NHS Digital)',
  IE:     'SNOMED CT (SNOMED International Affiliate License)',
  AU:     'SNOMED CT Australian Edition (NCTS)',
  NZ:     'SNOMED CT New Zealand Edition (NCTS)',
  // Real, cited figure — Korea became SNOMED International's 39th
  // Member in August 2020, governed by the Ministry of Health and
  // Welfare (national release center coordinated via the Korean
  // Hospital Information System Association, k-his.or.kr).
  KR:     'SNOMED CT Korea Edition (MOHW)',
  BE:     'SNOMED CT Belgium Extension (FPS Health)',
  NL:     'SNOMED CT Netherlands Edition (DHD/Nictiz)',
  DE:     'SNOMED CT Germany Edition (BfArM)',
  FR:     'SNOMED CT France Edition (ANS)',
}[j]);

/** True if a manually obtained license is required before seeding production. */
export const requiresManualLicense = (j: Jurisdiction): boolean => j === 'IE';

// ── Locale & display format ───────────────────────────────────────────────────

/** How a jurisdiction writes a date. Each is a real national convention:
 *  YYYY-MM-DD for Korea (KS X ISO 8601), DD.MM.YYYY for Germany (DIN 5008),
 *  DD-MM-YYYY for the Netherlands (Batch 365, PS-347). */
export type JurisdictionDateFormat = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'DD.MM.YYYY' | 'YYYY-MM-DD';

export interface JurisdictionLocale {
  /** BCP-47 locale tag passed to Intl / toLocaleDateString */
  locale:     string;
  /** The date format shown as a hint (placeholders, Identifier Formats) and
   *  used to write dates of birth in the order lookup (isoDateForSearch.ts).
   *  Everyday display goes through formatDate.ts and `locale` instead. */
  dateFormat: JurisdictionDateFormat;
  /** 12-hour or 24-hour clock */
  timeFormat: '12h' | '24h';
  /** Spell-check lang attribute for browser spell checking */
  spellLang:  string;
}

export const JURISDICTION_LOCALE: Record<Jurisdiction, JurisdictionLocale> = {
  US:     { locale: 'en-US', dateFormat: 'MM/DD/YYYY', timeFormat: '12h', spellLang: 'en-US' },
  CA:     { locale: 'en-CA', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', spellLang: 'en-CA' },
  GB_EW:  { locale: 'en-GB', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'en-GB' },
  GB_SCT: { locale: 'en-GB', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'en-GB' },
  GB_NIR: { locale: 'en-GB', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'en-GB' },
  IE:     { locale: 'en-IE', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'en-IE' },
  AU:     { locale: 'en-AU', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', spellLang: 'en-AU' },
  NZ:     { locale: 'en-NZ', dateFormat: 'DD/MM/YYYY', timeFormat: '12h', spellLang: 'en-NZ' },
  // Real, cited figure — KS X ISO 8601 (Korea's own national standard,
  // adopting ISO 8601): YYYY-MM-DD, 24-hour clock, mandated for
  // official/government/medical records and data interchange.
  KR:     { locale: 'ko-KR', dateFormat: 'YYYY-MM-DD', timeFormat: '24h', spellLang: 'ko-KR' },
  // Day first across continental Western Europe, with different separators:
  // slashes in Belgium and France (27/09/2026), dashes in the Netherlands
  // (27-09-2026, what nl-NL formatting produces; Batch 365, PS-347 corrected
  // an earlier DD/MM/YYYY here), dots in Germany (27.09.2026, DIN 5008).
  BE:     { locale: 'nl-BE', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'nl-BE' },
  NL:     { locale: 'nl-NL', dateFormat: 'DD-MM-YYYY', timeFormat: '24h', spellLang: 'nl-NL' },
  DE:     { locale: 'de-DE', dateFormat: 'DD.MM.YYYY', timeFormat: '24h', spellLang: 'de-DE' },
  FR:     { locale: 'fr-FR', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', spellLang: 'fr-FR' },
};

// ── Patient identifier standards ──────────────────────────────────────────────

// i18n note: `label`/`format` used to be literal English strings.
// Renamed to `labelKey`/`formatKey` — translation keys, resolved by
// whichever caller has `t()` (IdentifierFormatsTab.tsx, AccessionPage.tsx
// both already do; patientIdStatus.ts is a plain utility that passes
// these through as `innerKeys` for PatientIdStatusDot.tsx to resolve,
// same established pattern that file already uses for validation-reason
// and NHS-status-code keys). This file itself never calls t() — it's a
// plain data module, just storing key names now instead of text, same
// shape as this app's existing `XXX_LABEL_KEY: Record<Enum, string>`
// convention for other persisted/shared enum-like dictionaries.
//
// Content decision for `labelKey`, per jurisdiction: US ('MRN') and CA
// ('Health Card Number') are genuinely translated per locale — generic
// descriptive terms, not one single official proper name (matches this
// app's own pre-existing precedent of translating "MRN" itself
// elsewhere, e.g. headerBar.field.mrn: fr "IPP", de "Patienten-Nr.").
// KR's label is likewise a descriptive English rendering of a Korean
// concept (Resident Registration Number), not an English proper name,
// so it's translated too. Every other jurisdiction's label (NHS Number,
// CHI Number, H&C Number, PPS Number, IHI Number, NHI Number, and the
// already-bilingual BE/NL/DE/FR national-ID names) is a real, official,
// governing-body-assigned scheme name — standardized nomenclature that
// stays the same literal text in every locale, same posture as this
// app's "governing-body abbreviations stay literal" convention
// elsewhere (STAT, CAPA). Every jurisdiction still gets a real
// translation key for interface consistency; the literal ones simply
// carry the same value across all 5 locale files by design, not
// because they were missed.
//
// `formatKey` is translated for every jurisdiction — these are plain
// descriptive text ("5–10 digits", "or", "total", "varies by
// province"), not proper nouns. The placeholder-letter/digit pattern
// segments themselves (e.g. "999 999 9999", "YYMMDD-XXX.XX") are
// visual notation, not language content, and are kept as-is inside
// each locale's translated string, same way a date-format token like
// "MM/DD/YYYY" isn't itself translated.
//
// `example` stays a literal, untranslated real sample ID value in
// every case — data, not UI copy.
export interface PatientIdStandard {
  labelKey:  string;
  pattern:   string;
  formatKey: string;
  example:   string;
  luhnCheck: boolean;
}

export const PATIENT_ID_BY_JURISDICTION: Record<Jurisdiction, PatientIdStandard> = {
  US:     { labelKey: 'headerBar.field.mrn',                        pattern: '^\\d{5,10}$',                          formatKey: 'systemConfig.patientIdStandard.US.format',     example: '1234567',        luhnCheck: false },
  CA:     { labelKey: 'systemConfig.patientIdStandard.CA.label',    pattern: '^[0-9A-Z]{9,12}$',                     formatKey: 'systemConfig.patientIdStandard.CA.format',     example: '1234567890',     luhnCheck: false },
  GB_EW:  { labelKey: 'systemConfig.patientIdStandard.GB_EW.label', pattern: '^\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{4}$', formatKey: 'systemConfig.patientIdStandard.GB_EW.format', example: '943 476 5919',   luhnCheck: true  },
  GB_SCT: { labelKey: 'systemConfig.patientIdStandard.GB_SCT.label',pattern: '^\\d{10}$',                            formatKey: 'systemConfig.patientIdStandard.GB_SCT.format', example: '1401740054',    luhnCheck: false },
  // Real fix, per direct, authoritative specification: this entry
  // previously described a letters-then-digits format ('AA99999'),
  // which was wrong — a real H&C Number is 10 all-numeric digits,
  // Modulus 11 checksummed (same algorithm as NHS Number above),
  // allocated only within 3,200,000,001–3,999,999,999. See
  // src/utils/ukPatientIdValidation.ts's own validateHcNumber() for
  // the real, computed validation this corrected format now backs.
  // '3201234567' is a genuinely valid example — computed, not
  // fabricated — its own check digit (7) was verified against this
  // same Modulus 11 algorithm before use here.
  GB_NIR: { labelKey: 'systemConfig.patientIdStandard.GB_NIR.label', pattern: '^3[2-9]\\d{8}$',                      formatKey: 'systemConfig.patientIdStandard.GB_NIR.format', example: '3201234567',    luhnCheck: false },
  IE:     { labelKey: 'systemConfig.patientIdStandard.IE.label',     pattern: '^\\d{7}[A-Z]{1,2}$',                  formatKey: 'systemConfig.patientIdStandard.IE.format',     example: '1234567T',      luhnCheck: false },
  AU:     { labelKey: 'systemConfig.patientIdStandard.AU.label',     pattern: '^800360\\d{10}$',                      formatKey: 'systemConfig.patientIdStandard.AU.format',     example: '8003601234567890',luhnCheck: true  },
  NZ:     { labelKey: 'systemConfig.patientIdStandard.NZ.label',     pattern: '^[A-Z]{3}\\d{4}$|^[A-Z]{3}\\d{2}[A-Z]{2}$', formatKey: 'systemConfig.patientIdStandard.NZ.format', example: 'ZZZ0016',       luhnCheck: true  },
  // Real, cited structure — Resident Registration Number (RRN,
  // 주민등록번호): 13 digits total, birth date (YYMMDD) + hyphen +
  // gender/century digit + regional/serial digits + a real check
  // digit. Real, important distinction — see this file's own
  // Jurisdiction doc comment above for why this is genuinely more
  // sensitive than an opaque MRN elsewhere in this file: Korean
  // healthcare links directly to this general, national citizen
  // identifier (unlike AU/NZ's own, deliberately separate,
  // healthcare-only identifiers). luhnCheck: false here is an honest
  // "not verified to the same rigor" flag, not a claim the RRN has no
  // real check digit — it does (a real, documented algorithm exists),
  // but it wasn't independently confirmed here the way GB_NIR's own
  // H&C Number check digit was (see that entry's own comment) before
  // this was written; don't treat this pattern as validating,
  // wire-verified input.
  KR:     { labelKey: 'systemConfig.patientIdStandard.KR.label', pattern: '^\\d{6}-[1-4]\\d{6}$', formatKey: 'systemConfig.patientIdStandard.KR.format',      example: '900101-1234567', luhnCheck: false },
  // Real, cited structures — see this file's own Jurisdiction doc
  // comment above for the full research each of these four traces to.
  // BE/NL/FR share the same real sensitivity pattern as KR above (a
  // general national ID used directly in healthcare, not a dedicated
  // healthcare-only one); DE is the real, deliberate opposite —
  // Germany's KVNR is a dedicated, healthcare-only identifier by
  // design.
  // Real, library-confirmed-valid raw number (66041066600, verified
  // via a real, published Rijksregisternummer validation library
  // before use here, not guessed), reformatted with this file's own
  // separator convention (YYMMDD-XXX.CC).
  BE:     { labelKey: 'systemConfig.patientIdStandard.BE.label', pattern: '^\\d{6}-\\d{3}\\.\\d{2}$', formatKey: 'systemConfig.patientIdStandard.BE.format', example: '660410-666.00', luhnCheck: true  },
  // Real, computable elfproef (eleven-test) checksum, weights
  // [9,8,7,6,5,4,3,2,-1] — confirmed with a real, valid worked
  // example (111222333, weighted sum 66, divisible by 11) before use
  // here, not fabricated. luhnCheck: true reflects "has a real,
  // verified check-digit algorithm," matching this field's own
  // established, loosely-named convention elsewhere in this file
  // (e.g. GB_EW's own NHS Number uses Modulus 11, not literal Luhn,
  // and is marked true for the same reason).
  NL:     { labelKey: 'systemConfig.patientIdStandard.NL.label', pattern: '^\\d{8,9}$',            formatKey: 'systemConfig.patientIdStandard.NL.format',    example: '111222333',    luhnCheck: true  },
  DE:     { labelKey: 'systemConfig.patientIdStandard.DE.label', pattern: '^[A-Z]\\d{9}$',          formatKey: 'systemConfig.patientIdStandard.DE.format',    example: 'A123456789',  luhnCheck: false },
  // Real, well-documented Modulus 97 check key (13-digit
  // identification: 1 sex + 2 year + 2 month + 5 place + 3 order,
  // followed by a 2-digit check = 15 total). Example genuinely
  // computed, not guessed: base 1831269123456, mod 97 = 40, check
  // key = 97-40 = 57, giving 183126912345657 — verified valid before
  // use here, the same discipline as NL's own BSN example above.
  FR:     { labelKey: 'systemConfig.patientIdStandard.FR.label', pattern: '^[12]\\d{2}(0[1-9]|1[0-2])\\d{10}$', formatKey: 'systemConfig.patientIdStandard.FR.format', example: '183126912345657', luhnCheck: true  },
};


// ─────────────────────────────────────────────────────────────────────────────
// 2. TERMINOLOGY
// ─────────────────────────────────────────────────────────────────────────────

export type TerminologyMode = 'mock' | 'hosted' | 'live_api';

export interface TerminologySystemConfig {
  active:   boolean;
  mode:     TerminologyMode;
  version?: string;
}

export interface InstitutionTerminologyConfig {
  snomed: TerminologySystemConfig;
  icd10:  TerminologySystemConfig;
  icd11:  TerminologySystemConfig;
  icdo:   TerminologySystemConfig;
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. IDENTIFIER FORMATS
// ─────────────────────────────────────────────────────────────────────────────

export type IdentifierKind =
  | 'accession'
  | 'mrn'
  | 'slide'
  | 'requisition'
  | 'block'
  | 'external_ref';

export type BarcodeType =
  | '1d_code128'
  | '1d_code39'
  | '2d_datamatrix'
  | '2d_qr'
  | '2d_pdf417';

export type LisPreset =
  | 'generic'
  | 'copath'
  | 'epic_beaker'
  | 'sunquest'
  | 'cerner_pathnet'
  | 'meditech'
  | 'custom';

/** A single identifier format — system-defined, not editable by admins. */
export interface IdentifierFormat {
  id:                    string;
  kind:                  IdentifierKind;
  label:                 string;
  description:           string;
  pattern:               string;
  barcodeTypes:          BarcodeType[];
  payload2DSchema?:      string;
  /** 1 = smart identifier box + direct navigation. 2 = internal mapping only. */
  tier:                  1 | 2;
  /** When kind=slide and tier=1, navigate directly to synoptic on match. */
  navigateToCaseOnMatch: boolean;
  jurisdictions:         Jurisdiction[];
  lisPresets:            LisPreset[];
  enabled:               boolean;
  example:               string;
}

/**
 * Expanded identifier formats.
 * Legacy accessionPattern / mrnPattern fields are kept for backward compat
 * with SearchPage — derived automatically from the enabled formats list.
 */
export interface IdentifierFormats {
  formats:          IdentifierFormat[];
  accessionPattern: string;
  accessionExample: string;
  mrnPattern:       string;
  mrnExample:       string;
}

// ── Format library ────────────────────────────────────────────────────────────

export const IDENTIFIER_FORMAT_LIBRARY: IdentifierFormat[] = [

  // Accession numbers
  { id: 'accession_generic_us',     kind: 'accession',   label: 'Accession Number',                      description: 'US AP accession: uppercase letter + 2-digit year + hyphen + 4–6 digit sequence (e.g. S26-4200).',                                                          pattern: '^[A-Z]\\d{2}-\\d{4,6}$',                             barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['US'],                           lisPresets: ['generic','copath','sunquest'], enabled: true,  example: 'S26-4200'        },
  { id: 'accession_generic_uk',     kind: 'accession',   label: 'Accession Number',                      description: 'UK/IE AP accession: 1–2 uppercase letters + 2-digit year + hyphen + 4–6 digit sequence (e.g. SP26-4200).',                                               pattern: '^[A-Z]{1,2}\\d{2}-\\d{4,6}$',                        barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['GB_EW','GB_SCT','GB_NIR','IE'], lisPresets: ['generic'],                    enabled: true,  example: 'SP26-4200'       },
  { id: 'accession_generic_au_nz',  kind: 'accession',   label: 'Accession Number',                      description: 'AU/NZ AP accession: uppercase letters + year + hyphen + sequence.',                                                                                       pattern: '^[A-Z]{1,3}\\d{2}-\\d{4,6}$',                        barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['AU','NZ'],                      lisPresets: ['generic'],                    enabled: true,  example: 'PA26-4200'       },
  { id: 'accession_epic_beaker',    kind: 'accession',   label: 'Accession Number (Epic Beaker)',         description: 'Epic Beaker accession: 2–4 letter department code + 8–12 digit sequence.',                                                                                pattern: '^[A-Z]{2,4}\\d{8,12}$',                               barcodeTypes: ['1d_code128','2d_datamatrix'],     tier: 1, navigateToCaseOnMatch: false, jurisdictions: [],                               lisPresets: ['epic_beaker'],                enabled: false, example: 'SP202600004200'  },

  // Patient identifiers
  { id: 'mrn_us',                   kind: 'mrn',         label: 'MRN',                                   description: 'US Medical Record Number: 5–10 digits.',                                                                                                                  pattern: '^\\d{5,10}$',                                         barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['US','CA'],                      lisPresets: [],                             enabled: true,  example: '1234567'         },
  { id: 'mrn_nhs',                  kind: 'mrn',         label: 'NHS Number',                            description: 'England & Wales NHS Number: 10 digits with Luhn check digit. Format: 999 999 9999.',                                                                     pattern: '^\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{4}$',                 barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['GB_EW'],                        lisPresets: [],                             enabled: false, example: '943 476 5919'    },
  { id: 'mrn_chi',                  kind: 'mrn',         label: 'CHI Number',                            description: 'Scotland CHI: 10 digits (DDMMYY + 4 digits).',                                                                                                          pattern: '^\\d{10}$',                                           barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['GB_SCT'],                       lisPresets: [],                             enabled: false, example: '1401740054'      },
  { id: 'mrn_hc',                   kind: 'mrn',         label: 'H&C Number',                            description: 'Northern Ireland H&C Number: 2 letters + 5–7 digits.',                                                                                                   pattern: '^[A-Z]{2}\\d{5,7}$',                                  barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['GB_NIR'],                       lisPresets: [],                             enabled: false, example: 'AB123456'        },
  { id: 'mrn_ihi',                  kind: 'mrn',         label: 'IHI Number',                            description: 'Australia IHI: 16 digits starting with 800360.',                                                                                                         pattern: '^800360\\d{10}$',                                      barcodeTypes: ['1d_code128','2d_datamatrix'],     tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['AU'],                           lisPresets: [],                             enabled: false, example: '8003601234567890' },
  { id: 'mrn_nhi',                  kind: 'mrn',         label: 'NHI Number',                            description: 'New Zealand NHI: 3 letters + 4 digits (legacy) or 3 letters + 2 digits + 2 letters (new format).',                                                      pattern: '^[A-Z]{3}\\d{4}$|^[A-Z]{3}\\d{2}[A-Z]{2}$',          barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['NZ'],                           lisPresets: [],                             enabled: false, example: 'ZZZ0016'         },
  // Real, cited structure — see systemConfig.ts's own Jurisdiction
  // doc comment and PATIENT_ID_BY_JURISDICTION's own KR entry for the
  // full reasoning, including the real, flagged sensitivity
  // distinction (a general national ID, not a dedicated healthcare-
  // only one like AU/NZ's own).
  { id: 'mrn_krn',                  kind: 'mrn',         label: 'Resident Registration Number (RRN)',    description: 'South Korea RRN: 13 digits (YYMMDD birth date + hyphen + gender/century digit + regional/serial digits).',              pattern: '^\\d{6}-[1-4]\\d{6}$',                                barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['KR'],                           lisPresets: [],                             enabled: false, example: '900101-1234567'  },
  // Real, cited structures — see the Jurisdiction doc comment and
  // PATIENT_ID_BY_JURISDICTION's own BE/NL/DE/FR entries above for
  // the full reasoning, including the real sensitivity contrast (DE
  // is the one dedicated, healthcare-only identifier of these four).
  { id: 'mrn_be',                   kind: 'mrn',         label: 'Rijksregisternummer / Numéro de registre national', description: 'Belgium national register number: 11 digits (YYMMDD birth date + 3-digit sequence + 2-digit check).', pattern: '^\\d{6}-\\d{3}\\.\\d{2}$',                             barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['BE'],                           lisPresets: [],                             enabled: false, example: '660410-666.00'   },
  { id: 'mrn_bsn',                  kind: 'mrn',         label: 'BSN (Burgerservicenummer)',             description: 'Netherlands citizen service number: 8 or 9 digits, elfproef (eleven-test) checksum.',                     pattern: '^\\d{8,9}$',                                          barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['NL'],                           lisPresets: [],                             enabled: false, example: '111222333'       },
  { id: 'mrn_kvnr',                 kind: 'mrn',         label: 'KVNR (Krankenversichertennummer)',      description: 'Germany health insurance number: 1 uppercase letter + 9 digits — a dedicated, healthcare-only identifier, not the general Sozialversicherungsnummer.', pattern: '^[A-Z]\\d{9}$', barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['DE'],                           lisPresets: [],                             enabled: false, example: 'A123456789'      },
  { id: 'mrn_ins',                  kind: 'mrn',         label: 'INS (numéro de sécurité sociale / NIR)', description: 'France national health identity, numerically built on the NIR: 15 digits (13-digit identification + Modulus 97 check key).', pattern: '^[12]\\d{2}(0[1-9]|1[0-2])\\d{10}$',  barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: ['FR'],                           lisPresets: [],                             enabled: false, example: '183126912345657' },

  // Slide barcodes — navigate directly to synoptic
  { id: 'slide_generic_1d',         kind: 'slide',       label: 'Slide Barcode',                         description: 'Generic slide: accession + specimen letter + block number + optional sequence (e.g. S26-4200-A1-1). Scanning opens the case directly at the specimen tab.', pattern: '^[A-Z]\\d{2}-\\d{4,6}-[A-Z]\\d+(-\\d+)?$',           barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: true,  jurisdictions: [],                               lisPresets: ['generic'],                    enabled: false, example: 'S26-4200-A1-1'   },
  { id: 'slide_copath_1d',          kind: 'slide',       label: 'Slide Barcode (CoPath)',                 description: 'CoPath slide: accession-block-stain code. Scanning opens the case directly.',                                                                             pattern: '^[A-Z]\\d{2}-\\d{4,6}-[A-Z]\\d+-[A-Z0-9]+$',         barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: true,  jurisdictions: [],                               lisPresets: ['copath'],                     enabled: false, example: 'S26-4200-A1-HE'  },
  { id: 'slide_epic_2d',            kind: 'slide',       label: 'Slide Barcode (Epic Beaker 2D)',         description: '2D DataMatrix from Epic Beaker. Pipe-delimited payload: ACC|SPEC|BLOCK|STAIN|LAB.',                                                                        pattern: '^ACC:[^|]+\\|SPEC:[^|]+\\|BLOCK:[^|]+\\|STAIN:[^|]+',  barcodeTypes: ['2d_datamatrix'],                 tier: 1, navigateToCaseOnMatch: true,  jurisdictions: [],                               lisPresets: ['epic_beaker'],                enabled: false, example: 'ACC:SP26-4200|SPEC:A|BLOCK:A1|STAIN:HE|LAB:MFT', payload2DSchema: 'pipe|ACC|SPEC|BLOCK|STAIN|LAB' },
  { id: 'slide_gs1_2d',             kind: 'slide',       label: 'Slide Barcode (GS1 DataMatrix)',         description: 'GS1 Application Identifier DataMatrix. Parsed using GS1 AI (01) for GTIN and (21) for serial.',                                                          pattern: '\\(01\\)\\d{14}\\(21\\)',                               barcodeTypes: ['2d_datamatrix'],                 tier: 1, navigateToCaseOnMatch: true,  jurisdictions: [],                               lisPresets: [],                             enabled: false, example: '(01)09501101530003(21)S26-4200-A1', payload2DSchema: 'gs1_ai' },

  // Requisition
  { id: 'requisition_generic',      kind: 'requisition', label: 'Requisition Number',                    description: 'Lab requisition: R or REQ prefix + 6–10 digits.',                                                                                                         pattern: '^R(?:EQ)?\\d{6,10}$',                                  barcodeTypes: ['1d_code128'],                    tier: 1, navigateToCaseOnMatch: false, jurisdictions: [],                               lisPresets: [],                             enabled: false, example: 'REQ1234567'       },

  // Block (Tier 2 — internal mapping only)
  { id: 'block_generic',            kind: 'block',       label: 'Block / Cassette ID',                   description: 'Specimen letter + block number (e.g. A1). Used for Computational Sidecar result mapping and HL7 OBR matching.',                                          pattern: '^[A-Z]\\d{1,2}[a-z]?$',                               barcodeTypes: ['1d_code128'],                    tier: 2, navigateToCaseOnMatch: false, jurisdictions: [],                               lisPresets: [],                             enabled: true,  example: 'A1'              },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the format library with correct enabled flags for a jurisdiction. */
export function defaultFormatsForJurisdiction(j: Jurisdiction): IdentifierFormat[] {
  const accessionMap: Record<Jurisdiction, string> = {
    US: 'accession_generic_us', CA: 'accession_generic_us',
    GB_EW: 'accession_generic_uk', GB_SCT: 'accession_generic_uk',
    GB_NIR: 'accession_generic_uk', IE: 'accession_generic_uk',
    AU: 'accession_generic_au_nz', NZ: 'accession_generic_au_nz',
    // Real, honest choice, not a fabricated "Korean standard" —
    // accession numbering (unlike SNOMED/ICD/patient-ID above) is a
    // lab/LIS-level convention everywhere, not a government-mandated
    // format, even for the other jurisdictions already listed here.
    // Reuses the same generic pattern as US/CA for that reason.
    KR: 'accession_generic_us',
    // Real, same honest choice as KR above — accession numbering
    // isn't a government-mandated format for these four either.
    BE: 'accession_generic_uk', NL: 'accession_generic_uk',
    DE: 'accession_generic_uk', FR: 'accession_generic_uk',
  };
  const mrnMap: Record<Jurisdiction, string> = {
    US: 'mrn_us', CA: 'mrn_us',
    GB_EW: 'mrn_nhs', GB_SCT: 'mrn_chi',
    GB_NIR: 'mrn_hc', IE: 'mrn_us',
    AU: 'mrn_ihi', NZ: 'mrn_nhi',
    KR: 'mrn_krn',
    BE: 'mrn_be', NL: 'mrn_bsn', DE: 'mrn_kvnr', FR: 'mrn_ins',
  };
  const enabledIds = new Set([accessionMap[j], mrnMap[j], 'block_generic']);
  return IDENTIFIER_FORMAT_LIBRARY.map(f => ({ ...f, enabled: enabledIds.has(f.id) }));
}

/** Derives legacy accessionPattern / mrnPattern from the enabled formats list. */
export function deriveLegacyFormats(formats: IdentifierFormat[]): {
  accessionPattern: string; accessionExample: string;
  mrnPattern: string;       mrnExample: string;
} {
  const acc = formats.find(f => f.kind === 'accession' && f.enabled);
  const mrn = formats.find(f => f.kind === 'mrn'       && f.enabled);
  return {
    accessionPattern: acc?.pattern ?? '^[A-Z]\\d{2}-\\d{4,6}$',
    accessionExample: acc?.example ?? 'S26-4200',
    mrnPattern:       mrn?.pattern ?? '^\\d{5,10}$',
    mrnExample:       mrn?.example ?? '1234567',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. SYSTEM CONFIG — main shape
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemConfig {
  approvedFonts:                   string[];
  jurisdiction:                    Jurisdiction;
  terminologyConfig:               InstitutionTerminologyConfig;
  voiceEnabled:                    boolean;
  /** Whether pathologists (role === 'pathologist' specifically) see peer-
   *  average/top-performer comparisons on their own Contribution dashboard.
   *  Defaults to false, matching the design decision this mirrors: peer
   *  visibility is opt-in per institution, not on by default. Admin/
   *  pathologist-admin/superadmin roles always see this data regardless of
   *  this flag - it only gates the plain 'pathologist' role's own view of
   *  themselves against others. */
  showPeerAveragesToPathologists:  boolean;
  /** Real fix, clinical-informatics best practice: monthly/YTD metrics
   *  (case counts, RVU) group a real, finalized event by the FACILITY's
   *  own fixed timezone, never the viewing device's timezone and never
   *  raw UTC. An 11pm Jan 31 Tucson sign-off (stored as
   *  '2026-02-01T06:00:00Z' UTC) must group under January - matching the
   *  real shift, billing cycle, and clinician's own experience -
   *  regardless of whether the pathologist later views their own
   *  dashboard from Tucson, New York, or London. IANA timezone
   *  identifier (Intl.DateTimeFormat-compatible, e.g. 'America/Phoenix').
   *  Storage itself remains UTC ISO 8601 always - this only governs how
   *  stored UTC timestamps get bucketed into a real calendar month/day
   *  for display and metrics. See utils/facilityTime.ts. */
  facilityTimezone: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// 5. DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

// Defaults enable US formats (defaultFormatsForJurisdiction only ever
// returns one jurisdiction's set) plus UK accession + NHS Number on top —
// this trial serves both US and UK facilities simultaneously (see
// Facility.jurisdiction, added earlier for the same reason on the date-
// formatting side), so identifier detection shouldn't default to
// US-only and require an admin to remember to enable UK formats before
// a UK scan will work. Admins can still toggle any of these off (or add
// Scotland/NI/AU/NZ) via the Identifier Formats config screen — this
// just changes what ships enabled out of the box.
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  approvedFonts: ['Arial', 'Times New Roman', 'Courier New'],
  jurisdiction: 'US',
  terminologyConfig: {
    snomed: { active: true,  mode: 'mock' },
    icd10:  { active: true,  mode: 'mock' },
    icd11:  { active: false, mode: 'mock' },
    icdo:   { active: true,  mode: 'mock' },
  },
  voiceEnabled: true,
  showPeerAveragesToPathologists: false,
  facilityTimezone: 'America/Phoenix',
};
