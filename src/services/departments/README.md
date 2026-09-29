# services/departments/

Coarse-grained specimen classification controlling workflow at Accession (e.g. 'Surgical Tissue') — the level ABOVE the fine-grained Specimen Dictionary entry.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Deliberately separate from services/specimenDictionary/ — see that folder's README for the fine-grained counterpart. A SpecimenEntry references a departmentId, letting an incoming order resolve to a known workflow before the specific dictionary entry is resolved.
- **Real, per direct follow-up ("Can we cleanup those 12 errors?"): `Department.retentionOverrideDays` was missing from this type entirely** — a real, genuine `tsc` error (confirmed, not assumed), even though `DepartmentsSection.tsx` (Config/System/) and `services/retentionPolicy/resolveRetentionEligibility.ts`'s own `resolveCategoryOverride()` both already, genuinely depended on it. `RetentionPolicy.ts`'s own doc comment had always pointed here as the real, intended attachment point — the field itself just never got added. Added now, typed via `services/retentionPolicy/RetentionPolicy.ts`'s own `RetentionOverrideDays` (a one-directional import, confirmed no circular-dependency risk — that file never imports from here). `mockDepartmentService.ts`'s own `add()`/`update()` needed no changes — both already spread generically, handling any field including this one without special-casing.
- **Real, per PS-277 (Master Template Engine) §1.2.2, Sep 2026:**
  `Department` gained `headerLogoUrl?`/`directorName?`/`cliaOrIsoNumber?`
  — the real, middle fallback tier in
  `services/facilities/resolveFacilityPrintBranding.ts`'s own
  Facility → Department → Enterprise resolution (per direct
  architecture guidance reusing Case Mask Scoping's own real
  hierarchy). No seed `Department` currently sets any of these —
  a real, honest "no department has configured an override yet" state,
  not placeholder data; the resolver's own tests cover the fallback
  behavior directly against synthetic fixtures.
- **Updated (gap-closing pass, Sep 2026)**: these three fields were
  real and typed but had no admin UI to actually set them — a real,
  disclosed gap (`services/documentRendering/README.md`) since
  `DepartmentsSection.tsx` (Config/System/) never exposed them,
  unlike Facility's own equivalent fields
  (`FacilityEditorModal.tsx`). Closed: `DepartmentsSection.tsx`'s own
  add/edit modal now has a "Report Branding Override" field group for
  all three, same free-text, "not validated against a format" posture
  as Facility's. 4 new tests.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*