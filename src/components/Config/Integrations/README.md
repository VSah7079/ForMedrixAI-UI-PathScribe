# components/Config/Integrations/

**New folder**, per direct request: consolidates the real interoperability-related config that was scattered in `Config/System/`'s flat "Independent" sidebar group into its own major configuration tab (`ConfigurationPage.tsx`'s `TAB_LABELS`), alongside `Config/System`, `Config/AI`, `Config/Staff`, etc.

**Pattern:** Same sidebar + section-router structure as `Config/System/index.tsx` — deliberately not reinvented.

**Real, substantial expansion (PS-85, Aug 2026), superseding this file's own original scope below.** A real, confirmed, complete reorg moved seven more real, existing sections into this tab from `Config/System/`'s own flat list — this tab now holds every real inbound-message-parsing, external-site-mapping, and client-entity-definition screen, not just the original four. Per direct confirmation, this is a flat list here (no group headers), unlike `Config/System/index.tsx`'s own five real, named groups.

## Files

- **`index.tsx`** — Tab shell + section registry, now 11 real sections: `lis`, `identifiers`, `terminology`, `clients`, `facility_setup`, `crosswalk`, `case_mask_config`, `case_routing`, `routing_rules`, `physicians`, `deficiencies`.
- **`LISSection.tsx`** — Relocated from `Config/System/`, unchanged. LIS integration config (enabled, endpoint, whether LIS owns case statuses, whether pathologists can initiate Addendum/Amendment directly).
- **`IdentifierFormatsSection.tsx`** — Relocated from `Config/System/`, unchanged. Read-only system-defined identifier formats per jurisdiction; admin can enable/disable + test against a real value.
- **`TerminologyServicesSection.tsx`** — Not relocated; still physically lives in `Config/Terminology/` (its own established folder) and is imported cross-folder here, same as it previously was into `Config/System/index.tsx`.
- **`CrosswalkSection.tsx`** — Real admin UI for `services/orderIntake/`'s Specimen Code Crosswalk — closes a real gap flagged directly: `listCrosswalkEntries`/`addCrosswalkEntry` were real, already-implemented service methods with zero UI anywhere. Shows both admin-entered mappings and the real, system-learned "pending" entries `resolveOrder()` already creates on an unrecognized inbound order code (distinguished by `createdBy`), and lets an admin add a known mapping ahead of time so a client's code never has to self-learn at all. Real fix since: added `clientId` + `externalCode` uniqueness validation on save (`utils/validateUnique.ts`). Also: this file was built entirely with inline `style={{...}}` — converted every one to a real, named class (`ps-xwalk-*` in `pathscribe.css`). **Grew a real, prominent Unmapped Stubs banner later the same session** — a live count of pending `unmapped_order_code` `InterfaceException`s, deep-linking directly into the Interface Log tab (`/audit?tab=interfaces&search=unmapped_order_code`) — see `services/interfaceExceptions/README.md`'s own Map & Link section for the full account of what that deep-link now opens onto.
- **`ClientDictionaryPage`** (`pages/system/ClientDictionaryPage.tsx`) — **Relocated here from `Config/System/` (PS-85).** Real Facility Configuration screen — performing lab / site definitions, CLIA/ISO IDs, site endpoints. Not physically moved; still lives in `pages/system/`, imported cross-folder here same as `TerminologyServicesSection.tsx` above. A real, hardcoded deep-link in `WorklistTable.tsx`'s pediatric-access-request flow (`?tab=system&section=clients`) was found and fixed to the new `?tab=integrations&section=clients` during this same reorg — confirmed via a whole-app search for every hardcoded reference to a moved section, not assumed safe.
- **`FacilitySetupSection.tsx`** — **Relocated here from `Config/System/` (PS-85).** Physical site parameters and connection setup, paired with Facility Configuration above.
- **`CaseMaskConfigSection.tsx`** — **Relocated here from `Config/System/` (PS-85).** Site-level accession mask patterns and category overrides, moved to sit directly alongside the site definitions (Facility Configuration/Setup) they scope, per direct confirmation.
- **`CasePoolAssignmentSection.tsx`** (labeled "Case Routing" in this tab) — **Relocated here from `Config/System/` (PS-85).** Real keyword-based specimen→pool routing rule assignment.
- **`RoutingRulesSection.tsx`** (labeled "Routing Rules") — **Relocated here from `Config/System/` (PS-85).** Synoptic template routing rules, uses Subspecialties. A genuinely different real screen from Case Routing above, despite the similar name — confirmed directly before this reorg, not assumed.
- **`PhysiciansSection.tsx`** — **Relocated here from `Config/System/` (PS-85).** Placed here specifically to pair with real inbound provider resolution (`resolveProviderName`, `services/physicians/`), per direct confirmation.
- **`DeficienciesSection.tsx`** (labeled "Specimen Deficiencies") — **Relocated here from `Config/System/` (PS-85).** Inbound requisition/intake exception rules.

## Notes

- `RvuCodeMapSection.tsx` and `BillingDictionarySection.tsx` both deliberately stayed in `Config/System/` — billing/coding rules, not external-system connectivity, a real, different concern from everything else in this folder.
- This tab is the intended home for future Patient/Encounter subsystem admin surfaces (merge/link review, identifier crosswalk management) as that work (Phase 0 onward) lands — see the phased plan doc from that scoping conversation.
- **HL7/FHIR Segment Mapping deliberately has no nav entry anywhere** — confirmed directly, twice, across two separate reorg passes: PS-81 built the real provider-resolution engine, never an admin UI for it. Not an oversight if it's missing when this file is next read.

---
*See [components/Config/README.md](../README.md) if one exists for how this folder fits the whole Config/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
