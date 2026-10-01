# services/grossing/

Grossing template routing evaluation — TYPES ONLY, deliberately.

**Pattern:** Does NOT have a mock implementation file — this is intentional, not a gap.

## Files

- **`IGrossingEvaluationService.ts`** — Its own comment explains: the real implementation is a plain function (evaluateGrossingTemplateAssignment) living in services/cases/mockCaseService.ts, matching the same pattern as evaluateSynopticAssignment. Only the types live here.
  - **NEW (August 2026)** — also holds `GrossingFitEvaluationInput`/`GrossingFitEvaluationResult`/`GrossingFitEvaluationSpecimen`, for a real, separate, later-stage evaluation: `evaluateGrossingTemplateFit` (same file in mockCaseService.ts). Real feature, per direct follow-up: "there is kind of a workflow that allows the Gross to be dictated and on submission, the AI reads the Text, and updates the template... Not sure if there is bearing here." Confirmed real bearing —
    `generateGrossingFieldSuggestionsFromDictation` already existed and already re-populates whatever template's fields it's given from the case's real dictated Gross text; what was missing was a trigger to re-evaluate which Grossing Template fits best once that real text exists (accession-time `evaluateGrossingTemplateAssignment` only ever runs once, before any dictation, from a much thinner signal). Mirrors `evaluateSynopticAssignment`'s own proven Stage 1 pattern exactly, one stage earlier in the pipeline — see `pages/SynopticReportPage/hooks/README.md` for the full, real, live-verified feature this powers.

## Notes

- Don't 'fix' this by adding a mockGrossingEvaluationService.ts — that would duplicate real logic that deliberately lives in mockCaseService.ts instead.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

## Batch 378: Complete grossing (PS-359)

`grossingCompletion.ts` (+ test):
- **`completeGrossing(case, requirements, version, deps)`** moves a case from Accessioned (or Draft) to Gross Complete. First it checks the organisation's Grossing field requirements; then it checks `case:grossing:complete` for the case's facility. Finally it saves the status and writes a "Grossing completed" audit entry. A version conflict is passed back for the page to show.
- **`missingGrossingItems`** lists what's still required, and where: specimens (A, B) or blocks (A1, A2).
- **`canCompleteGrossingFrom(status)`** says whether the case is still waiting for grossing.

Before this, no code moved a case to Gross Complete; only demo data had that status.

## Batch 379: the protocol rule, switchable per organisation (PS-359, Pete)

- **`protocol`** is a new Grossing field requirement, required by default. An organisation can switch it off in Field Requirements.
- **`completeGrossing(…, options)`**: with the rule off and specimens lacking a protocol, the first call returns `needsConfirmation` with their labels. This happens before any capability check or change. Called again with `{ confirmedWithoutProtocol: true }`, it checks `case:grossing:complete`, completes, and audits "Completed without a protocol: specimen(s) B; routed for secondary review". Then it raises an open `def-grossed-without-protocol` deficiency for each such specimen through the injected `raiseDeficiency`.
  - A deficiency that can't be raised doesn't undo the completion. The result lists it in `reviewNotRaised`, the page tells the user to raise one by hand, and a "Secondary review not raised" audit entry records it.
- **`blocksExpected(specimen)`**: the block rule applies only to a specimen with a protocol and no decants.
- **`specimensWithoutProtocol`**, **`protocolRequired`** and **`specimensForSecondaryReview`**: pure helpers the page uses to say, before completing, which specimens will be routed.
