# services/containerTypes/

Structured container-type dictionary (jar/cassette/slide etc.) — replaces a previously-unconstrained free-text field.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Feeds the real HL7 SPM-27 segment (see services/hl7/segmentBuilders.ts) — this dictionary exists specifically because that segment builder needed a real container-type value to work with.
- `performingLabFacilityId?: string` — real, per direct request: "Each
  Performing Lab will want their own types. If Performing Lab not
  defined, it is available for everyone." Same field-name convention
  and same null/undefined = inherit/global shape as
  `Facility.idleTimeoutMinutesOverride` and the other
  performing-lab-scoped settings in `services/facilities/IFacilityService.ts`
  — a real Facility id, scoped to facilities with the `performing_lab`
  role. `name` and `aplisMapping` uniqueness (`ContainerTypesSection.tsx`,
  via `utils/validateUnique.ts`) are both scoped by this field as a
  compound key — per direct confirmation, checked only within the same
  lab's own scope (including "both undefined" as its own real scope),
  never against a different lab's own types.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*