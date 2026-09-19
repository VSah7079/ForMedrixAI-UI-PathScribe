# PathScribe Update 273 — PS-73: Protocol Dictionary name-uniqueness

## What changed

Protocol Dictionary (`ProtocolDictionarySection.tsx`) already had Duplicate
(`handleClone`) but nothing behind it stopping a save under a name that
collides with an existing protocol — exactly the gap PS-73 named this file
as a known candidate for. An admin could clone a protocol, edit the name
back onto an existing one (or just typo an edit into a collision), and it
would silently save as a same-named sibling with no warning.

**Justification for `name` as the uniqueness key** (checked before writing
anything, per the ticket's own instruction not to assume a name field is
reason enough):
- This same file's own spreadsheet round-trip
  (`handleApplyProtocolImport`) already treats `name` as a de facto unique
  key — it matches import rows back to existing protocols by
  `name.toLowerCase()`, specifically because the spreadsheet never carries
  the internal id.
- `utils/validateUnique.ts`'s own header comment already named this exact
  dictionary ("Sectioning Protocols" — note: that phrase actually refers to
  a different, smaller dictionary inside `StainDictionarySection.tsx`, not
  this one; checked and confirmed they're distinct entities, so this isn't
  double-counting an already-covered case).
- No other file in the codebase looks up a `Protocol` by name — every real
  reference (`GrossingScreenPage`, `AccessionPage`, `evaluateCassetteRouting`,
  `CassetteRoutingRulesSection`, `StainDictionarySection`,
  `SpecimenDictionarySection`) keys strictly on `protocolId`/`p.id`. So the
  fix only needed to protect the human-facing list and the import
  round-trip from real ambiguity, not any deeper id-relationship.

**Fix**: added the same `findDuplicate()`/inline-error convention every
other dictionary's editor modal already uses (`PhysiciansSection.tsx`,
`StainDictionarySection.tsx`, etc.) — passed the section's own live
`protocols` list into `EditorModal` as `existingEntries`, checked on Save
(case-insensitive, excludes the entry's own id when editing so saving an
unchanged name never false-flags itself), inline error under the Name
field, clears as soon as the admin edits the name again.

**No inline-CSS sweep needed**: this file has zero `style={{...}}` usages,
confirmed before and after.

## PS-75 — Performing Lab scoping (added after your pushback)

My first pass on this called Protocol Dictionary a "doesn't need it" —
wrong, and you were right to push on it: "it doesn't have the field yet"
isn't evidence it doesn't need one, and processing protocols (fixation,
embedding, track structure) genuinely do vary by performing lab in a real
multi-site enterprise. `utils/performingLabs.ts`'s own header already
quotes you saying Performing Lab scoping "is going to be a fixture" for
how enterprise customers scope dictionary items — that's the standing
call, not something to re-litigate per dictionary without a real reason.

Added `Protocol.performingLabFacilityId?: string` (undefined = global/
"All Labs", matching every other scoped dictionary), following the exact
pattern already live in `ContainerTypesSection.tsx`:
- Performing Lab picker in the Add/Edit modal, defaulting to "— All Labs
  (available to everyone) —".
- A "Performing Lab" column on the list, and a lab filter dropdown
  (hidden entirely when no facility is configured as a performing lab,
  so it doesn't clutter an unconfigured install).
- Name-uniqueness widened from `name` alone to the compound key
  `(performingLabFacilityId, name)` — same protocol name can now exist
  once globally and once more per lab, but never twice in the same scope.
- Duplicate correctly carries the source protocol's lab scope onto the
  clone (it already spread `...source`, so this was automatic — just
  verified it).
- The spreadsheet round-trip has no Performing Lab column (same
  limitation as the internal id), so every imported row is always
  global — scoped the import's name-match to global-only entries so a
  re-import can't silently collide with a lab-specific protocol that
  happens to share a name.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors (checked after PS-73 and
  again after PS-75).
- **`npx vitest run --exclude firestore.rules.test.ts`**: 476/476 test
  files, 4154/4154 tests passing, both passes (nothing in this codebase
  unit-tests the editor-modal layer for any of these dictionaries —
  verification for this whole pattern-family is done live, same as the
  sibling dictionaries).
- **Live browser check** (Playwright, Config → System → Clinical Lookups →
  Protocol Dictionary):
  - PS-73 name-uniqueness, all four directions: Duplicate→rename onto an
    existing name→blocked; Duplicate→unique name→saves; Edit→rename onto
    an existing name→blocked; Edit→revert to own name→saves (no false
    self-collision).
  - PS-75 lab scoping: Duplicate "Medical Renal Protocol", assign it to a
    specific performing lab, keep the *same* name→saves (different scope,
    no collision). Duplicate that lab-scoped copy again, same lab, same
    name→blocked with "...already exists for this performing lab."
    Confirmed the clone correctly pre-filled the source's lab. Confirmed
    the list's lab filter isolates to just that lab's protocol, and
    "Global only" correctly excludes the lab-scoped one.
  Zero console errors from the app itself (the console did show unrelated
  403/tunnel network noise from the sandbox's own egress proxy — not
  anything PathScribe requested).

## Files changed

- `src/components/Config/System/ProtocolDictionarySection.tsx`
- `src/components/Config/System/README.md`
- `src/services/protocols/IProtocolService.ts`
- `src/services/protocols/README.md`

## Still open

- **PS-72** — still waiting on your call: rebuild `scripts/tag-phi.mjs`
  from the ticket's spec, or do a manual grep-based PHI-tagging review
  instead. It doesn't exist in this checkout.
- **PS-73/75 rollout continues** — next candidates, each needing its own
  "does it actually need this, on which field(s)" judgment call rather
  than a copy-paste rollout: `SpecimenCategoriesSection.tsx`,
  `GoverningBodiesSection.tsx`, `ParticipationTypesSection.tsx`,
  `SubspecialtiesSection.tsx`, `CassetteColorsSection.tsx`.
