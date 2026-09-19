# PathScribe Update 244 — Summary

Real fixation-duration and volume-ratio tracking, per direct request for ISO 15189 traceability ("fixative type, volume ratio, typically 10:1, and duration of fixation from specimen collection to grossing"). Record only, per direct decision — no gating or blocking behavior added.

## Real findings that shaped the design, checked before building anything

- **Half of "duration of fixation" already existed.** `SpecimenProcessing.processedAt` — "when fixative was added, the end of the cold-ischemia window... tracked per CAP/ASCO biomarker guidance" — was already real and wired, with a real, existing hard-blocking gate at sign-out (`FixativeTimeGateModal.tsx`) enforcing that this start time is documented. This update never touches that gate — it adds the missing other half: when fixation ends.
- **No structured tissue volume/weight field exists anywhere in this codebase.** Confirmed directly before designing the ratio field. A precise, computed fixative:tissue ratio isn't achievable without also building a new tissue-measurement capture mechanism — a separate, larger scope. Per direct decision, this records the real fixative volume plus a qualitative confirmation instead of a computed number.
- **The confirmation needed to be a real audit object, not a bare boolean** — per direct follow-up ("timestamp and user ID... to satisfy laboratory accreditation traceability requirements"), matching this codebase's own established {userId, userName} shape (e.g. QaActivityRecord.recordedBy) rather than inventing a new one.

## What changed

- **SpecimenContainer** gained fixativeVolumeMl?: number — the real, actual fixative volume for this specific specimen. Lives on the container (not the processing event), since it's a property of what was actually poured.
- **SpecimenProcessing** gained fixationEndedAt?: string (when tissue actually left the fixative) and fixativeToTissueRatioConfirmation?: { userId; userName; confirmedAt } (a real audit object — presence of the object IS the confirmation; there's no separate "confirmed: false" state).
- **AccessionPage.tsx**: a new "Fixative Volume (mL)" field, auto-populated from the selected container's own capacityMl (from update-243's container catalog work) when one is chosen, but never overwrites a value the accessioner already entered by hand.
- **useGrossingScreen.ts**: two new handlers, handleRecordFixationEnded and handleConfirmFixativeRatio, both reusing the hook's existing persistSpecimen save path — no new persistence mechanism invented. The ratio-confirmation handler is a real, honest no-op when there's no real, attributable signing user to record against, since an audit entry with no real user defeats its own purpose.
- **GrossingScreenPage.tsx**: real UI in the specimen header — a "Record now" action for fixation end, and a "Confirm adequate ratio" action, each replaced by its own real, recorded value (with user/timestamp) once actioned. New CSS added to pathscribe.css, matching the page's existing dark-theme conventions — checked directly that the new classes didn't already exist before adding them.

## A real mistake made and caught during this same update
The first version of the test file's own baseParams helper had a spread-order bug: a final ...overrides spread at the end silently re-overwrote the already-merged caseData with the raw, unmerged override object, dropping its id field. This caused persistSpecimen's own if (!caseData?.id) return guard to silently no-op — which one of the five new tests exposed by asserting on a call that had, in fact, never happened. Fixed by excluding caseData from the final spread once it's already been properly merged.

## Verification
tsc clean throughout. Full suite: 449 files, 3923 tests, all passing (up from 447/3913 — 10 new tests: 5 for the two new hook handlers, plus regression checks against the existing AccessionPage e2e test and GrossingScreenPage render test, both unaffected).

## Honest scope
No gating/warning is attached to any of this yet, per direct decision — a specimen can be grossed before a "reasonable" fixation duration has elapsed, or with no ratio ever confirmed, and nothing in this update stops that. This is purely the record-keeping layer.
