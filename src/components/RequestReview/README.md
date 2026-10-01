# components/RequestReview/

## Files

- **`RequestReviewModal.tsx`** — "Request Informal Review" — sends an
  internal message to a colleague with the case attached (explicitly NOT
  the same as Delegate — no ownership transfer, own comment is clear on
  this). Uses the shared `ps-modal-dark`/`ps-overlay` CSS pattern. Reviewer
  list now sourced live from the real user directory — see Notes for the
  bug this replaced.

## Notes — real bug, FIXED (July 2026)

Used to have a hardcoded 6-entry `REVIEWERS` array whose own comment
claimed it "mirrors AppShell INTERNAL_USERS." It didn't, and Pete's own
analysis of both lists was more precise than the original diagnosis:
`AppShell.tsx`'s real directory is a broad, non-clinical general-staff
messaging list (Lab Manager, IT Support, Billing Dept, Archives — actual
departments, not reviewers), while this modal legitimately needs a
narrow, clinically-appropriate subset — a genuinely different scope, not
a mirror. The 4 `uk-*` names weren't a deliberate separate pool either;
the whole array was just a standalone list that was never connected to
any real data source, which is exactly how it drifted into real ID
collisions with `AppShell.tsx`'s directory:

| ID | `AppShell.tsx` | `RequestReviewModal.tsx` (old, hardcoded) |
|---|---|---|
| `u3` | System Admin | Dr. James Chen |
| `u4` | Dr. Sarah Li Chen | Dr. Maria Santos |

**Fix:** now fetches from `services/users/mockUserService.ts` — the same
real, canonical `StaffUser` directory `StaffTab.tsx` and `CaseTeamModal.tsx`
already use — filtered to `status === 'Active' && roles.includes('Pathologist')`,
excluding the sender. This is a real, role-based, collision-free subset:
none of its IDs (`1`, `6`, `7`, `9`, `PATH-001`, `PATH-UK-001`, etc.)
overlap with `AppShell.tsx`'s `u`-prefixed range at all, so the whole
class of collision is gone by construction, not just patched around.
Display name/subtitle built from real `firstName`/`lastName`/`department`
instead of the old fictional "Consultant Histopathologist"-style titles.
Added loading and empty states since the list is now fetched
asynchronously instead of available synchronously from a constant.

Confirmed via grep: zero remaining references to the old `REVIEWERS`
constant anywhere in the file.


## Batch 363 (PS-72): patient data tagged for screenshot redaction

`RequestReviewModal.tsx`: the confirmation text, which names the case, is tagged.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
