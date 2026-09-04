# components/ClientDictionary/

User-facing screen title is **Facility Configuration** (renamed from
"Client Dictionary" this session — the underlying type is `Facility`,
not `Client`; see `services/facilities/README.md`). Folder and file
names were deliberately **not** renamed to match — only user-visible
text was — so `ClientDictionary/`, `ClientTable.tsx`, and
`ClientEditorModal.tsx` are what you'll still find on disk. Don't be
thrown by that mismatch; it's intentional scope discipline, not an
oversight (see the "Facility rename" section below for why).

## Files

- **`ClientTable.tsx`** — Facility list, inline search + status filter
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
  inlined into `ClientEditorModal.tsx` — a real, substantial screen,
  and that file is already large. See
  `services/facilities/README.md`'s own `Facility.identifierFormats`
  doc comment for the full architectural account.

- **`ClientEditorModal.tsx`** — Full facility editor. Seven tabs now,
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
    fix this session — see below). Always shown.
  - **AI & Performance** — gated to `performing_lab`.
    `internalAiOrchestratorEnabled` / `internalAiModelId` /
    `idleTimeoutMinutesOverride` live here, directly on `Facility`.
    Resolved via `resolvePerformingLabFacilityId()`
    (`services/facilities/IFacilityService.ts`) — same lab-scoped
    resolution as every other setting on this tab.
  - **Locations** — edit-mode only, **not** role-gated (a real fix
    this session — see below). Lists/adds/verifies/deactivates
    `Location` records (`services/locations/`) for this facility —
    the ward/room/bed dictionary an inbound PV1 (HL7 ADT/ORM) resolves
    against. See `services/locations/README.md`.

## Facility rename (this session)

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

## Sole consumer

`pages/system/ClientDictionaryPage.tsx` — page title also reads
"Facility Configuration" now, same rename.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
