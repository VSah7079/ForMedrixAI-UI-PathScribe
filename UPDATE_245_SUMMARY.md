# PathScribe Update 245 — Summary

Bridges QA deficiencies to a manually human-raised entry point, per direct decision ("should be raised to a CAPA by a human"), for the fixation-completion data gap recorded in update-244.

## A real correction made mid-update, worth restating
The first framing of this work claimed a raised `SpecimenDeficiency` already *is* the CAPA record. That was wrong, or at least imprecise, and was corrected directly (with the user's own pushback) before building anything further. The accurate picture, confirmed against the real code:

- **Raising** a deficiency (`raise()`) creates an open record — real detection, not yet a CAPA.
- A human then chooses one of three real, already-existing paths on the Deficiencies tab: **Contain** (`containImmediately()` — a quick, one-off close, no root cause, nothing to verify later), **Escalate to CAPA** (this codebase's own name for `resolve()` — captures corrective action, root cause, optional preventive action, and a verification due date, moving the record to `pending-verification`), or leave it open.
- **`verifyEffectiveness()`** is the step that actually closes a CAPA cycle out, or sends it back to `open` (incrementing `reopenCount`) if the issue recurred.

So this update builds the real detection step — a human manually raising a deficiency when they notice missing fixation data — and deliberately does not touch the escalation mechanism, since that already exists generically for any deficiency type, including the new one.

## What changed

- **New deficiency type**, `def-missing-fixation-completion` — genuinely distinct from the existing `def-missing-fixation-time`, which is specifically about the older, hard-blocking fixation *start*-time gate (`FixativeTimeGateModal.tsx`) and its own three-way resolution flow. This one covers the record-only fixation *end* time and ratio confirmation from update-244, neither of which has any gate.
- **A real, pre-existing gap fixed alongside it**: `mockDeficiencyTypeService.ts` never had a version-gated re-seed mechanism, despite several prior sessions adding new seed types. Added one, matching the established convention — with an honest comment that a version bump wipes and reseeds the *entire* stored list, including any custom type a site added via the real admin UI, not just the changed entries. Flagging this plainly since it's a real, if standard, tradeoff.
- **Grossing Screen**: per direct guidance (both locations), a "Raise deficiency" action next to the existing fixation UI — shown only while fixation data is genuinely still missing, replaced by a "Deficiency raised" state once one exists (fetched on load via `getByCaseId`, updated locally on a successful raise). Multiple deficiencies per specimen remain fully allowed, per this app's own existing design — this never blocks raising another.
- **QA Deficiencies tab**: a new "Raise Deficiency" button and modal — case lookup by ID, optional specimen selection (deficiency types are filtered to those valid for a case-level vs. specimen-level pick), a deficiency-type dropdown, and a comment field. This is a genuinely new UI flow; nothing like it existed on this page before.

## Verification
`tsc` clean throughout. Full suite: 449 files, 3928 tests, all passing (up from 449/3923 — 5 new tests for the Grossing Screen's new handler and open-deficiency fetch). Also fixed an existing test's mock (`GrossingScreenPage.test.tsx`) that would otherwise have broken from the hook's new return values.

No dedicated test file exists for `QualityAssurancePage.tsx` itself — none existed before this update either (the file has no test infrastructure at all, 1400+ lines), so the new modal/handler there is validated via `tsc` and the full-suite regression run rather than a new, isolated test.
