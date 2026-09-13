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

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
