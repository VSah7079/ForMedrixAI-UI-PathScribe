# PathScribe Update 258 — PS-287: Pathologist-Initiated Add-On Orders

Fourth of the confirmed PS-284 → 285 → 286 → 287 → 288 workstation-build
sequence. This update covers PS-287 in full, per direct user
confirmation: the full order builder + routing, block-exhaustion
exception + pathologist notification loop, and the real-time order
tracking dashboard — all three sub-scopes. **PS-288 remains explicitly
deferred to its own, later pass**, not bundled into this update.

## What was built

### Types & data model
- `types/case/Specimen.ts` — `StainOrder` extended with a real,
  additive PS-287 field block: `addOnPriority`,
  `orderedByPathologistId`/`Name`/`orderedAt`, `addOnPanelId`/`Name`,
  `slideMediaType`, `cuttingInstructions`, `onSlideControlTissue`,
  `routedQueueLabel`/`routedWorkflowStage`, `performingLabFacilityId`,
  `sendOutReferenceLabFacilityId`/`Name`, `blockRetrievedAt`/`By`, and a
  new `exception`/`exceptionEvents` pair (new exported
  `AddOnOrderException`/`AddOnOrderExceptionEvent` types) — a real,
  append-only audit trail for the block-exhaustion notification loop,
  same "append-only, never overwritten" reasoning PS-286's own
  `distributionEvents` already established.
- `types/case/AddOnOrder.ts` (new) — shared constants: order
  priorities, slide media types, route-queue labels, block-exception
  reasons, and `IHC_PANEL_PRESETS` — a real, small starter set of IHC
  panels (Breast, Lynch/MMR, Renal IF) built from real, existing seed
  `StainType.id`s, not a fabricated catalog.

### Pure business logic
- `utils/addOnOrderOperations.ts` (+ test, 33 tests) —
  `resolveAddOnRouting`, `resolveRoutingStations`, `createAddOnOrder`,
  `stampPerformingLab`, `computeAddOnTrackingStage`,
  `markBlockRetrieved`, `flagBlockExhaustion`,
  `resolvePathologistException`.

### UI
- `pages/AddOnOrderPage/` — new folder: the page itself (a genuinely
  new-for-this-series search/scan-an-accession landing state, since
  this is case-scoped, not block/slide-scoped), four components
  (`BlockContextPanel`, `OrderBuilderPanel`, `OrderSummaryRoutingPanel`,
  `OrderTrackingDashboard`), and
  `hooks/useAddOnOrderStation.ts`.
- `pathscribe.css` — new `.ps-addon-*` class family, matching the
  series' own dark palette/spacing.
- `App.tsx` — new route `/add-on-orders`.
- `Home.tsx` — new nav tile (`home.addOnOrderTile.*`), color checked
  against every existing tile's own color for genuine distinctness.

## Investigation done before building (confirmed, not assumed)

- `StainOrderStatus`'s real, existing lifecycle is reused as-is — the
  spec's own five-stage tracking dashboard is *derived*, never a new
  status value (`computeAddOnTrackingStage`).
- `HistologyBlock.status`'s real `'Exhausted'`/`'Lost'`/`'Damaged'`
  values (`utils/blockExceptionStates.ts`) gate new order creation and
  are exactly what the §5 exception flow's "Block exhausted" reason
  sets.
- `StainType.category` drives §3's real "Automatic Order Splitting";
  `StainType.requiresTargetControl`/`allowControlAutoAppend` drive the
  real, per-stain default for Auto-Control Pairing — never a blind
  category-wide rule.
- Per this ticket's own direct Jira comment: routing resolves through
  the real `SCAN_STATION_WORKFLOW_STAGES`/`ScanStation.facilityId`
  backbone, scoped to the case's own real performing lab
  (`resolveCasePerformingLab`, `services/cases/casePoolAssignmentService.ts`)
  — never an enterprise-wide queue.
- `FacilityRole`'s real, existing `'reference_lab'` role is reused
  directly for the Reference/Send-Out Lab picker. No per-performing-lab
  preferred-lab mapping exists — a real, honest scope note, not
  fabricated.
- `MolecularOrderOutboundQueueEntry`'s real dispatch queue is confirmed
  scoped to protocol/reflex triggers only — deliberately **not** reused
  for a pathologist-initiated add-on order.
- `def-insufficient-volume` confirmed the wrong fit for block-exhaustion
  exceptions. **Deliberate decision**: no new `SpecimenDeficiency` type
  added — the order's own new `exception`/`exceptionEvents` fields
  already give a complete, real audit trail without the real, app-wide
  cost of a `DEFICIENCY_TYPE_VERSION` bump.

## i18n

Built with `useTranslation()`/`t()` from the start (new page). New
`addOnOrder.*` namespace plus `home.addOnOrderTile.*`, across all five
locale files (en/fr/de/nl/ko). Verified programmatically — not by eye:

- All five locale files parse as valid JSON.
- All five have **identical key sets**: 810 leaf keys total per file, 75
  of them under `addOnOrder.*`/`home.addOnOrderTile.*` combined, matched
  exactly across every locale.

## READMEs updated in the same pass

- `pages/AddOnOrderPage/README.md` (new)
- `pages/README.md` (new subfolder-index row)
- `i18n/README.md` (new "Seventh real conversion" entry)
- `services/cases/README.md`, `services/communications/README.md`,
  `services/facilities/README.md`, `services/scanStations/README.md`,
  `services/stains/README.md` (new real-consumer notes)

## Validation

- **`npx tsc --noEmit -p .`**: completely clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **468/468 test
  files, 4108/4108 tests passing, zero failures** (same harmless
  `ECONNREFUSED 127.0.0.1:3000` stderr noise as every prior run this
  session, unrelated to test pass/fail).
- New tests, `addOnOrderOperations.test.ts`: **33/33 passed.**

### Known project gotcha (re-encountered, not new)

Two more `if (!result.ok) { ... result.error }` sites (in
`useAddOnOrderStation.ts` and `AddOnOrderPage.tsx`) failed to narrow
under this project's `strictNullChecks: false` — same class of failure
documented in `services/reports/README.md` and hit in every prior
ticket this session. Fixed the same way: an explicit type cast
(`(result as { ok: false; error: string }).error`) at each site.

## Deliberate scope cuts

- **§5's own "tech flags at microtome" step is real and working, but
  surfaced on THIS page**, not wired into the already-shipped
  `MicrotomyWorkstationPage` (PS-284)'s own live cutting flow — that
  cross-page integration is real, separate follow-up work. The
  pathologist's own response (cancel/modify/approve destructive cut)
  lives in this page's own Order Tracking dashboard, which doubles as
  the spec's own "LIS inbox."
- No new `SpecimenDeficiency` type (see Investigation above).
- No admin-manageable IHC panel dictionary — a real, small starter set
  only.
- No per-performing-lab preferred reference lab default.
- "Digital signature" is the real, authenticated actor identity already
  stamped on submission — no separate e-signature mechanism exists to
  reuse or fabricate one for.
- **PS-288 remains fully deferred** — not started, not bundled here.

## Next

PS-288, per direct user confirmation, as its own separate pass. Then:
physical foot-pedal integration, per direct instruction received
earlier in this session (still pending re-confirmation of sequencing
now that PS-288 itself is deferred — flagged for the user, not assumed).
