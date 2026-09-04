# services/printSettings/

Admin-configurable, lab-wide default print behavior for the
label-printing feature — on-demand vs. batch, guardrail enforcement,
scan-verification requirement, and the active container label size
preset.

**Pattern:** Standard interface/mock pattern (no firestore stub yet —
mirrors `aiBehaviorService`, the closest real analog, right down to
reusing the shared `mockStorage.ts` utility every current mock service
is built on).

## Real scope, per direct follow-up on the label/cassette print-workflow
## architecture ("Structure your print settings hierarchically...")

Tier 1 (the System/Facility-wide default) has existed since this
folder was created. **Tier 2 is now real too (Workstation & Hardware
redesign, per direct guidance)** — see `IFacilityPrintSettingsService.ts`
below; the original scope note here ("a genuinely separate piece of
infrastructure this app doesn't have at all today") is what prompted
building it, not a permanent boundary. Tier 3 (voice/hotkey actions
like "print current cassette") remains real, separate, later work — a
genuinely different extension of `services/actionRegistry/`, not
touched by Tier 2.

## Files

- **`IPrintSettingsService.ts`** — the real config shape and its
  documented defaults. `defaultPrintBehavior` defaults to
  `'on_demand'`, matching the researched patient-safety
  recommendation (print as each cassette is logged, not deferred to a
  batch at the end).
- **`mockPrintSettingsService.ts`** — the real, active Tier 1 implementation.
- **`IFacilityPrintSettingsService.ts`** / **`mockFacilityPrintSettingsService.ts`**
  (+ `.test.ts`) — **New (Workstation & Hardware redesign).** Real Tier 2:
  a `FacilityPrintSettings` record is a genuine PARTIAL override
  (`Partial<PrintSettingsConfig>`), not a second full config — only the
  fields a facility has actually chosen to diverge on are ever set,
  everything else keeps inheriting Tier 1 live. At most one real record
  per facility, keyed directly on `facilityId` rather than a separate
  id an admin would have to look up. Also exports
  `resolveEffectivePrintSettings(global, override)` — a real, pure
  merge function, same "resolve at the call site, pass already-loaded
  data in" posture as `resolveTatTargetHours`/
  `shouldRandomlySampleForCodeReview` elsewhere in this app, so any
  future real consumer (not just this admin screen) can reuse the exact
  same resolution logic rather than re-implementing the merge.

## Real consumer

`components/Config/System/PrintSettingsSection.tsx` — wired into the
System tab's sidebar, alphabetically between Participation Types and
Protocol Dictionary. Verified live: every setting persists across a
real page reload. **Real, per direct guidance:** now accepts an
optional `selectedFacilityId` prop from the new Workstation & Hardware
group-level Facility Selector. With none selected, behaves exactly as
before — reads/writes Tier 1 directly. With one selected and no real
override yet, the form shows the inherited, effective values
*read-only*, with a banner ("Showing System Defaults... currently
inherits global print settings") and a real "+ Create Facility
Override" action — editing would otherwise be genuinely ambiguous
between "change the shared default for everyone" and "start a new
override," so the UI never lets that ambiguity exist. Once a real
override exists, the form becomes editable again, now writing to that
facility's own record, with a "Revert to System Default" action that
deletes it outright (not a soft-disable flag).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
