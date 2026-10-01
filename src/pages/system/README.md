# pages/system/

Admin config pages rendered by `Config/System/index.tsx`'s route switch.
Currently holds one page; more may land here as other `Config/System/`
sections get split out of their current homes.

## Files

- **`FacilityDictionaryPage.tsx`** — Admin config page for Facility
  Configuration (route: `/system/clients`; renders `FacilityTable.tsx`
  + `FacilityEditorModal.tsx` from `components/FacilityDictionary/` —
  see that folder's own README). Reconciled June 2026: previously ran
  on `contexts/useClientDictionary.ts`, a synchronous localStorage-backed
  hook with its own disconnected `Client` type and ID scheme
  (`client-INT-001` etc.), completely separate from
  `services/facilities/mockFacilityService.ts` — the store every other screen
  (Accession page, TAT Configuration, Subspecialties, Routing Rules,
  Validation Studies) and existing case seed data (`order.clientId`)
  actually use. Now wired to the same `facilityService` as everything else,
  so a facility added here shows up everywhere, and vice versa.
  `useClientDictionary.ts` has been retired. Correctly reuses the shared
  `ConfirmModal` for the "facility still referenced" deactivation guard
  rather than reimplementing it.

  **Fixed this review:** two inline `style={{...}}` blocks (the loading
  state, and the header's flex row) — real violations of the
  no-inline-styles rule. Replaced with new `.config-section-loading` and
  `.config-section-header-row` classes, added to `pathscribe.css` next to
  the rest of the `.config-section-*` family (Section 10, CONFIG / ADMIN
  SECTIONS). See `PRIORITY_FIXES.md` for the wider inline-style finding
  this surfaced.

  **Removed this session (i18n sweep, batch 178):** this folder used to
  also hold `ClientDictionaryPage.tsx` — an orphaned, unrouted fork of
  this exact page (same title/description/button text, same
  `facilityService`) left behind when the underlying `Client*` →
  `Facility*` rename forked `components/ClientDictionary/` into
  `components/FacilityDictionary/` without ever deleting the original.
  Confirmed zero real imports of `ClientDictionaryPage`, `ClientTable`,
  or `ClientEditorModal` anywhere in the codebase before deleting the
  whole `components/ClientDictionary/` subtree alongside it.

## Notes

The `.config-section-header-row` pattern (flex, space-between,
flex-start) is duplicated near-verbatim under several other class names
elsewhere in `pathscribe.css` (`.ps-del-header` appears 4 times,
`.ps-sub-header` twice, `.ps-tat-header`, `.ps-tat-client__section-header`,
`.ps-tat-trend__header`) — a broader class-duplication pattern, not fixed
here since it's a different, larger problem than this file's own inline
styles. Not logging a new tracking entry for it yet; flagging here so
it's not lost if a future CSS consolidation pass happens.

## FacilityDictionaryPage: Duplicate via the service (Batch 317, PS-73)

`handleDuplicateFacility` now calls `services/duplication` → `duplicateFacility`, which lists every cleared field with its reason. Compared with the old inline version, the copy now also clears:

- CLIA/ISO number;
- director;
- city, state and zip;
- legacy tenant ids;
- pediatric pathologist authorizations;
- the interface endpoint, and `credentialConfigured` (a copy must not claim credentials it doesn't have).

The copy's name is localized. The page test was updated to match.

## Batch 368

`FacilityDictionaryPage.test.tsx` mocks `placeOfServiceCodeService` through `@/services`, since the editor now takes it from there.
