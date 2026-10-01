# services/cancerRegistry/

Real, per the RFP-APLIS-2026-GLOBAL Broader Cancer Registry Exports
gap: NAACCR (US), CPAC (Canada), COSD (UK), INCa (France), ADT/GEKID
(Germany), AIHW (Australia), NZ Cancer Registry, and KCCR (Korea) —
for surgical pathology broadly, genuinely distinct from
`services/cytology/`'s own cervical-screening-programme registries
(KNCSP/KCCR, CSMS, CervicalCheck, PALGA, NCSR).

## The critical finding that shaped this whole module

Before writing any code, `services/facilities/IRegistrySettingsService.ts`'s
own header was found to already defer this exact work, pointing to
`src/FHIR_DISPATCH_ARCHITECTURE_PLAN.md` — a real, already-researched
document. That document's own "critical finding":
**NAACCR/SEER/NPCR/CoC explicitly exclude carcinoma in situ of the
cervix and CIN III from reportability, effective 1996**, alongside
PIN III and skin BCC/SCC, and **the Cancer Registry branch must never
be triggered from cytology sign-out** — a Pap smear is a screening
impression, not a diagnosis, regardless of severity. This module's
own real trigger (`dispatchCancerRegistryReportIfApplicable.ts`) is
wired into `useSignOutWorkflow.ts`'s real, confirmed surgical
pathology sign-out (`handleSignOutConfirm`) and nowhere else.

That same document flagged a genuinely unconfirmed, checkable
question for whoever built this next: does this app actually persist
an ICD-O-3 code's own real behavior digit (the /2 vs /3 the exclusion
rule above depends on) anywhere? **Confirmed directly: it did not.**

## Real, foundational fixes made before any registry logic could be honest

- **`synopticTypes.ts`**: `MedicalCode.system` gained `'ICD-O'` as its
  own, distinct value — previously only `'SNOMED' | 'ICD' | 'CPT'`
  existed, so an ICD-O code selected via `AddCodeModal.tsx`'s own
  'ICDO' filter tab had nowhere honest to land except `system: 'ICD'`,
  indistinguishable from a plain diagnosis code.
- **`types/case/Specimen.ts`**: `Specimen.coding` gained a real,
  per-specimen `icdO?: { code, description }[]` array, mirroring the
  existing `icd10`/`snomed` fields exactly — confirmed nothing like it
  existed anywhere before adding it.
- **`SynopticReportPage.tsx`'s `handleAddCodesToSpecimens`**: a real,
  confirmed bug found and fixed while wiring this in — this function
  only ever filtered for `system === 'ICD'` and `'SNOMED'`, meaning an
  `'ICD-O'`-tagged code reaching it was silently dropped entirely, not
  merely unsupported. Fixed to persist real ICD-O codes into the new
  `coding.icdO` field, mirroring the ICD10/SNOMED handling exactly.

## Files

- **`resolveIcdOBehaviorCode.ts`** — real, pure parse of the real,
  standard WHO ICD-O-3 behavior digit from a code's own combined
  "morphology/behavior" form (e.g. "8500/3" → "3"). Never a separate,
  hand-maintained field that could drift out of sync with the code
  itself.
- **`resolveCancerRegistryReportability.ts`** — implements the
  specific, already-documented NAACCR exclusions (cervical CIS/CIN
  III, PIN III, skin BCC/SCC) — **not** a claim of exhaustive coverage
  of NAACCR's own, much larger body of site-specific reportability
  rules, which is real, substantial reference work beyond this gap's
  own honest scope.
- **`ICancerRegistrySettingsService.ts` / `mockCancerRegistrySettingsService.ts`**
  and **`IFacilityCancerRegistryOverrideService.ts` / `mockFacilityCancerRegistryOverrideService.ts`**
  — the real, two-tier cascade (Enterprise default + Facility
  override), same established shape as the cytology screening-registry
  settings. Deliberately no seed facility assignments: unlike that
  cytology work (which had real, direct research confirming specific
  seed facilities' own jurisdictions), no such research was done here
  to assign this app's existing seed facilities to a specific real
  cancer registry.
- **`resolveEffectiveCancerRegistrySettings.ts`** — the real, pure
  cascade resolution, mirroring the cytology equivalent exactly.
- **`buildCancerRegistryReportPayload.ts`** — the real, structured
  JSON builder from a real `Case` — same "PathScribe builds structured
  JSON; interface engine handles registry-specific translation"
  principle as cytology's own registry dispatch. Reads
  `Specimen.coding.icdO` directly.
- **`ICancerRegistryOutboundQueueService.ts` / `mockCancerRegistryOutboundQueueService.ts`**
  — mirrors the cytology registry outbound queue's exact shape
  (QUEUED/SENT/FAILED, retry, audit logging on every state change).
- **`dispatchCancerRegistryReportIfApplicable.ts`** — the real
  orchestration: resolves effective settings, checks each specimen's
  own real ICD-O finding for reportability, and enqueues only a
  genuinely reportable case. Fire-and-forget from sign-out — a real
  dispatch-side failure never blocks the case's own, already-
  successful sign-out.

## Real, honest scope boundary

Same real "PathScribe builds structured JSON; a real interface engine
handles actual delivery" split as everywhere else in this app — this
module assembles and queues real, structured data; it does not itself
speak NAACCR XML, the CoC Data Standard, or any other registry's own
wire format (`FHIR_DISPATCH_ARCHITECTURE_PLAN.md`'s own, already-settled
decision). Filed on the Backend Needs Log: real outbound delivery to
each registry's own real submission endpoint.

**A second, real, honest gap — not fixed here, and worth stating
plainly**: there is still no real way for a pathologist to actually
*enter* an ICD-O code in this app today. `AddCodeModal.tsx`'s own live
ICD-O search is a genuine "coming soon" placeholder (no backend proxy
exists — the same real category as its neighboring ICD-11
placeholder), and no manual-entry fallback exists either. This
module's own pipeline (mapping → reportability → payload → queue) is
real and fully tested end to end against a real `Case` object with
real, populated `coding.icdO` data — but until that separate, real
capture-path gap is closed, no real, live case will ever have that
data to dispatch. Building a full live ICD-O terminology search
(requiring a real backend proxy, same as ICD-11) was judged out of
this gap's own honest scope; a minimal manual-entry UI inside
`AddCodeModal.tsx` (a real, 1,200+-line, heavily-used file) was
deliberately not attempted here given the real risk of modifying that
file further without a focused, dedicated pass — flagged as real,
separate, future work.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
