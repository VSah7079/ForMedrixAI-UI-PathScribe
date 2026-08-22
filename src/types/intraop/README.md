# types/intraop/

Data model for the Intraop Pre-Check capture flow's desktop side — the "Unlinked Intraoperative Entries" queue (`/intraop-queue`).

## Files

- **`IntraoperativeEntry.ts`** — a session created at the bench during a frozen-section/intraop consult, living here unmerged until a formal LIS accession arrives, then merged into the real `Case`.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
