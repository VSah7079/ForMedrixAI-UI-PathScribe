# pages/modals/

Top-level page modals that don't belong to any single page's own folder.
Distinct from `pages/SynopticReportPage/modals/`, which holds modals
scoped specifically to that page.

## Files

- **`ManagementReviewModal.tsx`** — The real ISO 15189 Management Review
  activity: a periodic, batch-level look at closed deficiencies for
  patterns, not a per-item sign-off. Everything closed-but-unreviewed is
  in scope by default; the reviewer deselects anything genuinely out of
  scope before submitting one findings note for the whole batch. Used by
  `DeficienciesPage.tsx`. No issues found — clean, no dead code, no
  inline styles.

## Notes

No structural or naming issues in this folder as of this review
(August 2026, part of the `src/pages/` review pass). Reviewed as part of
the same pass that also covered `pages/system/`.

## Batch 363 (PS-72): patient data tagged for screenshot redaction

`ManagementReviewModal.tsx`: each deficiency's case number is tagged.
