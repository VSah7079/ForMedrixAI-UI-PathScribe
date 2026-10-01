// src/services/staff/resolveNormalizedCredentialCapabilities.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction: "CYTO_ADVANCED_
// SPECIALIST is officially the canonical tag to use across the rule
// engine and data model interfaces." A provider's real, held
// credential is always the real, raw, jurisdiction-specific
// certification (e.g. the UK's real IBMS_ASD) — this function is the
// one, real place that normalizes a raw credential into the system's
// own canonical capability key. Every other real consumer (the sign-
// out gate, the QC engine's own rule criteria) checks the normalized
// capability, never a raw, jurisdiction-specific string directly —
// exactly the design direct guidance confirmed: "the database or
// identity provider can map region-specific qualifications to this
// core credential key."
//
// Real, deliberate: normalization also requires the credential to be
// genuinely active (jurisdiction-matched, in its own real effective/
// expiration window) — a raw credential that wouldn't itself grant
// real authority contributes no real, normalized capability either.
//
// Real, important caveat, per direct guidance's own explicit caution:
// "CYTO_ADVANCED_SPECIALIST" is authoritative only within PathScribe's
// own normalized authorization model — it is not itself a real
// credential recognized by any individual country's own certifying
// body. The correct, precise term for it is a "normalized system
// capability key," never an "authoritative credential identifier" —
// the latter framing could wrongly suggest this is some real,
// cross-border regulatory standard, when it is genuinely just this
// app's own internal abstraction over real, disparate, jurisdiction-
// specific credentials.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProviderCredential } from '@/types/staff/ProviderCredential';
import type { Jurisdiction } from '@/types/systemConfig';

/** Real, per direct guidance's own confirmed mapping — every real,
 *  raw, jurisdiction-specific credential type known to this app,
 *  mapped to the one, real, canonical system capability it confers.
 *  Real, honest scope: Germany's own real, raw credential name
 *  (DE_ZYTO_ASSISTENT_ADV) is included here per direct guidance, even
 *  though resolveAdvancedCytologySignOutJurisdictionPolicy.ts's own
 *  earlier, honest placeholder had left Germany's accepted-credential
 *  list empty pending this exact name — that placeholder is now
 *  resolved by this real mapping. */
/** Normalized capability: may sign a forensic (medicolegal) autopsy's
 *  PAD/FAD in the credential's jurisdiction (Batch 331, PS-327, per Pete:
 *  forensic sign-out is restricted to the legally appointed medical
 *  examiner, forensic pathologist or coroner's pathologist for that
 *  jurisdiction). */
export const FORENSIC_AUTOPSY_SIGNOUT = 'FORENSIC_AUTOPSY_SIGNOUT';
export const CYTO_ADVANCED_SPECIALIST = 'CYTO_ADVANCED_SPECIALIST';

const RAW_TO_NORMALIZED_CAPABILITY: Record<string, string> = {
  IBMS_ASD: CYTO_ADVANCED_SPECIALIST,
  NL_KCA_ADVANCED: CYTO_ADVANCED_SPECIALIST,
  DE_ZYTO_ASSISTENT_ADV: CYTO_ADVANCED_SPECIALIST,
  // Batch 331: a jurisdiction's appointment to perform and sign
  // medicolegal autopsies — a medical examiner / forensic pathologist /
  // coroner's pathologist appointment, recorded against the jurisdiction
  // that issued it. The generic type covers any jurisdiction; the UK Home
  // Office register is named because it is the statutory list for
  // forensic post-mortems in England & Wales.
  MEDICOLEGAL_APPOINTMENT: FORENSIC_AUTOPSY_SIGNOUT,
  UK_HO_REGISTERED_FORENSIC_PATHOLOGIST: FORENSIC_AUTOPSY_SIGNOUT,
};

/** Raw credential types an administrator can record on a staff member
 *  (Staff → edit → Credentials). Each has a display name under
 *  `staffTab.credentials.types.<type>`. */
export const KNOWN_CREDENTIAL_TYPES: readonly string[] = Object.keys(RAW_TO_NORMALIZED_CAPABILITY);

export function resolveNormalizedCredentialCapabilities(
  credentials: ProviderCredential[] | undefined,
  jurisdiction: Jurisdiction,
  asOfDate: string,
): string[] {
  if (!credentials) return [];
  return credentials
    .filter(c =>
      c.jurisdiction === jurisdiction &&
      c.effectiveDate <= asOfDate &&
      (!c.expirationDate || c.expirationDate >= asOfDate),
    )
    .map(c => RAW_TO_NORMALIZED_CAPABILITY[c.type])
    .filter((capability): capability is string => capability !== undefined);
}
