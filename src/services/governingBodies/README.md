# src/services/governingBodies/

`IGoverningBodyService.ts` + `mockGoverningBodyService.ts` (+ test) —
real persistence for the Governing Bodies list (CAP, RCPath, ICCR,
RCPA, and any custom bodies a super-admin adds).

## Already fixed in a past session — verified, not just read

The interface file's own header documents a real bug found and fixed
before this review: `GoverningBodiesSection.tsx`'s `handleSave` used to
be a bare `/* TODO: persist */` comment — every toggle, edit, add, and
remove only ever touched React state, never saved anywhere. A refresh
silently discarded every change, while the UI's "unsaved changes"
indicator cleared as if the save had genuinely succeeded.

Didn't just trust the header comment — ran the test suite directly (4
tests: seed data loads, a save is genuinely visible on the next
`getAll()` — the actual bug this closes — adding a custom body
persists, removing a body persists). All 4 pass. Also confirmed
`GoverningBodiesSection.tsx` is genuinely wired to this real service
(not just the interface existing in isolation) — `getAll()` on mount,
`saveAll()` on save.

Clean otherwise. `firestore.rules` already has a real
`/governingBodies/{docId}` collection defined (platform-level,
ForMedrix-staff-only write access) — the backend schema anticipated
this data existing; the frontend fix (this folder) is what actually
makes use of it once a real Firestore-backed implementation replaces
the mock.

## Batch 371

`governingBodyAdministration.ts`: `saveGoverningBodies` needs `platform:governing-bodies:manage` (Superadmin only). This setting is platform-wide, not a hospital's. `@/services` exports `governingBodyService`.
