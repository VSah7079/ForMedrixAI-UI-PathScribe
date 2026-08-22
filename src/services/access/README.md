# services/access/

Real, tracked AccessRequest tickets — Pediatric, Pool, and Orchestration
access requests. Built per direct follow-up: "Do we Track the request to
gain access? I would think that would be a good quality metric. How long
did the Admins take, Do we generate a ticket system that has its own
status."

Confirmed directly before building this: the pre-existing "request
access" flow (`utils/accessRequests.ts`'s `sendAccessRequestToAdmins`)
only ever sent a message — no real, tracked record existed anywhere, and
the pool flow's own "already requested" check was a bare, per-browser
`localStorage` boolean, not a real, status-bearing ticket.

**Pattern:** Standard interface/mock pattern (no firestore stub yet —
genuinely new work, not a gap).

## Files

- **`IAccessRequestService.ts`** — the contract. `AccessRequest` has a
  real, three-state lifecycle (`pending` → `granted`/`denied`), with
  `resolvedAt`/`resolvedByUserId` for the real turnaround-time metric.
- **`mockAccessRequestService.ts`** — the real, currently-active
  implementation. 10/10 tests in `mockAccessRequestService.test.ts`.

## How this connects to the rest of the app

- **Creation** — `utils/accessRequests.ts`'s `sendAccessRequestToAdmins`
  creates a real ticket alongside the existing admin-notification
  message (same two-track pattern already proven out for Informal
  Review requests — see `services/reports/README.md`). Called from the
  three real request-access UI entry points: `WorklistTable.tsx`
  (Pediatric and Orchestration) and `PoolClaimModal.tsx` (Pool).
- **Resolution** — also in `utils/accessRequests.ts`:
  `checkAndResolvePoolAccess` / `checkAndResolveOrchestrationAccess`
  (single-condition, resolve immediately) and
  `checkAndResolvePediatricAccess` (genuinely requires BOTH the
  user-level `canViewPediatric` flag AND the specific facility's own
  `authorizedPediatricPathologistIds` list — re-checks both real
  conditions directly rather than assuming the other half just because
  one call site changed). Wired into every real admin action that could
  satisfy a request: `StaffTab.tsx` (pool membership, orchestration
  flag, pediatric flag) and `ClientDictionaryPage.tsx` (the facility's
  own authorized list).
- **Admin queue** — `components/Config/Staff/AccessRequestsQueue.tsx`, a
  new "Access Requests" sub-tab in Staff config. Grant acts on the real,
  underlying permission directly (and closes the ticket in the same
  action) rather than sending the admin to a separate screen.
- **Quality metric** — `ACCESS_REQUEST_RESPONSE`, a real, new TAT type
  in `TATConfigSection.tsx` (24h system default, not role/client/
  urgency-scoped — every requester gets the same admin-response target).
  `computeAccessRequestResponseOutliers` in
  `Contribution/qualityCalculations.ts` is the real metric, wired into
  `QualityTab.tsx`.

## Notes

- Real, deliberate design choice: Pediatric access requires a genuine
  two-part grant. A pending request is only ever marked resolved once
  both real conditions are independently confirmed true — never assumed
  from either half alone.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
