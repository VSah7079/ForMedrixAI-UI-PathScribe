// src/services/autopsy/resolveAutopsyGrossExaminationGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded RFP's own §III.2 ("AUTHORIZATION & LEGAL
// HARD-STOPS") — "Maintain automated hard-stops preventing gross
// examination until required legal documents are logged and
// verified." Mirrors resolveCytologySignOutGate.ts's own established
// { allowed, blockedReasons } shape rather than inventing a new one.
//
// Real, per direct guidance's own confirmed conservative fallback:
// HospitalConsentRecord.revokedOrNarrowedAt conflates two genuinely
// different real events — a full revocation (must block) and a mere
// scope narrowing (should only constrain what's examined/retained,
// never block gross exam itself) — into one shared timestamp, with
// only a free-text revocationNote to (unreliably) tell them apart.
// This gate cannot safely distinguish the two from that shape, so it
// blocks on EITHER — a real, deliberate over-block on the narrowing
// case, in exchange for never under-blocking the revocation case.
//
// Real, recommended follow-up (explicitly a SUBSEQUENT pass, per
// direct guidance — not implemented here): replace
// revokedOrNarrowedAt with a real, structured
// `status: 'ACTIVE' | 'NARROWED' | 'REVOKED'` (plus separate
// revokedAt/narrowedAt timestamps and a real scopeConstraints list)
// so a real NARROWED consent can return allowed: true with its own
// real constraints surfaced on the gross-exam workbench, while only
// REVOKED hard-blocks. Left as a real, open, well-scoped Phase 3+
// item rather than restructuring Phase 1's own already-established
// type on the strength of this one gate's own needs.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutopsyCaseDetails } from '@/types/autopsy/AutopsyCaseDetails';

export interface AutopsyGrossExaminationGateResult {
  allowed: boolean;
  blockedReasons: string[];
}

export function resolveAutopsyGrossExaminationGate(
  caseDetails: AutopsyCaseDetails,
): AutopsyGrossExaminationGateResult {
  const blockedReasons: string[] = [];

  // 1. Medicolegal/Forensic path — real, per RFP §III.2: "Formal
  //    judicial requisition, court order, or Coroner/Fiscal/
  //    Prosecutor direction." A real order REFERENCE (never just a
  //    free-text justification standing in for one — see
  //    ForensicAuthorization's own doc comment) and a real order
  //    DATE are both required; either missing means no real,
  //    verifiable legal mandate is on record yet.
  if (caseDetails.caseAuthority === 'medicolegal_forensic') {
    const auth = caseDetails.forensicAuthorization;
    const hasValidOrderRef = Boolean(auth?.orderReference && auth.orderReference.trim().length > 0);
    const hasValidOrderDate = Boolean(auth?.orderDate);
    if (!auth || !hasValidOrderRef || !hasValidOrderDate) {
      blockedReasons.push('Medicolegal/forensic autopsy requires a valid legal authorization order reference and order date.');
    }
  }

  // 2. Hospital-consented path — real, per RFP §III.2: "Valid family
  //    consent form." A real consentGivenAt timestamp is required;
  //    a real, present revokedOrNarrowedAt blocks conservatively —
  //    see this file's own header comment for why.
  if (caseDetails.caseAuthority === 'hospital_consented') {
    const consent = caseDetails.hospitalConsent;
    if (!consent || !consent.consentGivenAt) {
      blockedReasons.push('Hospital-consented autopsy requires documented, active consent given.');
    } else if (consent.revokedOrNarrowedAt) {
      blockedReasons.push('Consent record indicates a revocation or scope narrowing. Human verification of consent terms is required before gross examination.');
    }
  }

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
  };
}
