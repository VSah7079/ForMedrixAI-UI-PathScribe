# components/FacilityDictionary/

User-facing screen title is **Facility Configuration** (renamed from
"Client Dictionary" — the underlying type is `Facility`, not `Client`;
see `services/facilities/README.md`). This folder is itself the
result of that rename being carried all the way through — folder and
file names were updated to match (`FacilityDictionary/`,
`FacilityTable.tsx`, `FacilityEditorModal.tsx`), superseding an earlier
`components/ClientDictionary/` fork that kept the old `Client*` names.
That original fork was found to still exist, fully orphaned (zero real
imports anywhere), and was deleted in the i18n sweep's batch 178 —
see `pages/system/README.md` for that removal's own account. If you
see a reference to `Client*` file names anywhere else in the docs
tree, it predates that cleanup.

## Files

- **`FacilityTable.tsx`** — Facility list, inline search + status filter
  + **role filter** (replaces the old internal/external type filter —
  see "Facility rename" below). Each row shows every role a facility
  holds as separate badges (a facility can hold several at once), not
  a single type label.

- **`IdentifierFormatsTab.tsx`** (**NEW**) — relocated from
  `Config/Integrations/IdentifierFormatsSection.tsx` (now deleted),
  same real move LIS Integration made — out of a standalone,
  globally-scoped System screen and into the Facility editor. Real,
  full feature set preserved: per-format enable toggles, a live test
  tool, a simulate-scan tool (tests the real, live, app-wide union of
  every Enterprise's own enabled formats — a genuine, deliberate
  mismatch with the single facility/Enterprise being edited, called
  out directly in its own comment), LIS-preset filtering, and a
  jurisdiction/locale info card (now resolved from the facility being
  edited, not a global default). Kept as its own file rather than
  inlined into `FacilityEditorModal.tsx` — a real, substantial screen,
  and that file is already large. See
  `services/facilities/README.md`'s own `Facility.identifierFormats`
  doc comment for the full architectural account.

- **`FacilityEditorModal.tsx`** — Full facility editor. Seven tabs now,
  most gated by which roles are checked on the facility (not a fixed
  internal/external branch):
  - **General** — always shown. Core identity + the role checkboxes
    themselves (`performing_lab`, `internal_submitting_location`,
    `internal_ordering_client`, `external_ordering_client`,
    `specimen_acquisition`), each with a real,
    per-role hover tooltip (native `title` attribute, matching this
    app's own established pattern — no custom tooltip component
    exists) sourced from `FACILITY_ROLE_TOOLTIPS`
    (`services/facilities/IFacilityService.ts`), plus a real, separate
    Enterprise checkbox (`isEnterprise` — not a role; see
    `services/facilities/README.md` for why) that filters which
    facilities can be chosen as a Parent Institution below it. Two
    real, role-gated fields also live here now: CLIA/ISO Accreditation
    Number (gated to `performing_lab`, free text) and Place of Service
    Code (gated to `specimen_acquisition`) — a real picker against
    `services/billing/mockPlaceOfServiceCodeService.ts`'s own 52 real,
    currently-active CMS codes, not a placeholder text field.
  - **LIS Integration** (**real, per direct architectural correction —
    replaces the old HL7 Integration tab and the `hl7_routing_endpoint`
    role, both retired**) — never role-gated; real for any facility, not
    just ones holding a specific role. Two real sections: Interface
    Engine Connection (only editable when `isEnterprise` — shows a
    real inheritance note naming the actual Parent Institution
    otherwise) and LIS Routing (editable for any facility; a
    non-Enterprise facility gets an explicit "Override Enterprise
    routing" toggle, off by default, with a real inheritance message
    naming the parent when off). See `services/facilities/README.md`'s
    own `Facility.interfaceEngineConnection` doc comment for the full
    architectural account.
  - **Identifier Formats** (**NEW**, `IdentifierFormatsTab.tsx` above)
    — never role-gated, same real pattern as LIS Integration.
  - **Reporting** / **TAT & Escalation** — **not** role-gated (a real
    fix — see below). Always shown.
  - **AI & Performance** — gated to `performing_lab`.
    `internalAiOrchestratorEnabled` / `internalAiModelId` /
    `idleTimeoutMinutesOverride` live here, directly on `Facility`.
    Resolved via `resolvePerformingLabFacilityId()`
    (`services/facilities/IFacilityService.ts`) — same lab-scoped
    resolution as every other setting on this tab.
  - **Locations** — edit-mode only, **not** role-gated (a real fix —
    see below). Lists/adds/verifies/deactivates
    `Location` records (`services/locations/`) for this facility —
    the ward/room/bed dictionary an inbound PV1 (HL7 ADT/ORM) resolves
    against. See `services/locations/README.md`.

## Facility rename

`Client`/`clientType: 'internal' | 'external'` was replaced entirely
by `Facility`/`roles: FacilityRole[]` — see
`services/facilities/README.md` for the full rationale (short version:
internal performing-lab settings were leaking onto every client
record regardless of type, and a prior fix that split them into a
separate `PerformingLabConfig` service solved that but created a real
workflow problem — "create the internal client, then go to a separate
screen to configure it" — that this unified, role-based model actually
fixes).

Two real, confirmed bugs from that redesign, both fixed in this same
file:

1. **Reporting/TAT were wrongly gated to ordering-client roles.**
   Confirmed against real seed data: a `performing_lab`-only facility
   (Fenwick General Hospital) had real, configured TAT targets that
   were completely hidden behind that gate. TAT is a real concern for
   any facility handling cases, not just ordering clients — both tabs
   are unconditional now.
2. **Locations was wrongly gated to `hl7_routing_endpoint`.** A
   facility can want its locations configured purely for manual
   accessioning (`AccessionPage.tsx`'s own Location dropdown — see
   `pages/AccessionPage/README.md`), independent of whether HL7
   integration exists at all. Gate removed; still edit-mode only.

## Real, found-and-fixed accessibility bug, per direct report ("occasional text that is dark and pretty much impossible to read")

The footer's own Save/Add button — background switches between `#10b981` (saved, bright green) and `#0891b2` (this app's own teal accent, `--ps-teal`) — used `color: "#0f172a"` (dark). Bright green with dark text is genuinely readable, but the teal state (a moderate-brightness accent, not a truly bright one) made the dark text noticeably hard to read — the same pattern already found and fixed in `pathscribe.css` itself for `.ps-login-submit` (see `src/README.md`'s own account). Fixed to white, readable against both real background states this button ever has.

## Real fix (PS-73, Sep 2026) — Duplicate + assigningAuthority uniqueness

The one dictionary this ticket's own original target matrix named
("Client Dictionary" — this folder's real predecessor, see the rename
note above) and that had genuinely never been wired, closed:

- **`FacilityTable.tsx`** — new Duplicate action button per row
  (`common.duplicate`), alongside the existing Edit.
- **`FacilityDictionaryPage.tsx`** — new `handleDuplicateFacility()`.
  Not a plain `prepareDuplicate()` "(Copy)"-and-done clone (see
  `utils/README.md`'s own account of why `preparePersonDuplicate()`
  doesn't fit here either): `assigningAuthority` — the field a real,
  live lookup in `mockOrderIntakeService.ts` keys Facility resolution
  on — is cleared, not copied, same reasoning as a cloned physician's
  own `npi`/`physicianCode`; contact-person fields
  (`contactGivenNames`/`contactFamilyNames`/`email`/`phone`/`fax`/
  `address`/`notes`) are cleared too, since they belong to a specific
  person/location, not the reusable org config actually being cloned
  (roles, jurisdiction, reporting, TAT, escalation, AI settings, LIS
  routing, identifier formats — all genuinely carry over). Also added
  an explicit `editorMode: 'add' | 'edit'` page state, replacing the
  old `!!editingFacility` inference — real bug class this avoids:
  Duplicate populates `editingFacility` with a prefilled template for
  an *add*, which `!!editingFacility` could never tell apart from a
  real edit; `handleSave` now branches on `editorMode`, never on
  `editingFacility`'s mere presence.
- **`FacilityEditorModal.tsx`** — gained the matching `mode: 'add' |
  'edit'` prop, replacing `isEdit = !!facility` with
  `isEdit = mode === 'edit'` — the same fix on the modal's own side.
  This wasn't cosmetic: `eligibleModels` (AI tab) and `locations`
  (Locations tab) were both gated on `facility?.id` alone, which a
  Duplicate template's placeholder id would have satisfied, firing
  real lookups against a bogus id and showing the Locations tab for
  an unsaved record. Both effects, plus the Locations tab itself and
  `handleAddLocation`, are now additionally gated on `isEdit`. Also
  gained real `assigningAuthority` uniqueness validation via
  `utils/validateUnique.ts`'s `findDuplicate()` (case-insensitive,
  `excludeId` only in real edit mode) — the exact real-lookup risk
  `CrosswalkSection.tsx`'s own compound check already protects
  against, just single-key here.
- Real regression tests added: `FacilityEditorModal.test.tsx` (mode
  vs. facility-presence for the id-gated effects; the uniqueness
  check itself, both directions) and a new
  `pages/system/FacilityDictionaryPage.test.tsx` (the actual
  regression this fix is about — Duplicate-then-Save calls
  `facilityService.add()`, never `.update()`, and never touches the
  source record).

## Sole consumer

`pages/system/FacilityDictionaryPage.tsx` — page title also reads
"Facility Configuration", same rename.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`IdentifierFormatsTab.tsx`: the scan-test result banner is tagged. The kind badge's colours come from `--ps-hue` and a CSS rule; they were three inline style properties built in JSX.

## Batch 367 (PS-74): no inline CSS

`FacilityEditorModal.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

## Batch 368

`FacilityEditorModal.tsx` takes `placeOfServiceCodeService` from `@/services`, and is off the deployment baseline.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
