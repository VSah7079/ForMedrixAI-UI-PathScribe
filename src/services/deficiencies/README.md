# services/deficiencies/

Specimen/requisition deficiency tracking and resolution — modeled deliberately on CoPathPlus's Deficiency+Resolution dictionary pattern.

**Pattern:** Two small admin dictionaries (DeficiencyType, ResolutionType) plus the actual SpecimenDeficiency records and a ManagementReview workflow.

## Files

- **`IDeficiencyService.ts`** — First concrete use: 'Could Not Match Specimen to Dictionary' at Accession order import — deliberately generic, built to extend to future deficiency types without a bespoke flag per scenario. **Updated in a later session:** `DeficiencyType` gained an optional `level?: 'case' | 'specimen' | 'both'` field — a real gap found and fixed after confirming every existing type showed up identically in both the case-level and specimen-level reporting contexts on the Accession page, regardless of whether it actually applied (e.g. "Container Damaged" showing up as a selectable option for a whole-case deficiency). Optional and defaults to 'both' when absent, so existing/unclassified data isn't silently hidden anywhere. `mockDeficiencyTypeService.ts`'s 8 seed types were classified accordingly; the admin config screen (`components/Config/System/DeficienciesSection.tsx`) grew a Level selector to manage it going forward. **Real, per direct guidance ahead of a Firestore CAPA foundation build**: `SpecimenDeficiency`/`ManagementReview` both gained an optional `organisationId` field (plus `siteId` on `SpecimenDeficiency`) — added *before* the first real Firestore document ever existed, deliberately, since retrofitting a scoping field onto already-written documents later is real, avoidable migration work. Deliberately optional: making it required would have broken every existing `raise()`/`raiseAndResolve()` call site across the app (fixative-time gate, tissue discrepancy, pre-analytic date gate, dictionary-mismatch), none of which populate it. Two new deficiency types were added alongside this — `def-block-lost`/`def-block-damaged` — and a third, `def-cassette-dispatch-failure`, for the real symmetry decision that a complete cassette dispatch failure is the same real category of non-conformity as a lost/damaged block.

## The real, Firestore-backed CAPA foundation (Aug 2026)

This folder's own `mockSpecimenDeficiencyService.ts`/`mockDeficiencyTypeService.ts` are entirely `localStorage`-backed — real for a browser, unreachable from any backend serverless function. A real Engine-reported block loss/damage or dispatch failure (`api/webhooks/engine/`) needs to raise a real, tracked CAPA record from the *backend*, which this folder alone can't do — the real reason the foundation below exists.

- **`raiseSpecimenDeficiency.ts`** (`api/webhooks/engine/_lib/`) — the real, Admin-SDK-only equivalent of `ISpecimenDeficiencyService.raise()`, writing directly to a new, real `specimen_deficiencies` Firestore collection. Deliberately scoped to `raise()` alone.
- **`fetchSpecimenDeficienciesForCase.ts`** / **`fetchGlobalDeficiencies.ts`** (both `src/services/deficiencies/`) — real, read-only client-side access to that same collection: one scoped to a single case's own deficiencies, the other the cross-case Operations/CAPA Engine queue `QualityAssurancePage.tsx` needs (`status in ['open', 'pending-verification']`, ordered by the real `raisedAt` field, capped at a real, bounded `limit`).
- **`api/qa/deficiencies/`** — the real backend equivalent of the full CAPA lifecycle (`contain`/`resolve`/`verify`/`raise-and-resolve`) — see that folder's own README for the full state-machine mapping and the real, still-open auth question.
- **`QualityAssurancePage.tsx`** now merges these real Firestore records into the same `deficiencies` list `mockSpecimenDeficiencyService.getAll()` already populated — real, existing mock-sourced records and real, new Firestore-sourced ones sit side by side. The three real mutation actions (Resolve/Contain/Verify) branch on which store a given record actually came from, routing a Firestore-sourced one to the real `/api/qa/deficiencies/*` endpoints instead of the mock service, which has no idea a Firestore-sourced id even exists.
- **Real, honest, disclosed limitation**: this is additive, not a migration. Every *existing* client-side `raise()`/`raiseAndResolve()` call site (fixative-time gate, tissue discrepancy, pre-analytic date gate, dictionary-mismatch) still writes to `localStorage` — genuinely unmigrated, real, separate future work.
- **Firestore security rules**: `specimen_deficiencies` is open-read, no-client-write (`api/webhooks/engine/firestore.rules.engine-webhooks.txt`) — same real, disclosed "no real Firebase Auth yet" compromise as every other real collection this session touched.

## Notes

- Deliberately NOT the 'unblock now, admin approves later' governance pattern used for Physician/Client/SpecimenCategory — a deficiency is a workflow event resolved by whoever has bench context, not an entity needing admin-queue deduplication.
- The *complete*, permanent historical record of `SpecimenDeficiency` data (all statuses, for compliance/inspection purposes) is surfaced separately in `pages/AuditLogPage.tsx`'s "Quality Control" tab — this services layer doesn't distinguish "active work" from "permanent record" itself, that split lives entirely in which UI queries it and how.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*