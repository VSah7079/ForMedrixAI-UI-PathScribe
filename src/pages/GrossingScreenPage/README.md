# pages/GrossingScreenPage/

**NEW (Sep 2026)** — Protocol-Driven Workflow Infrastructure story, Part 3. "New workflow surface between accessioning and sign-out. The grossing tech operates here; the pathologist does not." A deliberately separate, dedicated page from `SynopticReportPage.tsx` (the pathologist's own reporting surface) — reuses the exact same real `Specimen`/`HistologyBlock`/`StainOrder` data model, not a parallel schema.

**Route**: `/case/:caseId/grossing`, using the same `synopticLoader` (`loaders/synopticLoader.ts`) as `/case/:caseId/synoptic` — a grossing tech needs the same real pediatric/orchestration access checks a pathologist does. Reachable today via a "Open Grossing Screen" button on `SynopticReportPage.tsx`'s own Material tab.

## Files

- **`GrossingScreenPage.tsx`** — the page itself: protocol header (name, version from `Specimen.protocolSnapshot`, a "Protocol Modified" badge when any block has `userModified: true`), a histology block table (Block ID · Piece Count · Stains · Status · Actions), a separate cytology decant table (Slide ID · Stain · Imager Batch · FOV Count, cross-referenced live against `batchService.getAll()`'s own items by `displayId`), Add/Remove Block, Add/Remove Stain (with the confirmation dialog for removing a protocol default), and a collapsible per-specimen audit panel.
- **`hooks/useGrossingScreen.ts`** — wraps `utils/grossingScreenOperations.ts`'s pure functions with real `caseRouter.updateCase` persistence and concurrency-conflict retry, same shape as `SynopticReportPage/hooks/useSpecimenBlockManagement.ts`'s own write handlers.

## Related files elsewhere

- **`utils/grossingScreenOperations.ts`** (+ `.test.ts`) — the pure, tested business logic: `addGrossingBlock` (another instance of a given `ProtocolPathway`'s own defaults), `removeGrossingBlock` (Pending-only), `addGrossingStain`/`removeGrossingStain` (confirmation + audit log only for removing a protocol default — removing your own addition needs neither), `updateGrossingPieceCount` (always logged).
- **`types/case/Specimen.ts`** — `StainOrder.userAdded`, `HistologyBlock.userModified`, `Specimen.grossingOverrides?: SpecimenGrossingOverride[]` (field/blockLabel/originalValue/newValue/actor/timestamp — the audit panel's own real data).

## Notes

- Built with `useTranslation()` from the start (new page, per `i18n/README.md`'s rule #1) — every visible string in `GrossingScreenPage.tsx` goes through the `grossingScreen.*` locale namespace, across all 5 languages.
- Deliberately does NOT reuse `BlockStainEditorModal.tsx` (the pathologist-facing, 1,300+ line general block/stain editor) — that modal has no `allowedAdditionalStainTypeIds` filtering and no override-audit logging, and retrofitting either into an already-large, delicate file risked real regressions to working pathologist-facing behavior for a genuinely different real user (the grossing tech).
- Does NOT reuse `useSpecimenBlockManagement.ts`'s own `handleAddBlock` — that handler always defaults to a single H&E stain (the real, correct behavior for a pathologist manually ordering an ad-hoc recut), not the protocol-pathway-aware defaults this story's own Add Block needs.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`GrossingScreenPage.tsx`: the page title, which names the accession, is tagged.

## Batch 378 (PS-359)

- **Complete grossing** bar under the title:
  - While the case is waiting for grossing, it offers **Complete grossing** (a `CapabilityButton` for `case:grossing:complete`, greyed out until nothing is missing) and lists what's still required, e.g. "Piece count (A2)".
  - After completion it shows "Grossing completed".
  - Past grossing, it says so.
- **Voice and keyboard:** the page sets the new `GROSSING` voice context and listens for `GROSSING_COMPLETE` ("complete grossing", "finish grossing", "grossing done", with French, German, Dutch and Korean phrases; Alt+Shift+F9). The service decides, exactly as for the button.
- `hooks/useGrossingScreen.ts` loads the Grossing requirements and calls `services/grossing/completeGrossing`.

## Batch 379 (PS-359): completing without a protocol

- **Before completing**, when the organisation has switched off the protocol rule, the Complete grossing bar says which specimens have no protocol and will be routed for secondary review.
- **Complete grossing** then asks for confirmation: "Completing specimen without an attached protocol. This case will be routed for secondary review." (Pete's wording), naming the specimens. The confirmation can be answered by button, voice ("confirm complete grossing" / "cancel complete grossing") or keyboard (Alt+Shift+F10 / Alt+Shift+F11).
- **After completing**, the bar says which specimens were routed. If a routing deficiency couldn't be raised, it says so and asks the user to raise one by hand.
- **Converted on touch:** the fixation fields' labels and buttons ("Fixation ended:", "Record now", "Confirm adequate ratio", "Raise deficiency", "Deficiency raised", the ratio confirmation line) were English-only, and the ratio line showed a literal `\u2014` instead of a dash. They now go through `t()` in all five languages, and those dates, plus the override audit's, use `formatDateTime` in the user's language. A failed block removal shows a translated message instead of the service's English error. These strings should have been converted in Batch 378, when this page was last edited.
- Completion runs one attempt at a time, so a double click or a repeated command can't start a second attempt against the same case version.
- `hooks/useGrossingScreen.ts`: `secondaryReviewSpecimens`, `pendingProtocolConfirmation`, `confirmCompleteWithoutProtocol`, `cancelCompleteWithoutProtocol`, `completionReview`; the decisions stay in `services/grossing/`.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
