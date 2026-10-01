# services/protocols/

Standalone processing-protocol dictionary (e.g. 'Standard Small Biopsy — 1 block, 1 H&E') — deliberately NOT embedded per specimen type.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Real lab reasoning documented inline: wildly different specimen types often share identical workflows; embedding would mean editing every specimen type individually when a shared routine changes. SpecimenEntry carries only a protocolId reference.

## Protocol-Driven Workflow Infrastructure additions (Part 1)

Additive-only fields supporting the Grossing Screen and outbound molecular order queue — no existing Protocol needs any of these to keep working exactly as before:

- `ProtocolPathway.defaultCount?: number` — how many blocks/decants this pathway generates at accession (`generateDefaultMaterial.ts`). Undefined = 1, same as before this field existed.
- `ProtocolPathway.defaultPieceCount?: number` — pre-populates `HistologyBlock.pieceCount` on each block this pathway generates.
- `ProtocolPathway.allowedAdditionalStainTypeIds?: string[]` — restricts the Grossing Screen's per-block "Add Stain" dropdown to this subset of the Stain Dictionary. Undefined = no restriction.
- `PathwayTask.sendOutboundOrder?: boolean` — fires an `order.molecular` outbound queue entry at accession for this task's assay (see `services/molecularOrders/`, Part 2b).
- `Specimen.protocolSnapshot?: { id, version, name }` (types/case/Specimen.ts) — locked at the moment `generateDefaultMaterial.ts` resolves the protocol for a specimen. A later edit to the master Protocol never retroactively changes what an already-accessioned specimen shows on the Grossing Screen.

## Protocol-Driven Workflow Infrastructure additions (Part 2c)

`Protocol.requiresTriage`/`Protocol.triageChecklist` already existed before this story — what was missing was a real, enforced consumer. `generateDefaultMaterial.ts` now initializes `Specimen.triage` (types/case/Specimen.ts, `SpecimenTriage`) at accession whenever the resolved protocol has `requiresTriage: true`, copying `triageChecklist` into per-item `{ item, confirmed: false }` entries. `useSpecimenBlockManagement.ts`'s `handleReleaseGrossingBlocks` refuses to release a block on a specimen with an incomplete, non-overridden `SpecimenTriage` — a real, hard gate, not just a disabled button (see `services/README.md`'s `types.ts` entry for the real `'error' in x` narrowing idiom this whole area follows). `GrossingReleasePanel.tsx` (`pages/SynopticReportPage/components/`) is the primary UX: an inline, per-item checklist plus a fast override-reason path. `PendingGrossingTriageTile.tsx` (`pages/WorklistPage/`) surfaces every case with a genuinely still-pending triage so they don't sit silently.

## Protocol-Driven Workflow Infrastructure additions (Part 3)

The Grossing Screen (`pages/GrossingScreenPage/`) is the real UI consumer that finally exercises `ProtocolPathway.defaultCount`/`defaultPieceCount`/`allowedAdditionalStainTypeIds` end to end (all three added, but unconsumed, in Part 1). Add Block generates another instance of a chosen pathway's own defaults; Add Stain's dropdown is filtered to that block's own pathway's `allowedAdditionalStainTypeIds`; the protocol header reads `Specimen.protocolSnapshot` directly, never the live Protocol record, so an edit to the master Protocol after accession never changes what an already-accessioned specimen shows. See `pages/GrossingScreenPage/README.md` for the full page account, and `utils/grossingScreenOperations.ts` for the pure, tested business logic behind Add/Remove Block and Add/Remove Stain.

## PS-73/PS-75 — name-uniqueness + Performing Lab scoping

`Protocol.name` had no uniqueness check anywhere — the editor's Duplicate
button (`ProtocolDictionarySection.tsx`) could save a clone (or any edit)
under a name that already existed. Real, confirmed justification before
adding it: this same file's own spreadsheet round-trip already treats
`name` as a de facto unique key when matching import rows back to
existing protocols.

While already in this file for that fix, also added `performingLabFacilityId?: string`
(same "fixture" scoping every other config dictionary gets —
`utils/performingLabs.ts`) — undefined/global by default, settable to
scope a protocol to one performing lab. Real reasoning, not just
pattern-following: processing protocols (fixation, embedding, track
structure) genuinely vary by performing lab in a real multi-site
enterprise, same as any other dictionary this scoping already covers.

Uniqueness is the compound key `(performingLabFacilityId, name)` —
`utils/validateUnique.ts`'s `findDuplicate()`, same shape as
`ContainerTypesSection.tsx`/`CrosswalkSection.tsx` — so the same protocol
name can exist once globally and once more per lab without colliding.
The spreadsheet import/export round-trip has no Performing Lab column
(same limitation as the internal id — the sheet is a flat, human-readable
format), so every imported row is always treated as global; the import
match was scoped accordingly (`!p.performingLabFacilityId && ...`) so a
re-import can't silently collide with or overwrite a lab-specific
protocol that happens to share a name with a global one.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*