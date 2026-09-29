# services/validationStudies/

Validation Study governance — parallel-run comparison of AI-assisted reporting against existing workflow.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Real governance state machine: draft -> pending_approval -> approved -> active -> closed -> reported. Activation is blocked until committeeApproval is recorded with a valid irbReference — a real gate, not just a status field.

## `resolveActiveStudyId.ts` (Batch 318)

`resolveActiveStudyId(scope, studyService)` returns the active study covering a case (ordering facility, signing pathologist, subspecialty), or undefined. A failed lookup is logged and also returns undefined; a signal is never lost for lack of a study.

Both Level 1 AI-learning captures now use it, so they can't disagree about which study a case belongs to:
- the narrative-edit signals (this lookup used to be inline in `useSignOutWorkflow.ts`);
- the abnormal-detection agreement signals (PS-137).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*