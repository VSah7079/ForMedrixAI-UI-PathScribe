# services/cassetteColors/

The real color dictionary — White, Blue, Red, Pink, Green/Mesh, Yellow, and any admin-added colors — that `services/cassetteRouting/`'s rules reference by key. Fully admin-manageable through Configuration → Cassette Colors: an admin can add a genuinely new color (name, hex, fallback policy) without any code change, and every routing rule referencing it updates automatically.

**Pattern:** Standard interface/mock pattern (no firestore stub currently).

## Files

- **`ICassetteColorService.ts`** — the contract: `CassetteColorDefinition` (id, key, displayName, hexCode, `fallbackBehavior`: `'auto' | 'prompt'`, `fallbackColorId`, active).
- **`mockCassetteColorService.ts`** — the real, active implementation, `localStorage`-backed. Seeds White (prompt-only fallback, deliberately never auto-substitutes — see the file's own header for why), Blue/`COLOR_BIOPSY`, Red/`COLOR_STAT` (prompt fallback — a STAT case should never silently lose its urgent visual signal), Pink/`COLOR_RUSH`, Green-Mesh/`COLOR_CELLBLOCK` (prompt fallback — a fragile cell block silently substituted into a non-mesh cassette risks real material loss), Yellow/`COLOR_SMALL_BIOPSY`.

## Notes

- Fallback policy lives on the color itself, not on each rule that references it — "what to substitute for Blue" is a real property of Blue, not something every individual rule should decide separately.
- `color-pink`/`COLOR_RUSH` is seeded but, as of this writing, has zero real routing rules pointing at it — it exists as an available option, not because any current rule uses it. Confirmed directly before adding the separate `COLOR_SMALL_BIOPSY` (Yellow) rather than repurposing Pink, which would have been misleadingly labeled.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
