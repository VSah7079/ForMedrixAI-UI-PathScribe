# services/participationTypes/

Case Team participation-role dictionary (Primary Pathologist, Resident, etc.).

**Pattern:** Standard interface/mock/firestore pattern.

## Signing authority — global baseline types, country-scoped regional roles, and three-tier resolution

Signing-authority and delegation rules are **jurisdiction-bound** — NATA/RCPA (AU/NZ), RCPath (UK), RCPI/Medical Council (Ireland), CPSO/RCPSC (Canada), MHW (South Korea), and each EU member state's national medical act govern every lab in that country the same way. The model follows Pete's own three-part design (Sep 2026):

1. **Global baseline types** — roles whose authority behavior is identical everywhere (`primary`, `attending`, `resident`, `consultant`, …) stay single, platform-wide types. No `scopedJurisdictions` means offered at every facility.
2. **Country-scoped regional roles** — a role that isn't a local *name* for a universal role but a legally distinct one gets its own type with `scopedJurisdictions`. Seeded today: `biomedical_scientist` (UK + EU member states) and `bms_advanced_practitioner` (UK only) — a non-physician with a jurisdiction-specific reporting scope that has no legal equivalent in the US, Canada, or South Korea. `isParticipationTypeOfferedIn(type, jurisdiction)` decides whether a type is offered; an unknown jurisdiction offers global types only, never guessing a regional role into a context it may not legally belong in.
3. **Regional variance via country-keyed overrides** — `jurisdictionProfiles: Partial<Record<Jurisdiction, { label?, regulatoryNote?, canFinalize?, requiresCountersign?, canViewWholeCase? }>>`, keyed by the same `Jurisdiction` code `Facility.jurisdiction` uses. Carries the real local title and regulatory citation alongside the authority flags, since all three come from the same regulatory source and a compliance reviewer needs them together.

### Resolution order — `resolveParticipationTypeAuthority(type, performingLabFacilityId?, jurisdiction?)`

Most specific wins, field-by-field (same precedence pattern as TAT Config/Template Routing/Routing Rules):

1. `authorityOverrides[performingLabFacilityId]` — a genuine **lab-level exception** to its own country's norm (e.g. a UK lab that has actually credentialed a specific BMS for independent reporting). The original PS-327 mechanism, unchanged.
2. `jurisdictionProfiles[jurisdiction]` — the **country's regulatory norm**.
3. The platform default flags.

Any omitted input, or a map with no matching entry, skips that tier — so nothing changes anywhere an override wasn't explicitly configured. `resolveParticipationTypeLabel(type, jurisdiction?)` resolves the display title the same way (country title → platform label).

**Which jurisdiction**: the **performing lab's**, never the ordering site's — the lab where the diagnosis is signed is whose rules apply. Resolved by `services/facilities/resolveCasePerformingLabScope.ts`, shared by the sign-out gate and the case-team editor so they can never disagree about which country governs a case.

### Seeded per-country data (`mockParticipationTypeService.ts`)

Pete's Screener / Second Reviewer / Supervisor tiers map onto the global types — Screener → `resident`, Second Reviewer → `consultant`, Supervisor → `primary` + `attending` (`attending` suffixed "— Supervising / Co-Signer" so the two never show identical labels in one jurisdiction). Profiles exist for AU, NZ, BE/NL/DE/FR, GB_EW/GB_SCT/GB_NIR, IE, CA, and KR, each with the real local title and Pete's own "Key Regulatory Nuance" text. The US has no profiles — it resolves exactly as before.

Authority flags are recorded **explicitly** in every profile even though all seven jurisdictions' stated rule (trainee drafts, specialist signs off) matches today's platform default. Deliberate: an explicit entry is an inspectable compliance record, and it pins that country's behavior so a future change to the platform default can't silently change who may sign out somewhere whose rule didn't change. Same title, different scope is handled, not flattened: "Fellow" is a Screener in Canada but a Second Reviewer in South Korea.

**Existing browsers**: `mergeSeedJurisdictionData()` upgrades an already-persisted list non-destructively on load — appends missing system types, backfills profiles/scoping onto stored system types only where absent. An admin's own edits (including a deliberately-cleared `{}` profile map) and custom types are never touched. The storage key was deliberately *not* bumped, since that would discard real admin edits.

### Real enforcement — where this is consumed

- `services/auth/caseAccessControl.ts` — `canFinalizeCase()`, `resolveFinalizeEligibleTypeIds()`, `resolveCountersignRequiredTypeIds()` all take `jurisdiction` alongside `performingLabFacilityId`.
- `pages/SynopticReportPage/hooks/useSignOutWorkflow.ts` — Surg Path sign-out (countersign gate + write guard) and Assist-mode finalize.
- `pages/SynopticReportPage/modals/CaseTeamModal.tsx` — offers only the types valid in the case's jurisdiction, shows the local title, and shows the **effective** Countersign/Finalise badges (previously it showed raw platform defaults, which could promise a different rule than the gate enforced).

**Not yet consuming this — disclosed, not silently assumed**: `deriveEligibleFinalizerIds()` (platform default only — a disclosed cost tradeoff in its own doc comment, moot until the repo-root `firestore.rules` gains a finalize-eligibility rule — it currently has none); Cytology and Autopsy sign-out (neither resolves participation types at all yet); `canViewWholeCase` (resolved, but no confirmed real consumer).

### Admin UI — facility tier as a first-class, human-in-the-loop control (Sep 2026)

Per Pete's direction: automated, legally accurate defaults across all seven countries, without trapping a hospital in a system it can't customize where local policy permits. `components/Config/System/TypeModal.tsx` shows, for every performing lab:

1. **Transparent inheritance** — each flag's **active rule** and its **source of truth**: "Inherited from England & Wales (NHS) jurisdiction default" (with the jurisdiction's regulatory basis beneath), "Platform default", or "Overridden at facility level by [admin] on [date]". Color-coded by tier. Powered by `authorityProvenance.ts`'s `resolveAuthorityWithSource()`, tested to agree with `resolveParticipationTypeAuthority()` for every lab/jurisdiction combination — what the admin sees is exactly what the sign-out gate enforces.
2. **Break-glass control** — "Override default for this facility" seeds the override from what the facility currently **inherits** (`resolveInheritedAuthority()`), so switching it on changes nothing until the admin deliberately edits a flag. Real bug fixed on the way: the old toggle seeded from the raw *platform* default, which at a UK lab would have silently dropped its RCPath profile values. "Revert to inherited default" removes the override (with an undo — "Keep facility override" — until save). A country-scoped type only lists labs in its jurisdictions, but never hides a lab that already carries an override.
3. **Compliance audit trail** — `FacilityAuthorityOverride` now carries `overriddenBy`, `overriddenAt`, and an optional `justification`. On save, `ParticipationTypesSection.tsx` runs `stampFacilityOverrideChanges()`: every added, changed, reverted, or re-justified override is stamped with the acting admin and time, and one entry per change goes to the real audit log (`buildFacilityOverrideAuditEntry()` — who, which flags changed from → to, which facility, and the justification or an explicit "none given"). Untouched overrides keep their original provenance exactly, so re-saving a type never looks like a re-approval. Audit entries are written only after the save succeeds — never a record of a change that didn't land.

Overrides created before provenance existed still load and display as "Overridden at facility level (set before change tracking)."

### Where the logic lives (standing rules: no inline CSS, no business logic in components, international support)

The admin UI and case-team editor are render-and-dispatch only; every decision lives in this folder:

- **`facilityAuthorityEditor.ts`** — the modal's view model: `buildFacilityAuthorityRows()` (which labs to show, per-flag value + source, unsaved/pending-removal state, regulatory note), `toggleFacilityOverride()` (inherited-value seeding, restore-on-undo), `setFacilityOverrideFlag()`, `initialJustifications()`.
- **`saveParticipationType.ts`** — `saveParticipationTypeWithAudit()`: stamp provenance → persist → audit only on success. Dependencies (type service, audit service) are injected, so it's tested without module mocks. `resolveAuditActor()` derives the acting admin from the session.
- **`IParticipationTypeService.ts`** — `resolveCaseTeamParticipationTypes()` for `CaseTeamModal.tsx` (jurisdiction filtering, local titles, effective flags).
- **`standingRules.guard.test.ts`** — source-level enforcement for `TypeModal.tsx`, `ParticipationTypesSection.tsx`, and `CaseTeamModal.tsx`: every `style` prop may set only CSS custom properties; none may call the resolution/provenance/audit primitives directly; every i18n key they use (including all 13 `jurisdictionNames.*`) must exist, non-empty, in all five locales with matching `{{placeholders}}`; and none may render the English-only `JURISDICTION_LABELS` constant. Mutation-tested — reintroducing one violation of each rule fails it.

Jurisdiction names in the UI come from the new top-level `jurisdictionNames.*` i18n block (all 5 locales; NHS/HSC/HSE kept as proper nouns), never `JURISDICTION_LABELS`.

**Country profiles now have an editor (Batch 335).** Before this batch, the *jurisdiction* tier (`jurisdictionProfiles`) and `scopedJurisdictions` were seed data only. They now have a platform-level editor, System → Clinical Lookups → **Country Signing Rules** (`components/Config/System/CountrySigningRulesSection.tsx`). Saving through `TypeModal.tsx` still preserves both fields (regression-tested).

## Country Signing Rules (Batch 335, PS-341)

- **`countryProfileEditor.ts`** (pure) holds the rules for the screen.
  - **Permission:** `canEditCountrySigningRules(role)` allows only `superadmin`, the role `caseAccessControl.ts` treats as the platform administrator. Hospital admins see the screen read-only.
  - **Rows:** `buildCountryProfileRows(types, jurisdiction)` gives one row per type for one country: the local title, the regulatory basis, and each flag as platform default / yes / no. It also gives the role's scope (all countries, offered here, not offered here) and who last changed it.
  - **Scope toggle:** `toggleCountryOffered()` turns a country-scoped role on or off for this country. A global role can't be made country-specific here, because that would change every other country too.
  - **Save planning:** `planCountryProfileSave()` refuses when:
    - the actor isn't a platform administrator;
    - nothing has changed;
    - no reason was given;
    - a role would lose its last country. An empty scope list means "offered everywhere", so the planner refuses and says to deactivate the role instead.
  - **Provenance:** each changed profile is stamped with `updatedBy` / `updatedAt` / `changeReason`.
  - **Clearing a row:** a row cleared back to the platform default removes that country's profile. The type keeps an empty profile map, so seed data isn't re-applied over the removal.
  - **Audit text:** `buildCountryProfileAuditEntry()` writes the audit text in literal English, per type and country, including the reason.
- **`saveCountryProfiles.ts`** handles the save sequence.
  - **Order:** plan → save each changed type → audit each saved type → clear the shared participation-type cache.
  - **Partial failure:** if a save fails part-way, only the types already saved are audited.
- **Profile provenance fields:** `updatedBy`, `updatedAt` and `changeReason` are new optional fields on a jurisdiction profile. Seeded profiles don't have them.
- **Cache fix:** `saveParticipationType.ts` now also clears `utils/participationTypeLookup.ts`'s cache after a successful save. Before this, a lab override didn't reach the sign-out check until the page was reloaded.
- **Standing-rules guard:** `standingRules.guard.test.ts` now covers `CountrySigningRulesSection.tsx`. Its i18n check also understands plural keys (`_one` / `_other`).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*