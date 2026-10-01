# services/delegationTypes/

Case delegation type dictionary (Peer Review, Second Opinion, Subspecialty Referral, MDT Discussion).

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- **Real bug found and fixed**: `add()`'s own `id` used to be silently
  discarded and replaced with `'CUSTOM_' + Date.now()`, regardless of
  the real, validated, label-derived id the admin saw and could edit
  on screen in `DelegationTypeSection.tsx`'s own form — the on-screen
  "ID already exists" check was validating a value that then never
  actually got saved. Fixed in both `mockDelegationTypeService.ts`
  (confirmed live) and `firestoreDelegationTypeService.ts` (fixed for
  consistency — not live-tested, no real backend active yet; that
  file's own header already flags it as a stub pending cutover). The
  Firestore fix specifically needed `setDoc(doc(db, COL, id))` rather
  than just changing what `add()` returns — using `addDoc`'s own
  auto-generated key while returning a different id back to the
  caller would have created a real, silent mismatch where a later
  `getById()` for that same id couldn't find the document. `id` is
  now a real, optional override on `add()` — used when the caller
  provides one, auto-derived as a fallback when not.
- `performingLabFacilityId?: string` — real, per direct request:
  "Include Performing Lab." Same field-name convention and same
  null/undefined = inherit/global shape as
  `ContainerType.performingLabFacilityId` (see
  `services/containerTypes/README.md` and PS-75 for the full,
  standard account of this pattern). `label` and `id` uniqueness
  (`DelegationTypeSection.tsx`, via `utils/validateUnique.ts`) are
  both scoped by this field as a compound key — checked only within
  the same lab's own scope, per direct confirmation, matching
  `ContainerTypesSection.tsx`'s own established convention exactly.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*