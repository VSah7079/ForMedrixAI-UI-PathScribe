# services/clinicalHistory/

Real, per the uploaded "Structured Clinical History Dictionary &
Accessioning Integration" specification (five user stories) — this
folder is the app-wide, shared home for that work, deliberately not
`services/cytology/`. The spec's own PRIOR_PATH example (a prior
cytology result) and its own "Accessioning Integration" title both
confirm this is captured at accessioning for any specimen type, not a
cytology-only concept — the same real reasoning already applied to the
DP-vendor dictionary and AI screening results in
`services/digitalPathology/`.

Full build narrative (all five user stories, the real "why is LMP a
dictionary?" design principle it settled, and a genuine mid-build
data-model correction for multi-specimen cases) lives in
[services/cytology/README.md](../cytology/README.md)'s own Phase 76 —
not duplicated here, since that phase account already carries the real
context of why this work was commissioned and how it was sequenced.
This file documents what this folder's own files actually are.

## Files

- **`IClinicalHistoryDictionaryService.ts` / `mockClinicalHistoryDictionaryService.ts`**
  — the real, admin-editable dictionary (`add`/`update`/`deactivate`/
  `reactivate`/`remove`, matching this app's own established dictionary
  pattern). 21 real entries across the spec's own six categories (SCR,
  SYM, RAD_LAB, PRIOR_PATH, MAL_STAGE, HIGH_RISK), each grounded in real
  research (RSNA's 2026 oncologic-imaging-requisition parameters, a
  real published pathology requisition form, standard oncology
  history-taking categories, clinical-trial SAP therapy
  classification) — not invented placeholders.
- **`validateClinicalHistoryAccessionPayload.ts`** — a pure, fully-tested
  function implementing the spec's own Acceptance Criteria 3 exactly:
  reports every real problem across every entry at once, and enforces
  the one rule the spec states explicitly — an unmapped-text fallback
  is only ever valid under SYM or SCR, never the four clinically-
  consequential categories.
- **`processInboundClinicalHistoryAccessionEvent.ts`** — real, idempotent
  ingestion of `ClinicalHistoryAccessionEventPayload`
  (`types/events/`), same "PathScribe ingests its own specification;
  the real interface engine owns HL7/FHIR parsing" split already
  proven for HPV results and molecular batch results.

## Real data model, split across two layers deliberately

- **The dictionary itself** (this folder) — the catalog of selectable
  history items and their own `requiredMetadataSchema`.
- **What a specific case/specimen actually recorded** —
  `RecordedClinicalHistoryEntry` (`types/clinicalHistory/`), living in
  `types/` rather than here specifically so `Case.ts`/`Specimen.ts` can
  import it without a types→services dependency. Recorded at
  `Case.order.clinicalHistory` (case-level, the real, primary default)
  and, per a real LIS/cytology data-modeling follow-up, additively at
  `Specimen.clinicalHistory` too — a genuinely multi-specimen case can
  carry site-specific history that doesn't belong to the whole order.

## Real, explicit scope boundary

Combining case-level and specimen-level history into one, real
"inherited" view during actual cytotechnologist/pathologist
review — showing the combined picture while reviewing one specific
specimen's slides in `CytologyScreeningPage.tsx` — is separate, later
work, stated directly at the time rather than assumed covered.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
