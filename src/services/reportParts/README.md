# services/reportParts/

Atomic report-building-block library (header/footer/body parts) — one half of the Report Part + Template Assembly system.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- See services/reportTemplates/ for the other half (assembly manifests referencing these parts).
- **Real addition ("Parts Library... should also be tied to a Performing Lab facility"), per direct guidance:** `ReportPart` (`types/reportPart.ts`) gained `performingLabFacilityId?: string` — same Global/scoped convention as everywhere else in this app. Deliberately a new, dedicated field rather than repurposing the existing `institutionId` — that field is always an empty string at every real call site in `mockReportPartService.ts`, confirmed directly, and its own original intent is undocumented; safer to leave it alone than guess at overloading it. The field only became consequential once `components/TemplateBuilder/TemplateAssemblyPage.tsx`'s own two real part-selection UIs were also updated to filter by it — see that file's own README entry for why that was a real, separate gap, not automatic once the field existed on the type.

## Preliminary Report Templates — 6 new body parts, and the `hideIfEmpty` / "Pending" distinction

Real, per direct request for Preliminary (not just Final) report templates across Surg Path and Cytology. Six new body parts: `prelim_header_banner`, `prelim_body_surgpath_impression`, `prelim_body_ancillary_status`, `prelim_body_gyn_cytology`, `prelim_body_nongyn_cytology`, `prelim_body_signoff` — all reuse existing universal parts (demographics, clinical, specimens) by reference rather than duplicating them. `prelim_body_surgpath_impression` binds to `diagnostic.preliminaryImpression` (case-level, not per-specimen — a real correction made after an initial version incorrectly wrapped it in a per-specimen repeat-group).

**A real distinction worth remembering when adding any new field here**: the `e()` node-builder helper gained an optional `hideIfEmpty` parameter (5th arg, default `false`, backward-compatible). Fields that are genuinely optional/case-dependent (Ancillary Testing Status, Critical Value Log, Non-GYN prep details) use `hideIfEmpty: true` — showing "Pending" for something that may never apply at all is misleading. Fields that are required for every real case of that type (GYN adequacy/categorization/Bethesda — mandatory for every real Pap) keep the "Pending evaluation" text — an honest, expected placeholder, not a false negative. When a single field actually conflates two real, separable concepts (the old "ROSE / adequacy assessment" line), split it into two real fields with two different real defaults (`rosePerformed`: `hideIfEmpty`, since ROSE isn't always performed; `adequacyAssessment`: kept as "Pending", since adequacy is always eventually assessed) rather than picking one default that's wrong for half of real cases.

## The shared `diagnosisPart` (`std_body_diagnosis`) — now carries a real, explicit Final Diagnosis designation

Real, per direct correction ("a text field on the report should be declared as the final diagnosis"). `specimen.diagnosis` — the real, per-specimen diagnosis text field inside this part's own repeating group — is now marked `isFinalDiagnosisField: true` (spread onto the shared `p()` helper's own output at this one call site, rather than changing that helper's own signature, since it's used widely elsewhere for fields with nothing to do with this). Confirmed directly, via a real integration test with mocks disabled, that this one edit correctly covers all 5 real Final templates that reference this exact part by id (`tmpl-gold-standard`, `tmpl-breast`, `tmpl-gi`, `tmpl-thoracic`, `tmpl-uro`) — see `services/reportTemplates/README.md`'s own fuller account of the resolver and validator this designation feeds.

## `clone(id, newName)`: name now required (Batch 317, PS-73)

The copy's name comes from the caller, in the user's language (`t('common.copyOfName')`). There is no longer an English `"(Copy)"` fallback stored as data.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
