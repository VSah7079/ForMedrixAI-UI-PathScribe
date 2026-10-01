// src/services/cytology/resolveCytologySignOutGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, standard CLIA '88 / CAP sign-out gating: a Cytotechnologist may
// independently issue a final sign-out only under specific, well-defined
// conditions. Per direct guidance's own "Hard System Gating Checks" —
// four real, independent boolean checks; if ANY fails, CT sign-out is
// blocked (pathologist review required) regardless of the others.
//
// Real, deliberate reuse rather than four newly-invented checks:
//   1. Specimen Type    — isGynCytology (SpecimenEntry.isGynCytology, PS-160)
//   2. Diagnostic Severity — the review's own, already-computed
//      requiresPathologistReview (resolveCytologyReviewRequirement,
//      Phase 2) — NILM and its own real sub-findings (including
//      reactive changes, organisms, atrophy) already resolve to false
//      there; every real epithelial abnormality/malignancy already
//      resolves to true. Not recomputed a second, different way here.
//
//      Real, updated (Sep 2026), per direct guidance's own confirmed
//      research (EACC/EFCS): a blanket "any abnormal always requires
//      a pathologist" rule is a real, common misconception — in
//      several real jurisdictions (Germany, Netherlands, UK), an
//      advanced-level Cytotechnologist holding a real, jurisdiction-
//      scoped credential may independently sign out abnormal GYN
//      cytology under lab-director oversight. Real, deliberate,
//      confirmed 3-part design: (a) a real, independent jurisdiction-
//      level permissibility check
//      (resolveAdvancedCytologySignOutJurisdictionPolicy.ts) — never
//      just inferred from a credential's own existence, so a
//      mistakenly-issued credential record can never itself grant
//      real authority in a jurisdiction that doesn't support this
//      exception at all; (b) a real, provider-level credential check
//      (resolveHasAdvancedSignOutCertification.ts) using that same
//      jurisdiction's own real, named accepted credential type(s);
//      (c) the QC engine's own, separate criteria targeting
//      (services/cytologyQc/'s own requiredCapabilities) so
//      standard vs. advanced-CT sign-outs can be sampled by genuinely
//      different real QC rules. Scoped to GYN cases only, matching
//      the real, confirmed research this exception is based on — a
//      credentialed CT gets no exception from check #1 (non-GYN)
//      below, which still always blocks.
//   3. Specimen Adequacy — CytologyCategoryEntry.isUnsatisfactory
//      (PS-154), looked up from the review's own adequacyCategoryIds
//      (real, multi-select — any one unsatisfactory selection blocks).
//   4. Pre-Sign-Out QC/Sampling — isFlaggedForQc, an explicit input
//      this pure function takes rather than derives. Real, honest
//      scoping: the actual QC-selection algorithm (random 10% sample,
//      high-risk-patient targeting) is real, separate, later work —
//      this function only enforces the real, resulting gate once a
//      case IS flagged, whatever mechanism did the flagging. Also
//      covers "High-Risk/High-History Patient (NILM)" from direct
//      guidance's own matrix — that case is blocked via mandatory QC
//      flagging, not a fifth, separate check.
//
// Real, deliberate: checks #1, #3, #4 are unaffected by the real
// credential exception — direct guidance's own research names only
// the abnormal-diagnostic-severity scenario; a credentialed CT is
// never granted authority over non-GYN specimens, unsatisfactory
// adequacy, or a case genuinely flagged for QC.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyCategoryEntry } from './ICytologyCategoryService';
import type { ProviderCredential } from '@/types/staff/ProviderCredential';
import type { Jurisdiction } from '@/types/systemConfig';
import { resolveHasAdvancedSignOutCertification } from '@/services/staff/resolveHasAdvancedSignOutCertification';
import { resolveAdvancedCytologySignOutJurisdictionPolicy } from './resolveAdvancedCytologySignOutJurisdictionPolicy';

export type CytologySignOutBlockReason =
  | 'non_gyn_specimen'
  | 'requires_pathologist_review'
  | 'unsatisfactory_adequacy'
  | 'flagged_for_qc'
  | 'unvalidated_synoptic_translation';

export interface CytologySignOutGateResult {
  allowed: boolean;
  /** Every real reason CT sign-out is blocked — deliberately not just
   *  the first one found, so a real UI can explain the complete
   *  picture rather than making the user fix one blocker only to
   *  discover another. Empty when allowed is true. */
  blockedReasons: CytologySignOutBlockReason[];
}

export function resolveCytologySignOutGate(
  review: {
    adequacyCategoryIds?: string[];
    requiresPathologistReview: boolean;
  },
  isGynCytology: boolean,
  isFlaggedForQc: boolean,
  categories: CytologyCategoryEntry[],
  /** Real, per direct guidance's own confirmed policy — the case's
   *  own real performing jurisdiction, and the signing provider's own
   *  real, held credentials, both required to evaluate the real
   *  advanced-CT exception. Real, deliberate: not optional — every
   *  real caller must supply these, so the exception can never be
   *  silently skipped by an incomplete call site. */
  labJurisdiction: Jurisdiction,
  signingProviderCredentials: ProviderCredential[] | undefined,
  /** Real, per direct guidance — the real date this sign-out is
   *  actually happening, checked against a credential's own real
   *  effective/expiration window. Defaults to real "now" so every
   *  existing caller keeps working without a required change, but a
   *  real caller may supply a specific date (e.g. a backfilled or
   *  amended sign-out) when that matters. */
  asOfDate: string = new Date().toISOString(),
  /** Real, per direct guidance's own confirmed enforcement ask —
   *  optional, since most real reviews carry no real synoptic data at
   *  all (GYN cases, CISOE-A cases). When a real review DOES carry
   *  synoptic answers with real, currently-unvalidated clinical terms
   *  and no real, current acknowledgment covering them, sign-out is
   *  blocked — a real caller computes both values via
   *  resolveSynopticTranslationValidation.ts before calling this gate,
   *  never derived here. */
  synopticTranslationCheck?: { hasUnvalidatedTerms: boolean; hasCurrentAcknowledgment: boolean },
): CytologySignOutGateResult {
  const blockedReasons: CytologySignOutBlockReason[] = [];

  // 1. Specimen Type Check — real, per direct guidance: "All non-GYN
  //    specimens require final pathologist sign-out regardless of
  //    whether the interpretation is negative or abnormal."
  if (!isGynCytology) blockedReasons.push('non_gyn_specimen');

  // 2. Diagnostic Severity Check — real, already-computed field, not
  //    a second, independent re-derivation. Real, updated: requires
  //    BOTH a real, independent jurisdiction-level permissibility
  //    check AND a real, matching, active provider credential — see
  //    this file's own header for the full, confirmed 3-part design
  //    behind this exception.
  const jurisdictionPolicy = resolveAdvancedCytologySignOutJurisdictionPolicy(labJurisdiction);
  const hasAdvancedException = isGynCytology
    && jurisdictionPolicy.permitted
    && jurisdictionPolicy.acceptedCredentialTypes.some(credentialType =>
      resolveHasAdvancedSignOutCertification(signingProviderCredentials, labJurisdiction, credentialType, asOfDate),
    );
  if (review.requiresPathologistReview && !hasAdvancedException) {
    blockedReasons.push('requires_pathologist_review');
  }

  // 3. Specimen Adequacy Check — real, per direct guidance: "CAP
  //    guidelines require pathologist confirmation before issuing an
  //    unsatisfactory report." Real, per direct UI-review follow-up:
  //    Adequacy is now a real, multi-select field — ANY selected
  //    category flagged isUnsatisfactory is enough to block, same
  //    "any condition true" disjunction this module already uses
  //    elsewhere. No selections at all is treated as NOT
  //    unsatisfactory here deliberately — absence of an adequacy call
  //    entirely is a real, separate data gap this specific check
  //    isn't responsible for catching.
  const isUnsatisfactory = (review.adequacyCategoryIds ?? []).some(
    id => categories.find(c => c.id === id)?.isUnsatisfactory === true
  );
  if (isUnsatisfactory) blockedReasons.push('unsatisfactory_adequacy');

  // 4. Pre-Sign-Out QC/Sampling Check.
  if (isFlaggedForQc) blockedReasons.push('flagged_for_qc');

  // 5. Synoptic Translation Validation Check — real, per direct
  //    guidance's own "tie the checkbox directly to the underlying
  //    document metadata" correction. Blocks only when a real,
  //    currently-unvalidated clinical term exists AND no real,
  //    current acknowledgment covers it — a real case with no
  //    synoptic data at all, or one where every real term is either
  //    validated or already acknowledged, is never blocked here.
  if (synopticTranslationCheck?.hasUnvalidatedTerms && !synopticTranslationCheck.hasCurrentAcknowledgment) {
    blockedReasons.push('unvalidated_synoptic_translation');
  }

  return { allowed: blockedReasons.length === 0, blockedReasons };
}
