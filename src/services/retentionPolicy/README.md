# services/retentionPolicy/

Retention-eligibility resolution, the two real computed disposal-related queues, and the real, physical scan-to-dispose action. Deliberately **not** the batch/container model (`services/batches/`) — disposal is a genuinely different workflow: a real, computed worklist with direct scan-to-act, not a manually-created, manually-loaded batch.

**Pattern:** Mixed — `RetentionPolicy.ts` is a pure types/config module (no interface/mock split); the rest are pure computation/resolution functions, not CRUD services.

## Files

- **`RetentionPolicy.ts`** — real retention-window config per `RetainableMaterialType` (block, slide, wet_tissue, decant_slide, etc.), per jurisdiction (RCPath/UK, CAP/CLIA/US).
- **`resolveRetentionEligibility.ts`** — resolves the real, most-conservative eligible-for-disposal date for a given material type + jurisdiction + specimen dictionary entries.
- **`computeDisposalQueue.ts`** — real, computed queue: every block/slide/decant/decant-slide currently eligible for disposal right now (retention period elapsed, no active retention hold, not already disposed), facility-scoped. Surfaced at `/batch-management/disposal`, with direct scan-to-dispose.
- **`disposeItemByScan.ts`** (+ `specimenDisposal.test.ts`) — the real, physical scan action. Rejects a scan against a case with an active retention hold, a not-yet-eligible item, or an already-disposed item — never silently succeeds.
- **`computeActiveRetentionHoldsQueue.ts`** (+ `.test.ts`) — real, computed queue: every case with a currently-active `RetentionHold` (`types/case/RetentionHold.ts`), oldest-first. Surfaced at `/batch-management/retention-holds`. A case can have multiple accumulated holds over its life — this includes every case with at least one currently-active entry, one row per active hold, not one row per case.

## Notes

- All three real queues here follow the same "derive fresh every time, never a separately stored, driftable copy" discipline — a case appears in a queue purely because its own real data currently satisfies the condition, never because of a cached flag that could drift from reality.
- `RetentionHold` (case-level, gates disposal after finalization) is a deliberately separate concept from `CaseHold` (`types/case/CaseHold.ts` — case-level, gates finalize on an active, not-yet-done case) — see that type's own header for the full distinction. Neither type lives in this folder; both are referenced by the queue functions here.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
