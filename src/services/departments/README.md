# services/departments/

Coarse-grained specimen classification controlling workflow at Accession (e.g. 'Surgical Tissue') — the level ABOVE the fine-grained Specimen Dictionary entry.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Deliberately separate from services/specimenDictionary/ — see that folder's README for the fine-grained counterpart. A SpecimenEntry references a departmentId, letting an incoming order resolve to a known workflow before the specific dictionary entry is resolved.
- **Real, per direct follow-up ("Can we cleanup those 12 errors?"): `Department.retentionOverrideDays` was missing from this type entirely** — a real, genuine `tsc` error (confirmed, not assumed), even though `DepartmentsSection.tsx` (Config/System/) and `services/retentionPolicy/resolveRetentionEligibility.ts`'s own `resolveCategoryOverride()` both already, genuinely depended on it. `RetentionPolicy.ts`'s own doc comment had always pointed here as the real, intended attachment point — the field itself just never got added. Added now, typed via `services/retentionPolicy/RetentionPolicy.ts`'s own `RetentionOverrideDays` (a one-directional import, confirmed no circular-dependency risk — that file never imports from here). `mockDepartmentService.ts`'s own `add()`/`update()` needed no changes — both already spread generically, handling any field including this one without special-casing.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*