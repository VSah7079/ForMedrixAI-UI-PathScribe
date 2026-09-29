// src/services/autopsy/resolveForensicSignOutAuthority.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-327 (Batch 331), per Pete: forensic (medicolegal) autopsies run under
// statutory authority, so sign-out can't rest on hospital lab credentials
// alone. Signing a forensic case's PAD or FAD also requires an ACTIVE
// jurisdictional appointment — a provider credential that normalizes to
// FORENSIC_AUTOPSY_SIGNOUT, issued for the case's own jurisdiction and
// inside its effective/expiry window.
//
// This is in addition to the per-lab / country signing authority every
// autopsy gets (canFinalizeCase), and it has no administrator override:
// an admin account can't sign a forensic report unless it is appointed.
//
// Hospital-consented autopsies are not affected.
//
// Scope: jurisdictions are country-level (US, GB_EW, CA, …), so this
// stops cross-country sign-out. Sub-national appointments (a US county
// medical examiner's office, a coroner's area) would need a region on
// both the case and the credential — not modelled yet.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderCredential } from '@/types/staff/ProviderCredential';
import type { Jurisdiction } from '@/types/systemConfig';
import type { AutopsyCaseAuthority } from '@/types/autopsy/AutopsyCaseDetails';
import { FORENSIC_AUTOPSY_SIGNOUT, resolveNormalizedCredentialCapabilities } from '@/services/staff/resolveNormalizedCredentialCapabilities';

export type ForensicSignOutDecision =
  | { required: false; allowed: true }
  | { required: true; allowed: boolean };

export function resolveForensicSignOutAuthority(input: {
  caseAuthority: AutopsyCaseAuthority | undefined;
  jurisdiction: Jurisdiction | undefined;
  signerCredentials: ProviderCredential[] | undefined;
  /** YYYY-MM-DD, compared with the credential's effective/expiry dates. */
  asOfDate: string;
}): ForensicSignOutDecision {
  if (input.caseAuthority !== 'medicolegal_forensic') return { required: false, allowed: true };
  // A forensic case with no jurisdiction can't be matched to any
  // appointment: refuse rather than guess.
  if (!input.jurisdiction) return { required: true, allowed: false };
  const capabilities = resolveNormalizedCredentialCapabilities(input.signerCredentials, input.jurisdiction, input.asOfDate);
  return { required: true, allowed: capabilities.includes(FORENSIC_AUTOPSY_SIGNOUT) };
}
