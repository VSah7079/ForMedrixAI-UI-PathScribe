// src/utils/evaluateMicroscopicFinalizeGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct specification: conditional/dynamic blocking
// for the (forthcoming) Microscopic Description step, closing the real
// gap found directly — Stage 1 (evaluateSynopticAssignment) only ever
// fires at Gross Complete, when microscopic text can't realistically
// exist yet, and no real trigger anywhere re-evaluates template
// assignment once it does.
//
// Deliberately NOT a hard, static block like an unfinished Grossing
// report — per direct decision, many CAP synoptic protocols already
// embed the microscopic criteria directly in their own structured
// fields, so a mandatory free-text narrative on top would add real
// friction without real documentation value for those cases. This
// function encodes the real, conditional rule set instead — see the
// four real scenarios traced against it in evaluateMicroscopicFinalizeGate.test.ts,
// matching the exact scenario table this was specified against.
//
// i18n note: this is a plain utility with no `useTranslation()` of
// its own, so `reason` is a translation key (`reasonKey`) rather than
// rendered text — the caller (handleRequestFinalize, in
// useSignOutWorkflow.ts) resolves it via `t()` before passing it to
// `showToast()`. Keys live under `evaluateMicroscopicFinalizeGate.*`.
// ─────────────────────────────────────────────────────────────────────────────

export type MicroscopicNarrativeStatus = 'not-started' | 'draft' | 'saved';

export interface MicroscopicFinalizeGateInput {
  microscopicStatus: MicroscopicNarrativeStatus;
  /** Ignored unless microscopicStatus is 'saved' — a 'saved' status
   *  with empty text is a real, deliberate skip (the pathologist
   *  reviewed the step and left it blank), not the same as never
   *  having started it, but both are treated identically here: both
   *  fall through to the synoptic/requirement checks below. */
  microscopicText: string;
  /** Whether a synoptic template is currently assigned to this
   *  specimen/case at all — never inferred from field state; the
   *  caller's own real assignment data. */
  hasSynopticTemplate: boolean;
  /** Whether every REQUIRED field across the active synoptic
   *  template(s) is genuinely answered — same real "required field"
   *  concept validateRequired() already uses elsewhere in this app,
   *  not re-derived independently here. */
  allRequiredSynopticFieldsComplete: boolean;
  /** Real, admin-configured requirement — from a lab's own procedure-
   *  code-level configuration (or a case type where no synoptic
   *  template exists to substitute for narrative at all). Never
   *  inferred or guessed here; the caller's own resolved value. */
  requiresMicroscopicNarrative: boolean;
}

export interface MicroscopicFinalizeGateResult {
  blocked: boolean;
  /** Translation key, present only when blocked — resolved by the
   *  caller (handleRequestFinalize) via `t()`, matching the real
   *  toast-message pattern it already uses for its other blocking
   *  checks (missing fields, unverified AI suggestions). */
  reasonKey?: string;
}

export function evaluateMicroscopicFinalizeGate(
  input: MicroscopicFinalizeGateInput,
): MicroscopicFinalizeGateResult {
  // Rule 1 — an active, unsaved draft always blocks, regardless of
  // synoptic state or admin configuration. Protects against silently
  // losing partial notes a pathologist was actively writing — the
  // real risk this rule exists to prevent, not a documentation-
  // completeness check at all.
  if (input.microscopicStatus === 'draft') {
    return {
      blocked: true,
      reasonKey: 'evaluateMicroscopicFinalizeGate.unsavedDraft',
    };
  }

  const hasPopulatedNarrative = input.microscopicStatus === 'saved' && input.microscopicText.trim().length > 0;

  // Rule 2 — real, saved narrative text always satisfies the
  // requirement on its own, regardless of synoptic completeness. A
  // pathologist who wrote a real Microscopic Description has, by
  // definition, documented the case — never gated on anything else.
  if (hasPopulatedNarrative) {
    return { blocked: false };
  }

  // From here: microscopic is empty (never started, or explicitly,
  // deliberately left blank after review — both treated the same).

  // Rule 3 — real, admin-configured mandatory requirement (specific
  // procedure code, or a case type with no synoptic template able to
  // substitute for narrative at all).
  if (input.requiresMicroscopicNarrative) {
    return {
      blocked: true,
      reasonKey: 'evaluateMicroscopicFinalizeGate.requiredForProcedure',
    };
  }

  // Rule 4 — nothing else documents the case either. Blocking here is
  // the safe, honest default regardless of admin configuration: a
  // case with genuinely zero real documentation (no synoptic answers,
  // no narrative) must never be finalizable.
  if (!input.hasSynopticTemplate) {
    return {
      blocked: true,
      reasonKey: 'evaluateMicroscopicFinalizeGate.noDocumentationAtAll',
    };
  }

  // Rule 5 — a synoptic template exists but isn't genuinely complete
  // yet. Note: the existing validateRequired() check elsewhere in
  // handleRequestFinalize already blocks finalize for incomplete
  // required synoptic fields on its own — this rule exists so THIS
  // function's own result stays honest and consistent if ever called
  // independently of that check, not because it's expected to be the
  // first blocker a real pathologist hits in practice.
  if (!input.allRequiredSynopticFieldsComplete) {
    return {
      blocked: true,
      reasonKey: 'evaluateMicroscopicFinalizeGate.incompleteSynopticFields',
    };
  }

  // Rule 6 — synoptic template active, genuinely complete, narrative
  // deliberately skipped, nothing admin-mandated. Real, intentional
  // skip — exactly the friction-reducing case this whole design
  // exists to allow.
  return { blocked: false };
}
