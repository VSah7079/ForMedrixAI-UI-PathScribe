# types/assetLocation/

Entry shape for the governed physical/asset location dictionary — see `services/assetLocation/README.md` for the real service built on top of this and the full reasoning for why it exists.

## Files

- **`AssetLocationEntry.ts`** — `locationType` (`'building' | 'room' | 'storage_unit' | 'storage_slot' | 'workstation' | 'archive_shelf' | 'other'`) plus real, optional `parentLocationId` hierarchy. Follows `Department`'s/`Physician`'s exact governance shape (`status: 'Active' | 'Inactive' | 'Unverified'`, `autoCreated`/`autoCreatedAt`/`autoCreatedNote`) rather than inventing a new one.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
