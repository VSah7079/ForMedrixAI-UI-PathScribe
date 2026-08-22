# services/locations/

The `Location` dictionary — real wards/rooms/beds, scoped to a
`Facility`. Built in response to a direct, confirmed gap: "we will
need to accept PV1 HL7 data, but I don't believe we have Location /
Rooms defined in config. They would naturally be associated to the
Facility."

Confirmed before building: real PV1 parsing already existed
(`services/hl7/adtParser.ts`'s `parsePV1`) and already fed a real
`Encounter` entity (`services/encounters/`) — but
`ward`/`room`/`bed`/`facility` were always plain free-text strings,
with zero structured dictionary behind them. Any string arriving in an
inbound message was accepted and stored as-is. This folder is that
dictionary.

## Files

- **`ILocationService.ts`** — `Location` type, modeling the real, full
  HL7 PV1-3 (Assigned Patient Location) component structure — all 8
  components, confirmed directly ("include the standards"), not just
  the 4 the parser originally read:

  ```
  PV1-3.1 Point of Care    PV1-3.5 Location Status (HL7 Table 0306)
  PV1-3.2 Room              PV1-3.6 Person Location Type (HL7 Table 0305)
  PV1-3.3 Bed                PV1-3.7 Building
  PV1-3.4 Facility (raw)    PV1-3.8 Floor
  ```

  `locationStatus`/`personLocationType` are genuinely "user-defined"
  tables in the HL7 spec itself — modeled as guided free text with the
  standard's own suggested values
  (`HL7_LOCATION_STATUS_OPTIONS`/`HL7_PERSON_LOCATION_TYPE_OPTIONS`),
  not a closed enum that could reject a legitimate, real
  site-specific value. `hl7FacilityCode` (PV1-3.4) is kept as a raw
  string, distinct from `facilityId` (the real, resolved
  `Facility.id`) — same raw-vs-resolved posture as other crosswalk
  pairs in this app.

- **`mockLocationService.ts`** — Standard CRUD +
  `findOrCreateByPV1()`, the real crosswalk resolution: matches on
  `(facilityId, pointOfCare, room, bed)`, case-insensitive and
  trimmed (PV1-3 is free-typed text from an external system, not a
  strict key). No match creates a real, `Unverified`, `autoCreated`
  location — same governance posture as `Facility`/`Physician`
  auto-creation. Returns `{ location, outcome: 'matched' | 'created' }`
  explicitly, matching the `mpiResult`-style vocabulary already used
  elsewhere in this codebase — an earlier version tried to infer the
  outcome indirectly via a before/after record-count comparison;
  reconsidered and replaced with the service reporting it directly,
  which is both simpler and more reliable.

- **`mockLocationService.test.ts`** — 7 tests: facility-scoped
  matching, case-insensitive/whitespace-tolerant matching, real
  Unverified auto-creation with the right audit fields, no duplicate
  on repeat reference, and matching genuinely scoped per-facility
  (the same ward/room string at two different facilities resolves to
  two different, real locations).

## Real integration, not just storage

`services/hl7/adtParser.ts`'s `parsePV1` now extracts all 8 PV1-3
components (was 4). `services/hl7/processAdtMessage.ts` resolves the
parsed PV1-3 against the relevant facility's `Location` dictionary
*before* resolving the `Encounter`, for A01/A04 events with a usable
`pointOfCare`. The resolved `locationId` is genuinely persisted onto
`Encounter.locationId` (`services/encounters/`) — a real gap caught
and fixed while building this: the field was added to the `Encounter`
type but not actually written by `mockEncounterService.ts`, which
lists its persisted fields explicitly rather than spreading input.

`processAdtMessage()` takes a new, required `facilityId` parameter —
confirmed zero real callers existed yet (no live HL7 interface exists
in this app currently), so this was free to design cleanly. A real HL7
interface is configured per-facility in practice, matching how every
other HL7 integration setting in this app is already scoped.

## Admin UI

`components/ClientDictionary/ClientEditorModal.tsx`'s **Locations**
tab — edit-mode only, **not** role-gated (a real fix: it was
originally gated to `hl7_routing_endpoint`, on the reasoning that a
facility only needs locations if it's doing HL7 integration; corrected
after a direct request to also surface Location on the manual
accession flow, which doesn't require HL7 at all).

**`pages/AccessionPage/AccessionPage.tsx`** also consumes this
directly — a facility-scoped Location dropdown, right next to the
Submitting Facility field, letting a tech record which ward/room/bed a
manually-accessioned specimen came from with no HL7 message involved
at all. Optional (not every specimen has a known inpatient location);
repopulates and resets whenever the selected facility changes, so a
location never silently carries over from a different facility.
Selecting one sets `Case.order.locationId` +
`Case.order.locationDisplay` (a cached, human-readable string, same
"avoid an async lookup on every render" reasoning as the existing
`clientName` field beside it).

**Real feature, per direct confirmation: "I assume that the location
will download from the select patient encounter, once the order or
patient is selected."** Confirmed correct and built — later extended
into a real, broader "Encounter Selector & Auto-Fill" feature (see
`services/encounters/README.md`'s own, fuller consumer writeup and
`pages/AccessionPage/README.md`): Location now auto-populates from two
real trigger points, not one — importing a pending order
(`doImportOrder()`, via `order.encounterNumber`) and selecting an
already-known patient from the Order Lookup & Patient Verification
modal (via a real, resolved MPI `patientId`) — and only when the
linked `Encounter` is genuinely active (`src/utils/isEncounterActive.ts`
— a real Safety Safeguard added later, since a stale/historical
encounter reference should never silently populate Location with
outdated data). Same real pattern as `order.clientId` auto-populating
Submitting Facility, just one lookup deeper since Location lives on
the `Encounter`, not directly on the order.

**`pages/IntraopQueuePage.tsx`** — a separate, direct consumer, added
per direct confirmation ("Let's wire in Facility and Location (Room)
for Intraop"). Same facility-scoped dropdown pattern, captured once
per session (alongside OR/surgeon) rather than per specimen — see
`services/intraop/README.md`.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
