# api/qa/deficiencies/

Real Vercel serverless functions for the CAPA lifecycle actions a QA reviewer performs on a real, Firestore-backed `SpecimenDeficiency` record — the client-facing counterpart to `api/webhooks/engine/_lib/raiseSpecimenDeficiency.ts`, which only ever *creates* a deficiency. These four endpoints are what let `QualityAssurancePage.tsx` actually act on one once it exists.

**Why this exists as a separate folder from `api/webhooks/engine/`:** genuinely different real callers and a genuinely different trust model. The Engine webhooks are called by an external, non-human system that can keep a server-side secret. These four are called by this app's own frontend — a browser — which cannot.

## The real state machine, corrected once already

The real `SpecimenDeficiency.status` union is `'open' | 'pending-verification' | 'closed'` — a 3-stage lifecycle, **not** the 4-stage `open → contained → resolved → verified` an earlier version of this plan assumed. Confirmed directly against `src/services/deficiencies/IDeficiencyService.ts` before building anything. Mapped correctly:

| Endpoint | Real transition | Real `ISpecimenDeficiencyService` method it mirrors |
|---|---|---|
| `contain.ts` | `open` → `closed` directly (no intermediate status) | `containImmediately()` |
| `resolve.ts` | `open` → `pending-verification` (never "resolved" — that status doesn't exist) | `resolve()` |
| `verify.ts` | `pending-verification` → `closed`, **or back to `open`** on a real `recurred` outcome | `verifyEffectiveness()` |
| `raise-and-resolve.ts` | creates a brand-new document directly at `closed` (no "draft" status exists) | `raiseAndResolve()` |

## Files

- **`contain.ts`** — "Immediate Containment." Requires `deficiencyId, resolutionTypeId, resolutionComment, resolvedBy`. Per `ISpecimenDeficiencyService`'s own real reasoning: the fix and the record of the fix are the same action here, nothing meaningful to verify later.
- **`resolve.ts`** — "Escalate to CAPA." Requires `deficiencyId, resolutionTypeId, correctiveAction, rootCause, resolvedBy` (`preventiveAction`, `verificationDueDate` optional). Moves to `pending-verification`, not closed — ISO 15189:2022 Clause 8.7 requires a genuine, later effectiveness check.
- **`verify.ts`** — The actual effectiveness check. Requires `deficiencyId, outcome: 'effective' | 'recurred', verifiedBy` (`comment` optional). `recurred` increments the real `reopenCount` on the document — read via `transitionDeficiency`'s own current-state callback, since the increment depends on the document's existing value, not a static payload.
- **`raise-and-resolve.ts`** — The one endpoint here that doesn't transition an existing record; it creates a brand-new one, directly closed, for "minor, self-contained bench corrections" — the fix and its record are one action. Real, honest scope note: every *existing* real use of `raiseAndResolve()` in this app (fixative-time gate, tissue discrepancy, dictionary-mismatch, post-hoc correction) still runs against `mockSpecimenDeficiencyService.ts`'s own `localStorage` implementation — this endpoint doesn't replace any of them, and none of those call sites have been migrated to use it. Built for real, future backend-triggered or migrated frontend use, not because an existing flow was broken.

## `_lib/transitionDeficiency.ts`

Shared transactional guard for the three real transitions (`contain`/`resolve`/`verify`) — mirrors `applyEngineCaseUpdate.ts`'s own callback shape (read current state inside a real transaction, let the caller compute the update from it). Checks the document's own **current** status is one of the real, expected starting states before ever writing — what stops a double-click, a stale browser tab, or two reviewers racing on the same record from corrupting a real CAPA record's lifecycle (e.g. "resolving" an already-closed deficiency a second time). `raise-and-resolve.ts` doesn't use this — it creates a document, there's no existing state to guard.

## Auth — a real, unresolved question, not an oversight

None of these four endpoints verify caller identity at all. `resolvedBy`/`verifiedBy`/`raisedBy` are accepted directly from the request body and trusted — matching the same honor-system identity model `user?.id` already represents everywhere else in this app's current, real UI (there is no real, server-verifiable session to check against; see `api/webhooks/engine/README.md`'s own "Auth posture" section for the full finding on why).

**Explicitly considered and declined**: a shared secret like the Engine webhooks use. That mechanism's real security property depends on the secret never leaving a server — the Engine holds it, a browser never does. These endpoints' only real caller *is* a browser, so any secret protecting them would have to ship inside the public JS bundle, readable by anyone via devtools. That's the appearance of security, not the real thing, and shipping it would risk someone treating these endpoints as genuinely gated when they aren't.

The real fix is the same one already identified as this app's single largest outstanding gap: real Firebase Authentication (or an equivalent server-verifiable session), so a real ID token can be verified server-side here the way `verifyEngineAuth.ts` verifies a shared secret. Not built yet — blocked, at last check, on confirming whether a real Firebase project even exists for this app at all.

## Testing

Same real split as `api/webhooks/engine/`: unit tests (`*.test.ts`, mocked, run in the normal suite) verify each handler's own logic; nothing here has ever been run against a real Firestore project or a real browser session.

---
*When this folder's contents change meaningfully, update THIS file. See `api/webhooks/engine/README.md` for the sibling, Engine-facing half of this same real CAPA foundation.*
