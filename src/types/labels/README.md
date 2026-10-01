# types/labels/

Real, human-facing label identifiers and physical label-size presets — the shared vocabulary every label-printing feature in the app builds on.

## Files

- **`LabelData.ts`** (+ `LabelData.test.ts`) — the identifier-building functions every physical label uses: `cassetteIdentifier`, `slideIdentifier`, `decantIdentifier`, `decantSlideIdentifier`, `matrixBlockIdentifier`, and the `SecondaryLabelData` shape used by the barcode-unreadable fallback-overlay-label feature (block and decant secondary labels both use it).
- **`LabelSizePreset.ts`** (+ `LabelSizePreset.test.ts`) — real, named physical label sizes (e.g. CLSI AUTO12 standard specimen, the LabTAG-sized `histology_secondary_overlay` fallback overlay), each with a default barcode symbology (2D for small labels, Code 128 for larger ones/requisitions).

## Notes

- `histology_secondary_overlay` is reused for both block and decant secondary labels — a decant container is a physically different object from a cassette, but the real problem (an unreadable pre-existing barcode) and fallback (a fresh adhesive overlay sticker) are identical, so there's deliberately no second, decant-specific preset.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
