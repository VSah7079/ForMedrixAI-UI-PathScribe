# PathScribe Update 252 — Summary

The core, compliance-critical decision logic for the Stain QC Module's Gating Strategy (PS-289/PS-292) — the data model, the pure resolver, and the auto-deficiency wiring on a real, confirmed failure. This is the foundation the actual sign-out gate (next piece) will sit on.

## A real tension found and reconciled before writing any logic
Two pieces of direct guidance from earlier in this thread could otherwise read as contradictory: the original Stain QC spec's own section 2.4 says a failed run must "prevent clinical reporting" — unconditional. The later Gating Strategy research describes Auto-Resolve as clearing "without blocking the user" — meaning it never actively blocks. Reconciled directly: a confirmed failure blocks in every mode, since it's a conclusive negative signal, not an absent one. Auto-Resolve's "never blocks" posture only applies to a signal that simply hasn't arrived yet — the moment it arrives as 'Run Failed', every mode blocks the same way. This distinction is now the tested, documented behavior, not an assumption.

## What changed

- StainType.qcEnforcementMode — the per-stain override, reusing the exact same QcEnforcementMode type WorkstationGroup already defines rather than a second, parallel enum.
- Batch.qcVisualReadConfirmation — the real audit object ({userId, userName, confirmedAt}) for a human completing the Enforced-mode visual read checklist, plus mockBatchService.confirmQcVisualRead().
- resolveStainQcGate.ts — the pure decision function, deliberately taking already-resolved inputs (same real separation this app already uses elsewhere between "gather the data" and "decide, given the data"). Returns not-applicable | clear | blocked-failed | blocked-enforced | blocked-hybrid. Never assumes a default-enforced gate for a stain that never opted into any enforcement mode at either level — absence of configuration means no gate.
- resolveEffectiveQcEnforcementMode() — the one real place StainType's own override is weighed against WorkstationGroup's own default, per the already-made decision ("both — instrument-level default, per-stain override"): the stain's own override wins when set.
- def-stain-batch-failed — a new deficiency type, genuinely distinct from the deliberately-manual def-missing-fixation-completion: this one is auto-raised, the moment a real 'Run Failed' instrument status arrives, against every real specimen the failed batch's own items belong to. Wired directly into setStainingInstrumentStatus.

## Verification
tsc clean throughout. Full suite: 458 files, 3995 tests, all passing (up from 456/3978 — 17 new tests: 14 for the pure resolver covering every mode/status combination, 3 for the auto-deficiency-on-failure wiring).

## Honest scope
This is the decision logic and the failure-side consequence, both real and tested — but nothing yet calls resolveStainQcGate() from the actual sign-out flow. A case can still be signed out today regardless of what this resolver would say, since it isn't wired into useSignOutWorkflow.ts yet. That wiring — plus a new gate modal, mirroring FixativeTimeGateModal.tsx, for a human to actually complete the visual read checklist — is the next, separate piece.
