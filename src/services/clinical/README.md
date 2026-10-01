# services/clinical/

PS-105 (Core Abnormal Detection Engine) — real, negation-aware detection of
critical/abnormal narrative findings at sign-out, plus the real, CAP/Joint
Commission-shaped record of how a pathologist actually communicated one.

**Pattern:** two related but genuinely separate concerns — real-time AI
detection (`detectCriticalFindings.ts`, a standalone function, not a service)
and a permanent, append-only notification record (`ICriticalResultNotificationService`,
standard interface/mock triplet).

## Files

- **`detectCriticalFindings.ts`** — Built on this app's existing, proven `callAi()`
  provider abstraction (`services/aiIntegration/`) rather than a separate
  spaCy/MedSpaCy pipeline this app has no real infrastructure for — same
  established pattern as `evaluateSynopticAssignment` (`services/cases/mockCaseService.ts`).
  Negation-aware by prompt design (flags "high-grade dysplasia," never "no
  evidence of high-grade dysplasia"). Deliberately scoped to narrative text
  only (gross/microscopic/ancillary) at the function's own signature level —
  never patient name, MRN, or DOB, a real enforced boundary, not an implicit one.
  Real, per direct guidance ("the case is considered abnormal or not, however
  the human makes the final call. We just offer the suggestion and why with a
  confidence factor"): `CriticalFindingFlag` carries a real `confidence` (0-100,
  clamped and defaulted defensively — never trusted blindly from the model) and
  shares `AbnormalSeverity` (`Abnormal` | `Critical` | `Malignant`) with PS-129's
  discrete trigger-rule dictionary (`services/abnormalDetection/`) — one real,
  unified severity vocabulary across both detection paths, not two
  independently-drifting ones. Never a hard gate on its own — only detects and
  returns real, structured flags; the sign-out workflow decides what to do with
  them.
- **`ICriticalResultNotificationService.ts` / `mockCriticalResultNotificationService.ts`** —
  Real, append-only `CriticalResultNotification` records — same "never edit
  history, only add a new record" posture as `ServiceChargeRecord`/`AmendmentRecord`
  elsewhere in this app. A case can genuinely accumulate more than one (an
  intraoperative frozen callback, followed later by a real critical finding at
  final sign-out). `migrateIntraopVerbalReport` closes a real, separate gap
  where `IntraoperativeEntry.verbalReportLog` never survived merge into the
  real case.

## Notes

- Real, per direct guidance — regulatory basis, confirmed by direct research (not assumed) across this app's three real, planned supported regions (`terminologyConfig.ts`'s own `GOVERNING_BODY_TO_ICD10_VARIANT`: CAP/US, RCPath/UK, RCPA/Australia-NZ):
  - **US (CLIA/CAP)** — CAP checklist COM.30000, ANP.12175 (anatomic pathology), CYP.06450 (cytopathology). Each lab defines its own critical values; records must show prompt notification. CAP explicitly confirms the identifier format for "who was notified" is the lab's own policy choice, not a fixed CAP format — directly supports this file's own free-text `notifiedBy.userName`. Preferred method is a phone call; secure messaging is the documented fallback when a call can't be reached. Notification is not required for a deceased patient unless local policy is stricter.
  - **UK (RCPath)** — G133 "Communication of unexpected findings, urgent reports, delayed reports and the use of alert systems in diagnostic cellular pathology" (current version active February 2026) is the real, domain-specific document (cross-referencing the broader G158). Two direct confirmations of this file's own design: "the fact that an urgent communication has taken place should ideally be documented within the report" (exactly what this service does), and — on automated flagging specifically — "no reliance should be placed on such a system to prevent harm...as subjective interpretation is required," independently confirming the "system flags, human decides" principle this whole PS-105 build follows. Secure email is explicitly named as an acceptable method here, unlike the US's phone-first posture.
  - **Australia/NZ (RCPA/AACB)** — "Consensus Statement for the Management and Communication of High Risk Laboratory Results" (RCPA/AACB working party). Most prescriptive of the three on documentation: for a verbal notification specifically, the record "should also contain the identity of the notifier." Real, important nuance: fax alone is insufficient — "results communicated by facsimile need to be followed up by a telephone call...to confirm receipt." Real, specific retention requirement: minimum 7 years for adult patients, longer for paediatric.
  - **Convergent finding across all three**: none require or even suggest automated SMS/email/EHR-push for pathology results specifically — all three converge on the same real design this service already has (who notified whom, by what method, with confirmation of receipt), independently reinforcing PS-136's own real conclusion.
  - **South Korea** — checked directly, per direct follow-up ("is South Korea have a similar posture?"), and partially similar, with one real structural difference worth flagging honestly. Korean labs can be accredited under KOLAS against ISO 15189 (a real, direct parallel to this app's own `EU_ISO15189` governing-body entry — `services/governingBodies/mockGoverningBodyService.ts`), and ISO 15189 does generally require critical value notification — but real adoption has historically been narrow (a handful of labs), nowhere near CLIA's near-universal US reach. Separately, KOIHA (Korea Institute for Healthcare Accreditation), the real national *hospital* accreditation body, states its own patient-safety standards align with JCI's (Joint Commission International) International Patient Safety Goals — and JCI's IPSG.02 specifically requires critical-result reporting with a **read-back** between reporter and receiver, the same real concept this service's own `readBackConfirmed` field already captures. Reasonable, well-supported inference that Korean-accredited hospitals face a similar requirement, not a directly-confirmed citation the way the other three regions have (KOIHA's own standards document wasn't directly accessible). **Real, honest gap, matching this same codebase's own prior finding for Korean retention periods** (`mockGoverningBodyService.ts`'s `KR_MSA` entry): no Korean pathology-society-specific document was found — playing the role RCPath's G133 or CAP's ANP.12175 play for anatomic pathology specifically.
  - **Real, deliberate structural difference from US/UK/AU**: Korean hospital accreditation (KOIHA) is *voluntary* — a hospital opts in — unlike US CLIA, which is mandatory for any lab testing patient specimens. Per direct guidance: "our feature should provide them the necessary relief for notifications. It's up to the customer to determine its use." This service's own general shape (`notifiedBy`, `method`, `readBackConfirmed`) already supports whichever real, applicable standard a given Korean customer has actually chosen (KOLAS/ISO 15189, KOIHA/JCI-aligned, or neither) — deliberately never hard-coded to one specific country's specific checklist, since which standard genuinely applies varies by the customer's own accreditation choice, not by jurisdiction alone.

- Wired into the real, live sign-out flow: `useSignOutWorkflow.ts`'s
  `fetchCriticalFindings` (called at the "attempts electronic signature"
  moment), `handleRecordCriticalNotification` (the pathologist records a real
  notification — the human's confirmed action), and
  `handleAcknowledgeCriticalFindings` (a real, honest soft-block dismiss — "the
  detection here is an LLM-based heuristic that can be wrong, and the finding
  may already have been communicated through a real means this feature doesn't
  capture"). Gates on `Critical`/`Malignant` severity only; `Abnormal` alone
  doesn't prompt the modal.
- Genuinely distinct from PS-136's own automated dispatch pipeline
  (`dispatchCriticalAlerts.ts`, `resolveCriticalAlertChannels.ts`,
  `alertChannels/`, `mockCriticalAlertDispatchService.ts`) — this
  folder's notification record is a human logging that they already
  made a real phone call/page, additive to (never replaced by) that
  automated dispatch. **Real, direct correction**: this note previously
  read "still blocked, no real transport exists for any of those
  channels" — true when first written, no longer true. Per direct
  guidance following an RFP discussion (a real, specific customer need,
  exactly the condition PS-136's own deprioritization said would bring
  it back), the full automated pipeline was built: real physician
  contact resolution, a real, pure severity/preferred-channel rule
  engine, real per-case audit persistence, wired into
  `useSignOutWorkflow.ts` at the same point the human notification is
  recorded. Only the one network call inside each of the three channel
  adapters remains a disclosed stub (no real Twilio/secure-email/EHR
  vendor is contracted in this environment) — swapping in a real vendor
  there is a contained, later implementation-and-testing task, not a
  redesign. Full account in `src/i18n/README.md`'s own batch log and
  PS-136's own Jira comment history.
- **Real, follow-up redesign — zero-PHI sms/secure_email transport.**
  Per a direct engineering brief following the pipeline note just above:
  standard telecom SMS carriers and standard transactional email relays
  generally will not sign a HIPAA BAA, so `sendSmsAlert.ts`/
  `sendSecureEmailAlert.ts` no longer put `findingTerm`/`findingSeverity`/
  any patient-identifying detail in the message body at all — only a
  fixed, generic, non-PHI template plus an opaque reference link
  (`ICriticalAlertReferenceTokenService.ts`/
  `mockCriticalAlertReferenceTokenService.ts`, new this phase). The real,
  intended production architecture behind that link: the receiving
  physician authenticates via their OWN EHR's SSO/SMART-on-FHIR launch —
  never a PathScribe-hosted login, which doesn't exist anywhere in this
  app (confirmed by direct search of `services/auth/` and
  `IPhysicianService.ts` before building this). `ehr_push` is
  deliberately unchanged and keeps real clinical detail — it already
  routes through the receiving institution's own interface-engine/EHR
  trust boundary, never a public link, same reasoning
  `pushEhrInboxAlert.ts`'s own header documents.

  The new public route this link resolves to
  (`/critical-alert/:token` → `pages/CriticalAlertReferencePage/`) is a
  direct, deliberate answer to `App.tsx`'s own `/consult/:token` route
  warning ("do not treat this route as a precedent for any other
  unauthenticated PHI-bearing page without the same explicit caveat"):
  it never renders `findingTerm`/`findingSeverity`/`sourceQuote`, since
  it has no real authentication to gate that content with — only
  `accessionNumber`/`physicianName`/link status, plus a disclosed-
  simulation banner matching `ExternalConsultViewPage.tsx`'s own. Real
  clinical detail stays visible only inside the new, internal,
  authenticated **Audit Page > Critical Alerts** tab
  (`pages/CriticalAlertAuditSection.tsx`), which joins each
  `CriticalAlertDispatchRecord` to its own reference token's real
  access/acknowledgement history — the "Complete Audit Trail" ask this
  phase closes. `dispatchCriticalAlerts.ts` now requires
  `accessionNumber` on its input (threaded through from
  `useSignOutWorkflow.ts`) and pre-generates the dispatch record's own
  id so a reference token can honestly link back to it from the moment
  it's issued, before that record exists in storage
  (`ICriticalAlertDispatchService.ts`'s own `record()` now accepts an
  optional caller-supplied `id`).
- **`postGaAlertChannels/` — real, deliberately NOT-wired-in cutover
  candidate.** Per direct follow-up ("Can the interface engine be used
  for any post GA modification to fully implement this feature?" →
  "Can you build the patch and keep it separate in the repo?"): the
  same three channels, routed through this app's one real, generic
  outbound HTTP transport (`dispatchInterfaceMessage.ts`, new
  `'CRITICAL_ALERT'` transaction type) instead of the local
  `console.info` stubs `alertChannels/` still is today.
  `dispatchCriticalAlerts.ts` is untouched — this module isn't imported
  anywhere in the live call path, so it changes nothing about current
  behavior until someone deliberately activates it (three import swaps
  — see the folder's own README, which also has the full, real account
  of the customer-side delivery options this was researched against:
  SMTP relay/OAuth for email, email-to-SMS gateway or interface-engine
  offloading for SMS. The carrier data-model gap that
  email-to-SMS needs (`Physician` had no carrier field) is now closed:
  `Physician.smsCarrier`/`smsCarrierOtherDomain`
  (`services/physicians/IPhysicianService.ts`), set via the Physicians
  config UI, resolved into a real gateway address by the new
  `services/physicians/resolveEmailToSmsGatewayAddress.ts` and carried
  on this module's `CRITICAL_ALERT` envelope. What's left — actually
  registering OAuth/SMTP-relay tenants and routing on the receiving
  side — is backend work in the separate `receive_interface_message`
  repo, out of this codebase's scope.
- **10 real tests** in `detectCriticalFindings.test.ts` (empty-input handling,
  real parsing, markdown-fence stripping, honest-empty-on-no-finding, error
  handling for bad JSON/failed calls, the PHI-minimization boundary, defensive
  severity/confidence validation) plus coverage in
  `mockCriticalResultNotificationService.test.ts` and
  `useSignOutWorkflow.test.ts`'s own sign-out-integration suite.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
