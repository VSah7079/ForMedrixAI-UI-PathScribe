# PathScribe Update 241 — Summary

Real addendum support for Cytology, correcting a real reasoning error from the previous update. Direct correction supplied: Cytology cases genuinely can have addendums — a distinct, standard clinical concept from amendments/corrections (addendum: appends supplemental information, original diagnosis stays intact; amendment: corrects an error in the original).

## The mistake, and why it happened
The previous update concluded Cytology had no real addendum concept at all, reasoning that "a correction always replaces the specimen's own single Final Diagnosis — there's no separate, supplemental result to append the way Surg Path's own multi-instance model allows." That conflated two genuinely separate things: Cytology doesn't use Surg Path's *multi-instance data model* — true — but that says nothing about whether the *addendum concept itself* (append supplemental content without touching the original diagnosis) applies to Cytology. It does, and it doesn't need Surg Path's data model to work — it can be built on Cytology's own, already-established `CytologySignOutRecord` architecture instead.

## What changed

- **`CytologyReportContent`** gained `addendumText?: string` — free-text supplemental content (reflex/ancillary testing, cell-block IHC, molecular markers, a second opinion, clinical correlation, delayed material review). Purely additive; `primaryInterpretation` and every other field are untouched on an addendum record.
- **`CytologySignOutRecord`** gained `addsToRecordId?: string`, kept as a genuinely separate field from the existing `amendsRecordId` — the real clinical distinction (an amendment replaces what was reported; an addendum leaves it standing) is preserved in the data model itself, not just in prose.
- **`buildCytologyOruR01Payload.ts`** and **`CytologyOutboundResultQueueEntry`** both regained `'ADDENDUM'` in their `resultState` unions (removed in the prior update on the mistaken assumption above), with a new `narrative.addendumText` field populated only for a genuine ADDENDUM dispatch — never alongside `previouslyReportedAs`, which stays CORRECTED-only.
- **New: `releaseCytologyAddendum.ts`** — genuinely simpler than the correction function, since nothing about the diagnosis changes: no new `CytologyReviewRecord` at all. The new sign-out record references the *same* `reviewRecordId` as the one it adds to, carrying every field forward unaltered except the new `addendumText`. Same real "always written, never edited" posture as everything else in this module — a new, linked record, never a mutation of the one it supplements.
- **`dispatchCytologyAmendedCaseInstance.ts`** generalized to accept `resultState: 'CORRECTED' | 'ADDENDUM'` (previously hardcoded to `'CORRECTED'`), mirroring `services/reports/dispatchAmendedCaseInstance.ts`'s own real signature.
- **`publishReportReleasedEvent.ts`**: the `CORRECTED`/`ADDENDUM` cases are merged back into one shared body that branches on `source` — Cytology now routes to its own dispatcher for *both* report types; a dedicated test confirms the previously-wrong "ADDENDUM never routes to Cytology" behavior is now correctly reversed, and a second new test confirms the Surg Path ADDENDUM path is unaffected.
- **`services/cytology/README.md`**: the incorrect "no real addendum concept" claim from the prior update's own entry is corrected directly and openly, rather than quietly edited away.

## Verification
`tsc` clean throughout. Full suite: 446 files, 3903 tests, all passing (up from 445/3888 — 15 new/changed tests: 7 new in `releaseCytologyAddendum.test.ts`, plus corrections and additions across `buildCytologyOruR01Payload.test.ts`, `dispatchCytologyAmendedCaseInstance.test.ts`, and `publishReportReleasedEvent.test.ts`).

## Honest scope, unchanged
No UI trigger exists yet for either mechanism — `releaseCytologyCorrection.ts` and `releaseCytologyAddendum.ts` are both real and tested, but `CytologyScreeningPage.tsx` has no "Correct Diagnosis" or "Add Addendum" action wired to either. Still a deliberate, separate follow-up given that page's own size.
