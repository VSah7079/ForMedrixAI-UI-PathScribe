// src/services/cytology/resolveSynopticTranslationSignOutAuditEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed requirement: an immutable
// audit-log entry whenever a real case is actually signed out while
// real, currently-unvalidated clinical terms remain in its own
// synoptic answers — feeding the same real, established audit
// infrastructure every other real event in this app already uses
// (services/auditlog/, AuditLogPage.tsx), never a separate, parallel
// log of its own.
//
// Real, per direct guidance's own confirmed correction: the exact
// authorization path is now an explicit, real enum
// (SignOutAuthorizationMode) rather than an implicit boolean — "the
// audit log must reflect the exact truth of how that sign-out was
// permitted." resolveCanSignOutCytology.ts lets a real Pathologist
// sign out REGARDLESS of resolveCytologySignOutGate's own result —
// "a Pathologist signing IS the real pathologist review the gate
// exists to require." That means a real Pathologist can genuinely
// sign out with unvalidated terms present and NO real, formal
// acknowledgment ever recorded at all. Per direct guidance's own
// confirmed matrix: a real, explicit acknowledgment always means
// EXPLICIT_ACKNOWLEDGMENT, regardless of role (a Pathologist who DID
// check the box is credited with that, not silently reclassified as
// a bypass); PATHOLOGIST_ROLE_BYPASS is reserved for the one real
// case a Cytotechnologist could never reach at all — unvalidated
// terms present, sign-out proceeding, with no acknowledgment
// covering them — which can only mean a real Pathologist's own
// role-based authority is what let this through.
//
// Real, deliberate scope: fires ONLY for the two real, exceptional
// rows in that same confirmed matrix (unvalidated terms genuinely
// present at sign-out) — never for a real, ordinary STANDARD sign-out
// with nothing to flag, which would just be audit-log noise
// duplicating whatever real, general "case signed out" event this
// app already logs elsewhere.
//
// Real, deliberate scope on `renderedText`: resolved in NARRATIVE
// context (resolvePathologyLexiconTerm.ts's own 'narrative' param),
// matching exactly what the compiled narrative preview actually
// showed the signing user — never the separate, label-context text.
//
// Real, deliberate scope on the actual clinical category identifiers
// (lexiconTermKey values, e.g. "bethesda.thyroid.category.ii"): kept
// in `detail` alongside the real caseId, following the same real,
// already-established precedent this exact audit log already sets
// for CPT codes (CytologyScreeningPage.tsx's own auditService.
// logEvent call sites for Code Manager changes) — a discrete
// classification identifier, not a raw clinical measurement value,
// which is the real, narrower thing AuditLog.detail's own
// "PHI-safe" doc comment actually excludes.
// ─────────────────────────────────────────────────────────────────────────────

import { resolvePathologyLexiconTerm } from './resolvePathologyLexiconTerm';
import { resolveCytologySynopticTemplateById } from './cytologySynopticTemplateRegistry';
import type { PathologyLexiconEntry, PathologyLexiconLocale } from '@/types/cytology/PathologyLexicon';
import type { SynopticTranslationAcknowledgment } from '@/pages/CytologyWorklistPage/components/CytologySynopticFormView';

export type SignOutAuthorizationMode =
  | 'STANDARD'
  | 'EXPLICIT_ACKNOWLEDGMENT'
  | 'PATHOLOGIST_ROLE_BYPASS';

export interface UnvalidatedTermAuditDetails {
  termKey: string;
  fallbackLocaleUsed: string;
  /** Real, per direct guidance's own confirmed field — the exact,
   *  real text the compiled narrative actually rendered in place of
   *  this term (narrative context, the option's own canonical
   *  `narrativePhrase`), not the separate label-context text. */
  renderedText: string;
}

export interface SignOutTranslationAuditDetail {
  signedOutBy: { userId: string; role: string };
  authorizationMode: SignOutAuthorizationMode;
  hasUnvalidatedTerms: boolean;
  unvalidatedTerms: UnvalidatedTermAuditDetails[];
  userAcknowledgedUnvalidatedTerms: boolean;
}

export interface SynopticTranslationSignOutAuditEvent {
  type: 'user';
  event: 'Signed Out With Unvalidated Translation';
  detail: string;
  user: string;
  caseId: string;
  confidence: null;
}

/** Real, per direct guidance's own confirmed audit requirement.
 *  Returns undefined for a real review with no real synoptic data,
 *  no real unvalidated terms currently present, or a locale of 'en'
 *  (the canonical source language always is validated) — never a
 *  real, empty/placeholder audit entry for a real, ordinary STANDARD
 *  sign-out with nothing to flag. */
export function resolveSynopticTranslationSignOutAuditEvent(
  review: { synopticData?: { templateId: string; answers: Record<string, string | string[]>; translationValidationAcknowledgment?: SynopticTranslationAcknowledgment } },
  locale: PathologyLexiconLocale | 'en',
  lexicon: PathologyLexiconEntry[],
  signingUser: { userId: string; displayName: string; role: string },
  caseAccession: string,
): SynopticTranslationSignOutAuditEvent | undefined {
  if (!review.synopticData || locale === 'en') return undefined;
  const template = resolveCytologySynopticTemplateById(review.synopticData.templateId);
  if (!template) return undefined;

  const unvalidatedTerms: UnvalidatedTermAuditDetails[] = [];
  const seenKeys = new Set<string>();
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (!field.options) continue;
      const answer = review.synopticData.answers[field.id];
      if (answer === undefined) continue;
      const selectedIds = Array.isArray(answer) ? answer : [answer];
      for (const optionId of selectedIds) {
        const option = field.options.find(o => o.id === optionId);
        if (!option?.lexiconTermKey || seenKeys.has(option.lexiconTermKey)) continue;
        const resolved = resolvePathologyLexiconTerm(option.lexiconTermKey, locale, lexicon, 'narrative');
        if (resolved.isValidatedTranslation) continue;
        seenKeys.add(option.lexiconTermKey);
        unvalidatedTerms.push({
          termKey: option.lexiconTermKey,
          fallbackLocaleUsed: locale,
          renderedText: option.narrativePhrase ?? resolved.text,
        });
      }
    }
  }
  if (unvalidatedTerms.length === 0) return undefined;

  const ack = review.synopticData.translationValidationAcknowledgment;
  // Real, per direct guidance's own confirmed staleness rule — an
  // acknowledgment only genuinely covers THIS event when every real,
  // currently-unvalidated key was actually part of what it covered;
  // a real, newly-appeared unvalidated term after acknowledgment
  // means this sign-out is honestly unacknowledged for that term,
  // even though a real acknowledgment record exists.
  const ackCoversAll = !!ack && unvalidatedTerms.every(t => ack.acknowledgedUnvalidatedTermKeys.includes(t.termKey));

  // Real, per direct guidance's own confirmed matrix — an explicit,
  // real acknowledgment always means EXPLICIT_ACKNOWLEDGMENT
  // regardless of role; the only way to reach this line with
  // unvalidated terms present and NO acknowledgment covering them is
  // a real Pathologist's own role-based bypass (a Cytotechnologist
  // in that exact state would have been blocked before ever reaching
  // sign-out at all).
  const authorizationMode: SignOutAuthorizationMode = ackCoversAll ? 'EXPLICIT_ACKNOWLEDGMENT' : 'PATHOLOGIST_ROLE_BYPASS';

  const detail: SignOutTranslationAuditDetail = {
    signedOutBy: { userId: signingUser.userId, role: signingUser.role },
    authorizationMode,
    hasUnvalidatedTerms: true,
    unvalidatedTerms,
    userAcknowledgedUnvalidatedTerms: ackCoversAll,
  };

  return {
    type: 'user',
    event: 'Signed Out With Unvalidated Translation',
    detail: JSON.stringify(detail),
    user: signingUser.displayName,
    caseId: caseAccession,
    confidence: null,
  };
}
