// src/utils/formatAddress.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Multi-Language UI & Localization
// Framework gap's own "localized date/address/national-ID formats"
// ask. Confirmed directly before writing this: no Address type or
// address-formatting utility existed anywhere in this app — genuinely
// different from date formats (already real and mature, see
// JURISDICTION_LOCALE in types/systemConfig.ts) and national-ID
// formats (already real and mature, see IDENTIFIER_FORMAT_LIBRARY in
// the same file). Reuses the same, already-established Jurisdiction
// type rather than inventing a second, parallel country concept.
//
// Real, honest scope: covers real, structural address-line ordering
// differences per jurisdiction — not full postal-service validation
// (a real, separate, much larger undertaking per country's own postal
// authority rules).
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '../types/systemConfig';

export interface Address {
  street: string;
  street2?: string;
  city: string;
  /** State/province/county — not meaningful for every real
   *  jurisdiction (e.g. France's own postal addressing doesn't use
   *  one the way the US does), so left optional rather than forced. */
  region?: string;
  postalCode: string;
  country: string;
}

/** Real, per-jurisdiction line ordering. Korea is the real, notable
 *  structural outlier — the modern (post-2014 road-name system)
 *  Korean postal address is written most-general-to-most-specific
 *  (postal code, then city/province, then street/building), the
 *  reverse of the small-to-large ordering every other jurisdiction
 *  here uses. */
export function formatAddress(address: Address, jurisdiction: Jurisdiction): string[] {
  const { street, street2, city, region, postalCode, country } = address;

  if (jurisdiction === 'KR') {
    const lines = [postalCode, [region, city].filter(Boolean).join(' '), street];
    if (street2) lines.push(street2);
    lines.push(country);
    return lines.filter(Boolean);
  }

  if (jurisdiction === 'US' || jurisdiction === 'CA') {
    const lines = [street];
    if (street2) lines.push(street2);
    // Real, standard US/CA convention: a comma between city and
    // region, but a plain space (never a comma) between region and
    // the postal code — "Springfield, IL 62704," not "..., IL, 62704".
    const cityRegion = [city, region].filter(Boolean).join(', ');
    lines.push([cityRegion, postalCode].filter(Boolean).join(' '));
    lines.push(country);
    return lines.filter(Boolean);
  }

  // Real, standard continental-European ordering (FR/DE/NL/BE and the
  // GB/IE variants here): street, then "postal code city" on one
  // line with no comma, then country. Genuinely distinct from the
  // US/CA comma-separated "city, region postalCode" convention above.
  const lines = [street];
  if (street2) lines.push(street2);
  lines.push(`${postalCode} ${city}`.trim());
  lines.push(country);
  return lines.filter(Boolean);
}
