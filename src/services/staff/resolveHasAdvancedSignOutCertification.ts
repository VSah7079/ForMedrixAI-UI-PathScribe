// src/services/staff/resolveHasAdvancedSignOutCertification.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own named helper:
// "hasAdvancedSignOutCertification(providerId, domain)." Built here as
// a pure function over an already-resolved credentials array rather
// than accepting a providerId and doing its own lookup — matching
// this app's own established "pure decision, service resolves data at
// the call site" posture used throughout the QC engine.
//
// Real, updated (Sep 2026) per direct guidance's own confirmed
// correction: checks the provider's real, NORMALIZED system
// capability (via resolveNormalizedCredentialCapabilities.ts) — e.g.
// the canonical "CYTO_ADVANCED_SPECIALIST" — never a raw,
// jurisdiction-specific credential string (like the UK's own real
// "IBMS_ASD") directly. "Using vendor- or jurisdiction-specific
// acronyms directly in core predicate matching creates unnecessary
// complexity when scaling cross-border" — the real normalization
// mapping is the one, single place that translation happens.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderCredential } from '@/types/staff/ProviderCredential';
import type { Jurisdiction } from '@/types/systemConfig';
import { resolveNormalizedCredentialCapabilities } from './resolveNormalizedCredentialCapabilities';

export function resolveHasAdvancedSignOutCertification(
  credentials: ProviderCredential[] | undefined,
  jurisdiction: Jurisdiction,
  /** Real, per direct guidance — the real, canonical system
   *  capability key (e.g. "CYTO_ADVANCED_SPECIALIST"), never a raw,
   *  jurisdiction-specific credential string. */
  requiredCapability: string,
  asOfDate: string,
): boolean {
  const capabilities = resolveNormalizedCredentialCapabilities(credentials, jurisdiction, asOfDate);
  return capabilities.includes(requiredCapability);
}
