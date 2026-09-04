# components/Config/Integrations/

**Real, current status: fully retired, per direct confirmation.** This
folder held its own `index.tsx` orchestrator (tab shell + section
router) from a real, confirmed PS-85 reorg that moved 11 sections
here as their own major tab. Per direct follow-up, reversed: all of
those sections now live exclusively under `Config/System/index.tsx`,
as a real, named sixth group ("Integrations") in that file's own
existing group-tag pattern — not restored to the old, ungrouped flat
list they lived in pre-PS-85.

**Real, honest history.** This file previously (twice) claimed the
reversal above was complete when it wasn't — `index.tsx` was still
genuinely live, still importing/routing to `LISSection.tsx`/
`IdentifierFormatsSection.tsx`/`FacilitySetupSection.tsx`/
`CrosswalkSection.tsx`, meaning this folder functioned as a real,
duplicate top-level Configuration tab for far longer than any prior
account here admitted. Found and corrected in two passes: first, the
three genuinely dead files (already-migrated-elsewhere data, confirmed
via a whole-app consumer search — `Config/System/README.md`'s own
correction has the full account) were deleted and `index.tsx` updated
to stop importing them. Second, per direct confirmation, the reversal
was finished properly — `CrosswalkSection.tsx` (a real, live, still-
needed screen, never dead) moved back to `Config/System/` alongside
the seven sections that were already there, `Config/System/index.tsx`'s
own import updated to the local path, and `index.tsx` itself finally,
genuinely deleted.

This folder now holds nothing but its own README — kept as the
historical record of this reorg-and-reversal, not deleted itself,
since a future reader hitting a broken import to this path deserves
the full account of where things went and why, not just a 404.

## Notes

- `RvuCodeMapSection.tsx` and `BillingDictionarySection.tsx` were never here — always stayed in `Config/System/` directly, billing/coding rules rather than external-system connectivity.
- **HL7/FHIR Segment Mapping deliberately has no nav entry anywhere** — confirmed directly: PS-81 built the real provider-resolution engine, never an admin UI for it. Not an oversight if it's missing when this file is next read.

---
*See [components/Config/README.md](../README.md) if one exists for how this folder fits the whole Config/ layer.*
*When this folder's contents change meaningfully, update THIS file.*

## Notes

- `RvuCodeMapSection.tsx` and `BillingDictionarySection.tsx` were never here — always stayed in `Config/System/` directly, billing/coding rules rather than external-system connectivity.
- **HL7/FHIR Segment Mapping deliberately has no nav entry anywhere** — confirmed directly: PS-81 built the real provider-resolution engine, never an admin UI for it. Not an oversight if it's missing when this file is next read.

---
*See [components/Config/README.md](../README.md) if one exists for how this folder fits the whole Config/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
