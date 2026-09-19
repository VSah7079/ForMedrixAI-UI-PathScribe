# PathScribe Update 217 — Summary

Closes the countersign gap identified this session (PS-292 discussion): Cytology's own sign-out never routed a resident's or FPPE provisional hire's signature through the same `CountersignRecord` interception Surg Path's `useSignOutWorkflow.ts` already uses — meaning a trainee's own signature alone could finalize a case, with no attending countersign ever required or tracked.

## What changed

1. **New: `resolveResidentCountersignRequired.ts`** — extracts the real resident/FPPE decision `useSignOutWorkflow.ts` already made inline for Surg Path into a small, pure, independently-testable function: given a case's participants, the signing user, and whether they have an active FPPE supervision assignment, decides whether this sign-out must be intercepted. Deliberately decision-only — never touches `CaseStatus` or calls `countersignService` itself, so the real side effects (which differ by specialty) stay with each caller. 8 tests, covering the resident path, the FPPE path, the dual-role attending exemption on both paths, no participants, an inactive participant, and a participant record belonging to someone else.

2. **`CytologyScreeningPage.tsx`'s own `handleSignOut`** — now calls that function immediately after the existing `resolveCanSignOutCytology` gate, before any of the real finalize side-effects (5-year lookback, ROSE-discrepancy detection, peer-review flagging, histology-correlation detection) run. On a required intercept: builds a Cytology-native snapshot from the review record's own key fields (matching this module's own established "structured content, not a PDF blob" posture), calls the same real `countersignService.release()` Surg Path uses, transitions the case to `pending-countersign`, and sends the same real reviewer-notification email — resolving the reviewer from the active FPPE assignment's own supervisor, or the case's attending participant. Returns immediately after, never reaching the real `CytologySignOutRecord` creation, the `finalized` status transition, or the outbound result-queue dispatch. Everyone else (an attending, or no resident participant at all) falls through to the existing logic completely unchanged.

## Verification
`tsc` clean. Full suite: 430 files, 3723 tests, all passing (up from 429/3715 — one new test file, 8 new tests).

## Known follow-on, not addressed here
Autopsy's own PAD/FAD signing action doesn't exist in this codebase yet at all — `resolveResidentCountersignRequired` is built to be the same, shared decision function that flow should call once it's built, rather than a third, separate copy of this logic.
