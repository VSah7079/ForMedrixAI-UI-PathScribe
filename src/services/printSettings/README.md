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

This is Tier 1 only — the System/Facility-wide default. Real,
deliberate scope boundary: Tier 2 (workstation/device-level, e.g. a
"Grossing Bench" profile that differs from "Embedding Bench") is a
genuinely separate piece of infrastructure this app doesn't have at
all today — confirmed directly, no existing config screen anywhere is
scoped below the whole org, and there's no "which physical bench is
this browser at" concept to key it off of. Tier 3 (voice/hotkey
actions like "print current cassette") is a real, separate extension
of `services/actionRegistry/`, not built here.

## Files

- **`IPrintSettingsService.ts`** — the real config shape and its
  documented defaults. `defaultPrintBehavior` defaults to
  `'on_demand'`, matching the researched patient-safety
  recommendation (print as each cassette is logged, not deferred to a
  batch at the end).
- **`mockPrintSettingsService.ts`** — the real, active implementation.

## Real consumer

`components/Config/System/PrintSettingsSection.tsx` — wired into the
System tab's sidebar, alphabetically between Participation Types and
Protocol Dictionary. Verified live: every setting persists across a
real page reload.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
