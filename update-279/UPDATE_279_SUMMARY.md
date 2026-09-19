# Update 279 — Implementing your three PS-73/75 rulings

Your verdicts on all three items flagged in Update 278, implemented — plus one important
correction and one significant gap surfaced along the way that changes what "done" means for
the sign-out-authority item specifically. Read that section before treating it as finished.

## 1. CassetteColorsSection — facility context in the Engine dispatch payload

**What changed**: `utils/evaluateCassetteRouting.ts`'s `ResolvedCassetteColor` (the real,
documented "minimal shape a resolved color the Engine actually needs") now carries
`performingLabFacilityId` alongside `key`, `colorId`, `displayName`, `hexCode`. Its doc comment
states your mandate directly: any real future Engine dispatch must include facility context
alongside `key`, never transmit the bare key alone.

**One thing worth knowing, not a pushback on the ruling itself**: I checked directly whether
there's a live vector for the mislabeling risk you described, and there isn't — yet. Confirmed:
- Both real production callers (`resolveBlockCassetteColor`, `resolveDecantCassetteColor`) only
  ever take `.primaryColor.colorId` off this result and discard everything else — no code
  anywhere reads or transmits `.key`.
- `Material.cassetteColorId` (what actually gets persisted onto a case) stores that same safe,
  internal `colorId`, never the bare `key`.
- There is no real "dispatch to the Engine" call anywhere in this codebase — `evaluateCassetteRouting.ts`'s
  own header is explicit that Command Transmission is "the real, separate Engine layer,"
  something PathScribe doesn't build.

So today there's nothing to actually mis-route. What I did is make sure the fix is already in
place the moment someone *does* build that Engine integration — the facility id is right there
on the resolved payload, so there's no excuse to reach for the bare key alone when that work
happens. If you already have a concrete Engine-integration timeline, it'd be worth confirming
directly with whoever builds that side that they consume `performingLabFacilityId`, not just
`key`, once it exists.

## 2. SubspecialtiesSection — ID-based, facility-scoped specimen linking

**What changed**:
- `SpecimenEntry` (`specimenDictionary/specimenTypes.ts`) gets a new `subspecialtyId?: string` —
  the real FK into `Subspecialty.id`. The old `subspecialty?: string` field stays, but is now a
  derived display/back-compat cache only, kept in sync with the linked record's current name —
  never independently free-typed again.
- `SpecimenDictionarySection.tsx`'s Subspecialty field changed from a free-text input with a
  datalist to a real `<select>` bound to the id. Opening an old entry that only has the legacy
  name back-fills the real id via a one-time best-effort name match, so re-saving it migrates
  it onto the FK without you having to notice or re-pick anything.
- `SubspecialtiesSection.tsx`'s specimen-linking logic (`openEdit`, the deactivation
  reference-check, `commitSave`'s specimen assignment writes, the row's specimen count, the
  "currently in X" conflict label) all switched to a shared `specimenBelongsToSubspecialty()`
  helper: id match first, legacy name match only as a fallback for an entry that hasn't been
  migrated yet.
- The CSV import path resolves `subspecialtyId` by a best-effort name match against the live
  subspecialty list, same "spreadsheet has no id column" limitation and precedent as Protocol
  Dictionary's own PS-75 import (Update 273).

**Also reverted, now that the real gap is fixed**: PS-73 name uniqueness on Subspecialty itself
is back to the *standard* compound-scoped check (`performingLabFacilityId` + `name`, same as
every other lab-scoped dictionary), not the global-only rule from Update 278. That global
restriction existed specifically because bare-name linking made two same-named subspecialties
across labs ambiguous — now that linking is id-based, the same name can safely exist once
globally and once per lab again, matching this file's own original inline comment ("its own
General Pathology... never shared with another lab's cases") that the interim global rule had
overridden.

## 3. ParticipationTypesSection — per-performing-lab sign-out authority

**What changed**: `ParticipationTypeRecord` gets a new `authorityOverrides?: Record<labId, {
canFinalize?, requiresCountersign?, canViewWholeCase? }>`. Label/abbreviation/color/description
stay real platform defaults — one shared vocabulary across every lab — only the three
compliance-relevant flags can be overridden per lab, each independently (a lab can override
just `canFinalize` and leave the other two at the platform default). Added
`resolveParticipationTypeAuthority(type, performingLabFacilityId)` as the one, real place to
read the *effective* value — no caller should read `.canFinalize` etc. directly anymore.
`TypeModal.tsx` got a new "Per-Performing-Lab Sign-Out Authority" section: toggle a lab on to
seed it with the type's current platform defaults, then adjust; toggle off to revert cleanly to
the platform default rather than leaving a stale override behind.

**The significant thing this surfaced — please read this part**: before wiring this in, I
checked how `canFinalize`/`requiresCountersign` are actually consulted by real case-finalize
enforcement, expecting to also wire the lab-override resolution into that path. They aren't
consulted **at all**, lab-scoped or not:

- `services/auth/caseAccessControl.ts`'s `canFinalizeCase()` — the real write-guard for
  sign-out — doesn't read `ParticipationTypeRecord` at all. It checks a hardcoded literal,
  `FINALIZE_ELIGIBLE_PARTICIPATION_TYPES = ['primary', 'attending']`, against a participant's
  `participationTypeIds` strings.
- That same hardcoded list is denormalized into `Case.eligibleFinalizerIds` by
  `deriveEligibleFinalizerIds()` (called automatically from `CaseRouter.ts` on every write) —
  which is what Firestore security rules actually enforce server-side, per that function's own
  doc comment, since rules can't evaluate an array-of-objects predicate directly.

So the Participation Types admin screen's "Can Finalise" / "Requires Countersign" checkboxes
have had **zero effect** on real case finalization from the day they were built — a
pre-existing gap, not something this change introduced. Building per-lab overrides on top of
flags that the real enforcement path doesn't read at all would have been pure decoration —
worse than not building it, since the admin screen would visually promise control that isn't
real.

**What I did, and didn't do, about that**: I built the data model and admin UI (safe,
additive, reversible — nothing reads it yet, so nothing's behavior changes). I deliberately did
**not** rewire `canFinalizeCase()`, `deriveEligibleFinalizerIds()`, or the Firestore rules
mirror to actually consult this data, lab-scoped or otherwise. That's a real, security-relevant
change to your actual authorization logic — a bigger, separate piece of work than "add lab
scoping to an admin screen," and one I don't think should happen bundled into this without your
explicit go-ahead, especially since it also touches the server-side rules mirror.

**Your call, specifically**: do you want me to wire real enforcement next — replacing the
hardcoded `['primary', 'attending']` with a real lookup against `ParticipationTypeRecord.canFinalize`
(resolved per-lab via `resolveParticipationTypeAuthority`), updating `deriveEligibleFinalizerIds()`
to match, and updating whatever mirrors this in `firestore.rules`? That's the piece that would
make the sign-out-authority feature actually govern real sign-out, rather than just record an
admin's intent.

## Validation

- `npx tsc --noEmit -p .`: clean.
- `npx vitest run --exclude firestore.rules.test.ts`: 477/477 test files, 4171/4171 tests
  passing — no regressions from any of the three changes.

## Files changed

- `src/utils/evaluateCassetteRouting.ts`
- `src/services/cassetteColors/ICassetteColorService.ts`
- `src/services/specimenDictionary/specimenTypes.ts`
- `src/components/Config/System/SpecimenDictionarySection.tsx`
- `src/components/Config/System/SubspecialtiesSection.tsx`
- `src/services/participationTypes/IParticipationTypeService.ts`
- `src/components/Config/System/TypeModal.tsx`
- `src/components/Config/System/ParticipationTypesSection.tsx`
