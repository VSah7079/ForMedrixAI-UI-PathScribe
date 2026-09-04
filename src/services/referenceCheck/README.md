# src/services/referenceCheck/

One file: `referenceCheckService.ts` — checks whether a foundational
config entity (Client, Subspecialty, Department) is still
referenced elsewhere before it gets deactivated.

Closes a real, confirmed gap noted in its own header:
`ClientDictionaryPage`'s deactivate used to just flip status with zero
check for whether Physicians, TAT entries, or Grossing Route
Overrides still pointed at it. Deliberately scoped to only the
dependency edges actually verified in the codebase — its header
explicitly notes what was checked and found to have *no* confirmed
dependents (Container Types, Stain Dictionary) rather than guessing,
and explains a real, deliberate exclusion (Governing Bodies →
Terminology Services isn't checked, since that relationship is a
static compile-time lookup table, not a live stored reference that
could go stale).

Confirmed genuinely used by 3 real components:
`DepartmentsSection.tsx`, `SubspecialtiesSection.tsx`, and
`ClientDictionaryPage.tsx`. Worth noting `checkSubspecialtyReferences`
here reads from real, live data sources (`loadRoutingRules()`,
localStorage-backed TAT entries) — confirmed it has no relationship to
the disconnected subspecialty data-source bug found and fixed
elsewhere in this review (`PRIORITY_FIXES.md` item #31); this file was
never affected by that.

**Fixed this review:** removed 3 unnecessary `any` casts
(`(p: any)`/`(o: any)`/`(e: any)` on `.filter()` callbacks) — the
underlying service results were already properly typed, confirmed via
clean compilation after removing each cast.
