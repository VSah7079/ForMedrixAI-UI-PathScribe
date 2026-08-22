# components/Audit/

## Files

- **`useAuditLog.ts`** (463 lines) — Centralized audit logging hook,
  used across many folders (confirmed consumer in `ValidationStudies/`,
  `Search/`, and others this session). Auto-stamps user email, UUID,
  timestamp. **FIXED this pass:** the file's top comment was literally
  duplicated twice in a row (a leftover from a past "drop this file in"
  patch instruction that was never cleaned up after being applied).
  Consolidated into one clean header. No other issues.

  **Two more real, genuine gaps found and fixed later the same
  session**, per direct specification, building Phase 5 of the
  Post-Sign-Out Release Buffer ("audit-logging polish"): (1)
  `sign_out_buffered` had been logged via this hook's own `log()`
  callback since that feature's Phase 1, but was never actually
  registered in `AuditAction`/`AuditPayload`/`buildDetail()` here —
  meaning it silently fell through to a raw `JSON.stringify(payload)`
  instead of a real, clean sentence like every other event in this
  file gets. (2) `log()` itself never forwarded a real `caseId` to the
  underlying `AuditEvent` at all — see `types/AuditEvent.ts` and
  `audit/auditLogger.ts` for the fuller, app-wide story (this wasn't
  scoped narrowly to the one new event; the same generic fix closes the
  gap for every other real payload in this file that already carries a
  genuine `caseId`, like `flag_applied` and `case_search_opened`).
  `facilityId` added the same way, for the same real reason.

- **`InterfaceExceptionReviewModal.tsx`** — Real feature, per direct
  confirmation, building the "Manual Review Queue / Flagging (Safest)"
  approach for `services/interfaceExceptions/` — originally built for
  ADT^A43 alone, **generalized in Phase A of the "Interface Exception &
  Case-Binding Module"** to cover A40/A24/A47 too, since all four now
  route to the same real queue whenever an identity can't be safely,
  confidently resolved. **Opened from `AuditLogPage.tsx`'s real,
  independent "Interface Log" tab** — originally a "🔌 Interfaces" pill
  on the Error Log tab, redesigned into its own top-level tab later
  the same session (see `services/interfaceExceptions/README.md`'s own
  "Real Interface Log tab redesign" section). Resolves both the source and target patient
  (`MasterPatientRecord`) for every exception type. The case-selection
  / "Move Selected Cases" action, though, only renders for `A43` — a
  real A40/A24/A47 exception is an unresolved IDENTITY, not a
  case-binding problem, and offering "move a case" for those would be
  an action that doesn't actually apply. For A43, confirming calls the
  exact same `mockPatientIndexService.moveCaseToPatient()` a real
  inbound A43 would have called if it could auto-resolve — a human-
  driven front end for that one real operation, not a second, parallel
  implementation. `Dismiss` stays available for every exception type.
  A real, full manual identity-binding UI for A40/A24/A47 is a
  separate, not-yet-built follow-up. See
  `services/interfaceExceptions/README.md` and `services/hl7/README.md`
  for the full story this UI closes the loop on.

- **`BreakGlassRebindModal.tsx`** — Phase B of the "Interface
  Exception & Case-Binding Module," per direct confirmation: the
  restricted UI for `mockPatientIndexService.breakGlassRebind()`.
  Gated to `isAdmin` at both the trigger button and the render itself
  in `pages/AuditLogPage.tsx` (defense in depth), only surfaced
  on the real "Interface Log" tab (originally alongside the old
  "🔌 Interfaces" pill — see above). **Renamed to "Map Patient" in
  every real, user-facing string later the same session**, per direct
  feedback that "Break-Glass" didn't read as clear — trigger button,
  modal title, confirm button, and both result messages all updated;
  the underlying `breakGlassRebind()` call and its own real
  restrictions are unchanged, this was a labeling fix only. Its own
  modal chrome was also found using a real, rare, minority CSS pattern
  (`ps-modal-overlay`/`ps-iexc-modal` — confirmed via a direct count,
  only 4-5 uses total across the whole app) instead of the real,
  dominant standard (`ps-overlay`/`ps-modal-dark`, confirmed 174/47
  uses) — fixed to match. Real flow: select a genuinely
  `isDowntimeRecord`-flagged patient → search/select the real,
  `isDowntimeRecord`-flagged patient → search/select the real,
  confirmed target (`searchPatients()`, new) → reason code, pre-filled
  from the downtime record's own original reason as a sensible
  default → free-text justification with live character-count
  feedback (`BREAK_GLASS_MIN_NOTE_LENGTH`) → an explicit "Review &
  Confirm" step before the irreversible action fires. Every real
  restriction (genuine downtime flag required, mandatory reason code +
  10-character justification) lives in the service layer, not just
  here — same "no second, parallel implementation" posture as
  `InterfaceExceptionReviewModal.tsx`. See
  `services/patients/README.md` for the full backend story.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
