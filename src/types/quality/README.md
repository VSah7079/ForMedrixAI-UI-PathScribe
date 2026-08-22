# types/quality/

Frozen-to-Permanent reconciliation record — the real, complete audit trail for every real frozen-section case reviewed against its final diagnosis, not just the ones where a mismatch was found.

## Files

- **`ReconciliationRecord.ts`** — renamed from `DiscordanceRecord`. The old model only ever wrote a record on a real mismatch, so there was no real denominator for a concordance rate (a numerator with no total-reviewed count). Per ISO 15189/CAP audit-trail expectations, a real QA log needs to prove the full reviewed population, not just the exceptions.

---
*See [types/README.md](../README.md) for how this folder fits the whole types/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master types/README.md if this folder's overall PURPOSE changes.*
