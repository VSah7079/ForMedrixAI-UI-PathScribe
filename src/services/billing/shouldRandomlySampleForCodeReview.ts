// src/services/billing/shouldRandomlySampleForCodeReview.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Code Review Pool design - the random-
// sampling half of Trigger C (the manual-flagging half was already
// built: CodeReviewPoolEntry, mockCodeReviewPoolService, the QA
// Financials tab). Rolled once per case at real sign-out
// (finalizeCase()), against the case's own real performing lab's
// configured Facility.codeReviewSamplingRatePercent.
//
// Deliberately a pure function taking the real rate directly, not
// resolving the facility itself - same "resolve async/real data at the
// call site, pass already-resolved data into the pure function"
// posture as resolveSpecimenDictionaryBaseCptCode/
// resolveBillingDateOfService elsewhere in this app. Genuinely random
// (Math.random()), not deterministic - a real, honest sample, not a
// hash-based pseudo-random selection that would make the same case
// always land the same way every time it's checked.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, per direct guidance - true with probability ratePercent/100.
 *  A null/undefined/zero/negative rate never samples (0% chance,
 *  matching "no random sampling for this lab" - the same "absence
 *  means off" convention Facility.codeReviewSamplingRatePercent's own
 *  doc comment describes). A rate >= 100 always samples. Values
 *  outside [0, 100] are clamped rather than producing a nonsensical
 *  probability - a real, defensive floor/ceiling, not a validation
 *  error this pure function should be responsible for raising. */
export function shouldRandomlySampleForCodeReview(ratePercent: number | null | undefined): boolean {
  if (!ratePercent || ratePercent <= 0) return false;
  const clamped = Math.min(ratePercent, 100);
  return Math.random() * 100 < clamped;
}
