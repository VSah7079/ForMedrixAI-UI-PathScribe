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
- Genuinely distinct from PS-136 (SMS/secure email/EHR task push — still
  blocked, no real transport exists for any of those channels). This folder's
  notification record is a human logging that they already made a real phone
  call/page — not an automated dispatch system.
- **10 real tests** in `detectCriticalFindings.test.ts` (empty-input handling,
  real parsing, markdown-fence stripping, honest-empty-on-no-finding, error
  handling for bad JSON/failed calls, the PHI-minimization boundary, defensive
  severity/confidence validation) plus coverage in
  `mockCriticalResultNotificationService.test.ts` and
  `useSignOutWorkflow.test.ts`'s own sign-out-integration suite.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
