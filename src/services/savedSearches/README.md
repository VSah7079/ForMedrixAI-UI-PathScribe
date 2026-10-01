# services/savedSearches/

Saved search/filter presets across Worklist and Case Search contexts.

**Pattern:** Standard interface/mock/firestore pattern.

## Batch 350: the Search page uses this service

The Search page kept its saved searches in the browser (localStorage). They were lost on another workstation, couldn't move to the real backend, and dropped the facility and specimen-flag filters when saved. It now saves, loads, counts uses of and deletes them through this service (context `caseSearch`, per user).

For that context, `CaseSearchFilters` is now the page's whole draft (`services/caseSearch/caseSearchTypes.ts → CaseSearchDraft`); the page normalises older stored shapes on load. The old, never-used shape (query, `diagnosisContains`, `subspecialtyIds` …) is retired; `RefinedSearchFilters` keeps its own fields and no screen uses it yet. Seeds `ss4`/`ss5` were converted.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*