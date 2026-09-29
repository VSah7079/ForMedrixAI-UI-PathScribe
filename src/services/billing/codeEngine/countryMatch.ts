// src/services/billing/codeEngine/countryMatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 §8 (Batch 333): does a billing rule's country apply to the country
// being billed? Country is the jurisdiction dimension (vocabulary is the
// coding standard; the two are orthogonal).
//
// The app's country codes aren't uniform: Organisation.country uses 'UK'
// and 'EU' (organisationService.ts), while the Billing Dictionary offers
// ISO codes for the 27 EU member states. So:
//   • no country on the rule, or none requested → applies;
//   • 'GB' and 'UK' are the same;
//   • an 'EU' organisation matches a rule for any EU member state (and an
//     'EU' rule matches any member state).
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

export const EU_MEMBER_STATES: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

const normalize = (c: string) => {
  const u = c.trim().toUpperCase();
  return u === 'GB' ? 'UK' : u;
};

export function ruleMatchesCountry(ruleCountry: string | undefined, requestedCountry: string | undefined): boolean {
  if (!ruleCountry?.trim() || !requestedCountry?.trim()) return true;
  const rule = normalize(ruleCountry);
  const want = normalize(requestedCountry);
  if (rule === want) return true;
  if (want === 'EU') return EU_MEMBER_STATES.includes(rule);
  if (rule === 'EU') return EU_MEMBER_STATES.includes(want);
  return false;
}
