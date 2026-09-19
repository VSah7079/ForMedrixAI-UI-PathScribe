# types/footPedal/

Hands-free peripheral control config — originally built for sign-out dictation (`SynopticReportPage.tsx`), the one part of that spec's "Peripheral Integration" section confirmed to not exist at all at the time. **Real fix (Sep 2026):** the same 3 real pedal-position bindings are now reused, contextually, across `MicrotomyWorkstationPage.tsx` (Pedal 2 — Print/Etch Next, PS-284's own named trigger) and `EmbeddingStationPage.tsx` (Pedal 1 — piece-count confirmation, PS-285's own named trigger) too — a physical pedal is bound once per workstation (`useFootPedal.ts`), not per page, and both of those bench pages had previously (incorrectly) disclaimed foot-pedal support as unreachable from a browser.

## Files

- **`FootPedalConfig.ts`** — pedal-to-action mapping (Pedal 1/2/3, action keys kept stable across pages; see `FOOT_PEDAL_ACTION_LABELS`'s own doc comment for the full, real per-page mapping).

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
