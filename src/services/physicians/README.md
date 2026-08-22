# services/physicians/

Physician directory — referring/ordering physicians.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Uses the same medical-grade name schema (givenNames/familyNames/prefix/suffix) as Patient — see utils/personName.ts.
- **`physicianCode` (PS-73)** — required, globally unique, independent of NPI. NPI stays optional (confirmed: not every physician has one, e.g. UK physicians) and its own uniqueness is only checked when present. Both checks live in `PhysiciansSection.tsx`'s own modal (`utils/validateUnique.ts`'s `findDuplicate`), same convention as every sibling dictionary's required+unique field — not enforced here at the service layer. `findOrCreateByNpi`/`findOrCreateByName` (intake auto-create) generate a placeholder `'AUTO-' + Date.now()` code, same convention already used for `id`, since a real code isn't knowable at intake — staff replace it once the record is verified.
- **Duplicate (PS-73)** — deliberately does NOT use the generic `utils/duplicateEntry.ts` `prepareDuplicate()` used by config-item dictionaries (Stain Types, Container Types, etc.). A physician is a real person, not a reusable config entry, so `PhysiciansSection.tsx` uses the new `preparePersonDuplicate()` (same file) to clear identity/direct-contact fields (name, NPI, physicianCode, phone/fax/email) while preserving organizational context (specialty, `clientIds`, `preferredContact`) as a real starting template.
- **No separate Performing Lab field (confirmed, not assumed, re: PS-75)** — `clientIds[]` is the existing multi-facility affiliation model and is the right mechanism here; it's deliberately unfiltered by `FacilityRole` (unlike `getActivePerformingLabs()`, filtered to `role: 'performing_lab'`) since a physician can validly submit to several ordering/submitting facilities at once. This is a different cardinality than `ContainerTypesSection.tsx`/`DelegationTypeSection.tsx`'s own PS-75 `performingLabFacilityId` (a single field scoping one dictionary entry's ownership+uniqueness to one lab) — adding that field here would model the wrong relationship.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*