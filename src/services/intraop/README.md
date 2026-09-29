# services/intraop/

Intraoperative Pre-Check queue — bench-side capture (frozen section, quick gross) before formal LIS accession arrives.

**Pattern:** Explicitly documented as following 'the same interface+implementation split every other service in this app follows.'

## Notes

- Session/specimen split: one session = one patient/OR/surgeon; addMilestone/setFrozenSectionDiagnosis operate on individual specimens within a session, since different specimens in the same session can be at different workflow points.
- **Real fix:** `IntraopSpecimen.frozenDiagnosisRenderedAt` — new field, set at `setFrozenSectionDiagnosis`. Closes a real gap for FROZEN_SECTION TAT calculation (`components/Contribution/qualityCalculations.ts`): the `milestones[]` array already had a real `frozen_section_cut` timestamp, but nothing captured when the diagnosis itself was actually rendered, so no true interval could be computed.
- **Real bug found and fixed, same investigation:** the one seed entry with genuinely detailed frozen-section data (`intraop-004`, the thyroid case) had `mergedIntoCaseId: 'O26-0027'` — a case ID that doesn't exist anywhere in `services/cases/mockCaseService.ts`. Since `computeFrozenSectionOutliers` cross-references entries to a real `Case` via this field, this entry could never have actually matched anything, regardless of what timestamp data it carried. Retargeted to a real, existing seed case (`S26-4403`).
- **Real bug found and fixed (Aug 2026), while auditing `AccessionPage.tsx`'s frozen-section auto-match flow:** `findEntryMatchesForCase()`'s fuzzy-match branch (same surname + same surgeon + within 90 minutes) built its `matches` array but never sorted it before returning. `AccessionPage.tsx` takes `matches[0]` as the auto-suggested merge target when a new case is accessioned — in a busy OR, it's realistic for the same surgeon to have more than one pending frozen section with the same surname in the same 90-minute window, so an unsorted result meant the suggested merge could silently be the wrong specimen record, not just a suboptimal one. Sorted by confidence first (high before medium), then by closeness in time within the same tier.
- **Same real bug, found independently auditing `IntraopQueuePage.tsx`:** `findMatchCandidates()` (the reverse direction — from a pending intraop entry, finding candidate cases to merge into) had the identical unsorted-array pattern. Lower severity than the fix above — `IntraopQueuePage.tsx`'s `openMerge()` presents this as a human-reviewed list (`MergeModal`), not an auto-picked `[0]` — but a reviewer should still see genuinely better matches first, not an arbitrary insertion order. Same fix applied.
- **Real feature, per direct confirmation: "Let's wire in Facility and Location (Room) for Intraop."** `IntraoperativeEntry` gained `clientId`/`clientName`/`locationId`/`locationDisplay` — same pattern as `Case.order`'s own fields (`types/case/Case.ts`), cached display strings resolved once at `createSession` rather than looked up on every render. Both are optional: a session can genuinely be started before the facility/location is known (barcode-only identification with no ADT match is the normal path here, not an edge case — see `PatientMatchInfo`). Captured once per session alongside OR/surgeon, not per specimen, since every specimen under one session comes from the same OR. `IntraopQueuePage.tsx`'s capture form gained two new dropdowns (facility, then a facility-scoped location list — same reload-on-facility-change pattern as `AccessionPage.tsx`), and both display surfaces (the active-session banner, the Pending Match queue card) show the resolved names once set.
- **New, real consumer (Sep 2026)**: `services/intraopDashboard/` — the RFP-APLIS-2026-GLOBAL Intraoperative/Frozen Section Dashboard reads this folder's own `IntraoperativeEntry`/`IntraopSpecimen` data directly (via `resolveActiveIntraopRequestsForLocations.ts`), filtering by the `locationId`/`arrivalTimestamp`/`frozenDiagnosisRenderedAt` fields already established above. That real-time, OR-facing dashboard is a genuinely separate module (its own README) — this folder's own real scope stays bench-side pre-check capture.

## Live updates (Batch 342, PS-262)

Every write in `mockIntraoperativeService.ts` announces itself (`announceIntraopChange`) to `services/liveUpdates/localLiveUpdateService.ts`, standing in for the API server, which will publish after each commit. The writes and the events they send:

| Write | Event |
|---|---|
| `createSession` / demo seeding | `session.created` |
| `addSpecimen` | `specimen.added` |
| `addMilestone`, `addPreparationOutput`, `addDigitalAsset` | `specimen.progressed` |
| `setFrozenSectionDiagnosis` | `diagnosis.rendered` |
| `recordVerbalReport` | `verbal.reported` |
| `dismissFromBoard` | `specimen.dismissed` |
| `merge` | `session.merged` |

Events carry ids only (session, specimen, location, facility), never patient data.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*