// src/types/staff/ProviderCredential.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit design: "store sign-out
// permissions as explicitly scoped credentials or sub-capabilities on
// the user record" rather than a dynamic top-level role (e.g.
// `ROLE_UK_ADVANCED_CT`). A UK Advanced Specialist Diploma
// Cytotechnologist is still fundamentally a Cytotechnologist — this
// is an additional, real, jurisdiction-scoped credential layered on
// top of that existing role, not a new role of its own.
//
// Real, deliberate design: `jurisdiction` lives on the credential
// itself, not on some separate "which jurisdictions grant this
// exception" allowlist inside the sign-out gate or QC engine — a
// credential genuinely issued for one real jurisdiction (e.g. IBMS's
// UK-specific diploma) has no real bearing on sign-out authority in a
// different one, and a provider could, in principle, hold more than
// one real, jurisdiction-scoped credential.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

/** Real, per direct guidance's own named example. Kept as a plain
 *  string, not a closed union — a real credential taxonomy varies by
 *  issuing body and jurisdiction, and this app has no reason to
 *  constrain it to credentials named here. */
export type ProviderCredentialType = string;

export interface ProviderCredential {
  type: ProviderCredentialType;
  /** Real, per direct guidance's own named example (e.g. "IBMS" —
   *  the UK's Institute of Biomedical Science). */
  issuingBody: string;
  jurisdiction: Jurisdiction;
  effectiveDate: string;
  /** Real, per direct guidance — a real credential can lapse. Left
   *  undefined for a credential with no real, recorded expiration —
   *  treated as currently valid (never assumed expired from a real
   *  absence of data). */
  expirationDate?: string;
}
