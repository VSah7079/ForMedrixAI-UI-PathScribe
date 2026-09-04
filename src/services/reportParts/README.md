# services/reportParts/

Atomic report-building-block library (header/footer/body parts) — one half of the Report Part + Template Assembly system.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- See services/reportTemplates/ for the other half (assembly manifests referencing these parts).
- **Real addition ("Parts Library... should also be tied to a Performing Lab facility"), per direct guidance:** `ReportPart` (`types/reportPart.ts`) gained `performingLabFacilityId?: string` — same Global/scoped convention as everywhere else in this app. Deliberately a new, dedicated field rather than repurposing the existing `institutionId` — that field is always an empty string at every real call site in `mockReportPartService.ts`, confirmed directly, and its own original intent is undocumented; safer to leave it alone than guess at overloading it. The field only became consequential once `components/TemplateBuilder/TemplateAssemblyPage.tsx`'s own two real part-selection UIs were also updated to filter by it — see that file's own README entry for why that was a real, separate gap, not automatic once the field existed on the type.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*