# services/grossingRoutingOverrides/

Admin-managed per-client exceptions to a Department's default Grossing Template.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Real gap this closed: AccessionPage.tsx always passed an empty overrides array before this admin screen existed — this is that screen's real data layer, not new design.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*