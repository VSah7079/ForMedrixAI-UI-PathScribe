# pages/CriticalAlertReferencePage/

**NEW (Sep 2026)** — PS-136 follow-up redesign. The public,
unauthenticated landing page (`/critical-alert/:token`) behind the
SMS/secure-email non-PHI "tap to view" reference link. Same "public
route" posture as `ExternalConsultViewPage/`, added for a third,
distinct reason from either that route or the kiosk dashboards: unlike
`/consult/:token`, this page was deliberately designed to need no real
authentication at all, by never displaying anything PHI-bearing in the
first place.

## Files

- **`CriticalAlertReferencePage.tsx`** — resolves the URL token
  (`mockCriticalAlertReferenceTokenService.resolve()`) and renders ONLY
  `accessionNumber`/`physicianName`/link status/timestamps from the
  resolved record. **Deliberately never renders `findingTerm`,
  `findingSeverity`, or `sourceQuote`**, even though the resolved token
  record itself carries them (for the internal, authenticated audit
  viewer only — `pages/CriticalAlertAuditSection.tsx`) — there is no
  real authentication gate on this page to justify showing clinical
  content, so it doesn't. See the component's own header and
  `services/clinical/ICriticalAlertReferenceTokenService.ts`'s for the
  full reasoning, and `App.tsx`'s own route comment for how this
  answers the pre-existing `/consult/:token` warning against building
  another unauthenticated PHI-bearing page without the same explicit
  caveat. Records exactly one real access event per page view
  (`recordAccess()`), separate from the validity check itself, and
  supports a real "Acknowledge Reviewed" action
  (`recordAcknowledged()`) — part of the real audit trail the internal
  viewer shows.

## Deliberate scope cuts

- **No EHR SSO/SMART-on-FHIR handoff** — the real, intended production
  architecture behind this link is the receiving physician
  authenticating via their OWN EHR's SSO, which then hands off to the
  actual chart. That integration needs a real, per-customer EHR
  connection this environment has no credentials for; this page models
  only the real, buildable piece in front of it (issuing and resolving
  the opaque reference), same disclosed-simulation boundary
  `alertChannels/` already draws for the underlying dispatch.
- **No clinical content of any kind** — not a cut for lack of time; a
  deliberate, permanent design boundary (see above). Do not add
  `findingTerm`/`findingSeverity`/`sourceQuote` rendering here without
  first re-opening the caveat this page's own design was written to
  satisfy.

---
*See [pages/README.md](../README.md) for how this folder fits the whole pages/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
