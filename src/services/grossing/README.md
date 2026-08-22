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