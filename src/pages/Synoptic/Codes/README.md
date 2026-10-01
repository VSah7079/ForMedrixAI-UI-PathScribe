# pages/Synoptic/Codes/

ICD/terminology code application UI for a case or specimen.

## Files

- **`AddCodeModal.tsx`** — Navy design system (matches `FlagManagerModal`). Live terminology search via the NLM API (`codeSearchService`). Left panel: applied codes per case/specimen with strikethrough/undo. Right panel: system tabs + hierarchy filters + live search.
  - Real, per direct guidance: SNOMED/ICD-10/ICD-11/ICD-O AI suggestions are now machine-verified against the real, live terminology search before ever being shown (`filterToVerifiedCodes`, `services/terminologySearch/`) — a hallucinated code is silently dropped before the practitioner's own review, never the other way around. CPT keeps its own, separate, pre-existing re-verification against `CODE_MAP_TABLE`.
  - Real, per direct guidance: both the search-results list and the AI-suggestions panel now flag a code already applied to a *different* specimen/case ("Applied elsewhere") rather than showing it as fresh — previously only checked the currently-selected target. Reuses the already-existing, already-working `moveCode()` (the same reassignment this modal's own drag-and-drop already performs) via a real "Move here" action, rather than a second, separate mechanism.
  - Real, per direct guidance: CAP/RCPath synoptic templates' own embedded per-field/per-option code metadata (`EditorField.snomed`/`.icd`, `FieldOption.snomed`/`.icd` — `components/Config/Protocols/SynopticEditor.tsx`) is now actually applied to the active specimen at the real moment a pathologist approves a synoptic AI suggestion (`RightSynopticPanel.tsx`'s `handleVerify`, `v === 'verified'`) — this data model and its admin-side display already existed, but nothing had ever wired it to a real case before. See `pages/SynopticReportPage/resolveEmbeddedCoding.ts`. Currently inert in practice for every generic/placeholder template (all `snomed`/`icd` values are genuinely empty pending a confirmed CAP/RCPath license — `components/Config/Protocols/README.md`), but will apply automatically the moment real, licensed content replaces those templates in place.
  - Real, per direct guidance: found and fixed a genuine, pre-existing bug this same work surfaced — `handleAddCodesToSpecimens` (`SynopticReportPage.tsx`) took every SNOMED code regardless of its own real `specimenId` and flattened them all into one, undifferentiated case-level list (the exact bug class already fixed for ICD, never fixed for SNOMED). `Specimen.coding` gained a real `snomed` field to make per-specimen storage possible at all. Per direct guidance's own explicit principle: never deduplicated on write — the same real concept can legitimately appear more than once (multiple observations, the same concept on different specimen components, a repeated/updated observation) and a distinct, deduplicated concept SET is a real, separate derivation for analytics/billing only (`deriveUniqueConcepts`, `services/terminologySearch/`), never baked into storage.

## Batch 367 (PS-74): no inline CSS

`AddCodeModal.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

---
*See [pages/README.md](../../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
