# PathScribe Update 251 — Summary

The two TAT-critical pieces named directly as still missing at the end of update-250: loading a specific action group, and a default action auto-firing on the next scan. Both real, working, tested — the full PS-289 "Workstation Groups & Hardware-Bound Action Routing" runtime experience described in the workflow diagrams is now actually implemented end to end.

## Piece 1 — loading a specific action group

- New `mockActionRegistryService.setCurrentActionGroupActionIds()`, and a fourth, independent "OR" branch on `getEligibleActions()` — an action whose own id is a member of the current station's resolved action-group bundle is eligible, on top of (never instead of) the existing category/context/stationProfiles rules. Genuinely separate from `stationProfiles` matching: a curated, named bundle can deliberately cut across categories or functional areas, which a single `functionalArea` tag can't express.
- `NavBarScanStation.tsx` extended: on station selection, alongside the existing `functionalArea` resolution, it now also resolves the group's `defaultActionGroupId` + `allowedActionGroupIds` into their real `ActionGroup` records, flattens their `actionIds`, and pushes the result in — automatically, the same zero-step posture as the functional-area piece.

## Piece 2 — default action fires on the next scan

The real scan architecture was investigated directly before building this, rather than assumed, since a wrong design here could misfire during real clinical work:

- Confirmed the real, established pattern: a global PATHSCRIBE_SCAN window event, already consumed by useGlobalStationSwitch.ts (station barcodes) and useGlobalMaterialScanTracking.ts (material barcodes) — not React state via useScanner().
- Confirmed the real, minimal exclusion posture every existing global scan consumer already uses: a STATION:-prefixed scan is always excluded first (left entirely to the station-switch listener), and exactly one route — the Disposal Queue — is excluded, since scanning there already means "dispose this." No broader, speculative exclusion list was invented; this update matches that same, already-proven risk posture rather than adopting a more restrictive one of its own.
- Deliberately does NOT require the scan to resolve to a specific case/material first (unlike the material-tracking hook's own resolveMaterialFromScan() gate) — per the original spec's own broad framing ("triggers automatically on barcode scans... when operating on that bench"), a default action is a general catch-all for whatever gets scanned at that bench, not conditioned on a specific resolution succeeding.
- New useDefaultActionOnScan() hook: resolves station -> group -> defaultActionId fresh inside the scan handler itself (same re-fetch-per-scan posture as the material-tracking hook, avoiding a stale cached action surviving a station switch), then fires it via executeAction() if the action exists and is genuinely active. Mounted via a new DefaultActionOnScanBridge, alongside the existing MaterialScanTrackingBridge, in both real route groups in App.tsx.

## A real mistake caught and fixed while testing
The first version of the new hook's own test file had 2 failures — not from the hook's logic, but from stale PATHSCRIBE_SCAN listeners surviving across tests. Each renderHook() call mounts a new listener; without an explicit cleanup() between tests, later tests accumulated listeners from earlier ones, each firing on every subsequent scan. Fixed by adding afterEach(cleanup), matching the exact pattern useGlobalStationSwitch.test.ts already established for this same, real class of hook.

## Verification
tsc clean throughout. Full suite: 456 files, 3978 tests, all passing (up from 455/3967 — 11 new tests: 4 for the action-group eligibility branch, 7 for the default-action-on-scan hook).

## Honest scope
This completes the runtime mechanics described in the PS-289 design. Still not built: the qcEnforcementMode gating logic itself (the Stain QC Module's own Gating Strategy work), and PS-284/285/286's own dedicated bench pages (dedicatedPageRoute remains a real field with nothing yet to point to).
