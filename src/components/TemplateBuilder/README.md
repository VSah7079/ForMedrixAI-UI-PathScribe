# components/TemplateBuilder/

The **Report Template Builder** — report *layout/assembly* (headers,
footers, body parts, page structure), a completely different system from
`components/Config/Protocols/`'s synoptic *data-capture* templates
(sections/fields a pathologist fills in). Both legitimately use the word
"template," which is a real naming-collision risk worth knowing about even
though the two systems don't actually conflict — see Notes.

**Pattern:** Two-layer architecture — `ReportPart` (atomic header/footer/
body building blocks, `services/reportParts/`) + `ReportTemplate`
(assembly manifest of ordered `AssemblySlot`s referencing parts,
`services/reportTemplates/`). `TemplateNode`-based canvas/inspector/
palette are shared, reused identically whether editing a Part or (via a
documented adapter) previewing an assembled Template.

## Files

- **`ReportTemplatesSection.tsx`** — Thin wrapper, pill sub-tab toggle
  (Templates / Parts / Routing). No issues.
- **`TemplateListTab.tsx`** — Report template list, wired to
  `mockReportTemplateService`. No issues.
- **`PartLibraryTab.tsx`** — Browse/create/edit/duplicate Report Parts.
  Correctly protects 14 built-in standard parts (`PROTECTED` set) from
  deletion. No issues. **Real addition ("Parts Library... should also
  be tied to a Performing Lab facility"), per direct guidance:** a real
  Performing Lab filter (All/Global/named lab) and a lab badge on every
  card, same Global/scoped convention as everywhere else in this app.
- **`PartBuilderPage.tsx`** — Full-screen single-Part editor. Own header
  correctly documents that `TemplateCanvas`/`TemplateInspector`/
  `TemplatePalette` are shared, unmodified, across Part-editing and
  Template-editing — they only care about `TemplateNode[]`. No issues.
  **Real addition:** a Performing Lab selector in the metadata panel,
  editing the new `ReportPart.performingLabFacilityId` field.
- **`TemplateCanvas.tsx`** (725 lines) — The drag/drop node canvas, all 18
  node types. No issues found; not read line-by-line given its size and
  that nothing surfaced at the architecture level — worth a dedicated pass
  if it's touched for a feature change.
- **`TemplateInspector.tsx`** (776 lines) — Right-panel property editor
  for all 18 node types. Same note as `TemplateCanvas.tsx` — no issues
  found, not exhaustively read.
- **`TemplatePalette.tsx`** — Drag source for new nodes. Own header
  documents real, tested WCAG AA contrast ratios for every color used —
  good practice, no issues.
- **`TemplateAssemblyPage.tsx`** (758 lines) — The real Template editor:
  ordered `AssemblySlot`s, drag-to-reorder, page-zone validation
  (`validateAssembly`). **See Notes — the OldTemplate adapter, verified
  correct, not a bug.** **Real fix ("Parts Library... should also be
  tied to a Performing Lab facility"), per direct guidance:** confirmed
  directly that `ReportPart.performingLabFacilityId` (new field, added
  the same session) had zero effect here before this — the two real
  part-selection UIs on this page (`PartPicker` modal and the always-
  visible `PartsPanel` sidebar) are entirely separate from
  `PartLibraryTab.tsx`'s own filtering and previously ignored the field
  completely, meaning the tag existed but never actually constrained
  which parts an admin could assemble into a real template. A single
  `labFilter` state, lifted to the page's own top level (not local to
  either picker), is now shared by both, so browsing the sidebar and
  picking via "+ Add slot" always agree on the same lab context — no
  lab selected shows every part unfiltered, same "no filter" convention
  the Workstation & Hardware group-level selector already established;
  a specific lab shows that lab's own parts plus every Global one.
- **`TemplatePreviewPanel.tsx`** (573 lines) — Word-style paginated
  preview, auto-pagination, sticky page-size preference. Consumes the
  adapter output from `TemplateAssemblyPage.tsx` — see Notes.
- **`RoutingRulesTab.tsx`** — Client override / physician preference /
  test-panel UI over `TemplateRoutingService`'s Pass 0→3 resolution order.
  Correctly cross-references `services/templates/templateService.ts`'s
  synoptic protocol list (not a mix-up between the two "template"
  systems) — Pass 1 of report-template resolution genuinely depends on
  which CAP/synoptic protocol is active. No issues. **Real addition
  (Report Template by facility, if none defined then Enterprise):** the
  Test panel now resolves the selected client's real Enterprise parent
  (`Facility.parentId`, same one-hop reasoning as the real production
  path in `TemplateRoutingService.resolveReportTemplateAsync()`)
  directly against the already-loaded `clients` list, so an admin
  testing "what template does Facility X get" sees the real Enterprise
  fallback exercised too, not just Pass 0's own direct lookup.

## Notes

- **Naming collision risk (architecture-level, not a bug):** "Template"
  means two different things depending on folder —
  `Config/Protocols/SynopticEditor.tsx`'s `EditorTemplate` (data-capture
  fields a pathologist fills in) vs. this folder's `ReportTemplate`
  (physical report layout/assembly). They're correctly kept in separate
  services (`services/templates/` vs `services/reportTemplates/`) and
  types (`types/templateTypes.ts` — now deleted — vs `types/reportPart.ts`),
  and `RoutingRulesTab.tsx` above shows a case where they're correctly,
  deliberately cross-referenced. Flagging only so future work doesn't
  assume "template" means the same thing in both places.
- **`OldTemplate` adapter — checked, genuinely correct, not a bug.**
  `TemplateAssemblyPage.tsx` and `TemplatePreviewPanel.tsx` both import
  `ReportTemplate as OldTemplate` from `types/template.ts` — a second,
  older `ReportTemplate` shape distinct from the current one in
  `types/reportPart.ts`. This looked, at first glance, exactly like the
  class of bug fixed elsewhere this session (an old parallel schema a
  renderer silently fell back to). It isn't: `TemplateAssemblyPage.tsx`
  builds a `syntheticTemplate: OldTemplate` by flattening all of the
  assembly's real, current resolved-part `nodes` into one array — the
  *content* is real and current, only the wrapper shape is old, because
  `TemplatePreviewPanel.tsx` was never migrated off the single-flat-node-
  list preview format. A legitimate, working adapter for one un-migrated
  consumer, not dead code or a content-loss bug. Worth migrating
  `TemplatePreviewPanel.tsx` to consume `AssemblySlot[]` directly someday
  to retire `types/template.ts`'s `ReportTemplate` export entirely, but
  nothing is broken today.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
