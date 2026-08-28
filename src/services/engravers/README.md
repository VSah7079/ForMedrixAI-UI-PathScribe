# services/engravers/

Real, client-side, read-only Firestore access for the two real data sources `api/webhooks/engine/` writes into from the backend side — this folder never writes anything itself. Named for the Engraver Monitor UI it was originally built for, though `fetchDispatchHistoryForCase.ts` has since grown into a second, genuinely different real use (Clinical Job History, surfaced inside `MaterialTrackingHistoryModal.tsx`).

## Files

- **`fetchEngraverDevices.ts`** — Reads the full `engraver_devices` collection (every real device, no filter) for the Engraver Monitor page (`src/pages/BatchManagement/EngraverMonitorPage.tsx`). Deliberately unfiltered by `organisationId`/`siteId` — fine for a single-tenant deployment, a real, disclosed gap before any real multi-tenant rollout (see this file's own header). **Real, disclosed gap found while writing this README**: unlike its sibling below, this file has no test at all — confirmed directly, no `fetchEngraverDevices.test.ts` exists anywhere in this repo.

- **`fetchDispatchHistoryForCase.ts`** — Reads `pending_engine_notifications`, filtered to one `caseId` and the two real event types with genuine clinical audit value (`cassette-dispatch-outcome`, `block-exception`) — deliberately excludes `material-location`, which already has its own real, working display (`MaterialTrackingHistoryModal.tsx`'s own per-item `MaterialLocation[]` timeline) and `engraver-status`, which is device-scoped, not case-scoped. Real, disclosed data limitation: `CassetteDispatchOutcomeEventPayload` only ever carries an optional `specimenLabel`, never a block-level identifier — a caller wanting to render this history per-block rather than per-case/specimen has no real way to attribute an entry to one specific block. This file's own real precondition — `cassette-dispatch-outcome.ts` persisting *every* real outcome, not just non-routine ones — is a real, deliberate decision made specifically to make this history complete; see that endpoint's own header in `api/webhooks/engine/README.md`.

## Real architectural note

Both files read `pending_engine_notifications`/`engraver_devices` directly via the client Firestore SDK — real, open reads, per the same disclosed "no real Firebase Auth yet" compromise documented in `api/webhooks/engine/README.md`'s own "Security rules" section. Neither collection has ever actually been reached by a real browser — the client-side Firebase config (`src/firebase/config.ts`) is still placeholder, confirmed directly, independent of anything in this folder.

---
*When this folder's contents change meaningfully, update THIS file.*
