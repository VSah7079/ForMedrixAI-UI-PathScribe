# services/digitalPathology/

Real, shared home for computational-pathology/AI vendor integration
and whole-slide-imaging (WSI) infrastructure — deliberately not
`services/cytology/`, even though cytology (Hologic Genius) was the
driving use case and `IWsiScanBatchService.ts` was relocated here from
there. Surgical pathology's own real, FDA-cleared AI products (Paige
Prostate, Ibex Prostate Detect, PathAI AISight Dx, Proscia Concentriq
AP-Dx) are the majority of this real market; cervical cytology is one,
real, additional modality this same shared infrastructure covers, not
its primary reason to exist.

## Files

- **`IDpVendorService.ts` / `mockDpVendorService.ts`** — a real,
  admin-editable dictionary of named computational-pathology vendors.
  Seeded with the five real products named above, each grounded in
  real research (FDA clearance dates, deployment scale, the specific
  modality each product actually screens) rather than invented
  placeholders. Admin UI: `Config/System/DpVendorDictionarySection.tsx`
  ("Digital Pathology / AI Vendors").
- **`IAiScreeningResultService.ts` / `mockAiScreeningResultService.ts`** —
  the real, operational record store for `AiScreeningResult`
  (`types/digitalPathology/`) — `ordered` → `completed`/`failed`/
  `timed_out`, with real findings and an optional `AiSpatialRegion`
  (a real, simple, normalized-coordinate alternative to a full geojson
  package this app has no other use for — the original integration
  plan's own "spatialRegion?: GeoJSON" note, honestly deviated from
  rather than adding a new dependency for one narrow field).
- **`processInboundAiScreeningResultEvent.ts`** — real, idempotent
  ingestion of a completed/failed/timed-out result, same
  "PathScribe ingests its own specification" split as every other
  inbound processor in this app.
- **`recordAiHumanConcordance.ts`** — the real CAPA-design decision this
  whole integration was built around: **no auto-CAPA**. Recording a
  genuine "discordant" judgment raises a real, `open`
  `SpecimenDeficiency` (a new `def-ai-discordance` type) via the
  existing deficiency mechanism — never auto-escalated, never
  auto-resolved. A human decides what happens next through the
  existing Quality Assurance page's own real Escalate-to-CAPA flow.
- **`resolveAiHumanDiscrepancyReport.ts` / `resolveAiScreeningTimeoutStatus.ts`**
  — the two real QA reports the original plan called for: per-vendor
  discordance rates (excluding results never actually reviewed by a
  human — never counted as concordant by default), and genuinely
  stalled `ordered` results past a configurable timeout window.
- **`IWsiScanBatchService.ts` / `mockWsiScanBatchService.ts`** —
  relocated here from `services/cytology/`, since it's domain-agnostic
  (surgical pathology needs whole-slide scanning equally). Every real
  caller (`buildWsiScanBatchManifestPayload.ts`,
  `resolveCaseCytologyScansCompletedMembership.ts`,
  `processInboundWsiScanStatusUpdateEvent.ts`, and their own test
  files, including dynamic `await import(...)` calls a simple
  `from '...'` pattern match wouldn't have caught) updated to the new
  path; confirmed zero stray references anywhere afterward.

## Story 10 (Sep 2026) — Cytology Assist FOV Ingestion

Real, per the RFP-APLIS-2026-GLOBAL gap: "real ingestion of
field-of-view coordinates and triage scores directly from GYN
cytology processors (Hologic ThinPrep Genesis/Genius, BD FocalPoint),
surfaced directly in the technician's live screening queue." Prompted
directly: "since these messages are routing through the interface
engine could it process the message into a standard form for
PathScribe?" — confirmed this is exactly this folder's own,
already-established architecture (see the scope boundary below,
written before this story). No vendor-branching logic was added to
PathScribe itself; the real gap was a genuine hole in the canonical
schema plus a real, complete absence of any consumer for it.

**Real, confirmed research before designing anything**: BD FocalPoint
and Hologic Genius report genuinely different shapes of data, not the
same shape from two vendors. BD FocalPoint ranks the *whole slide*
into one of 5 real quintiles by likelihood of abnormality and gates
it into a real "Review"/"No Further Review" classification (15-25%
of slides need no human review at all) — real, confirmed via BD's own
FDA submission and product literature. Hologic Genius reports no
slide-level rank at all — instead a real, 30-tile gallery of objects
of interest per slide, grouped by cell type — confirmed via Hologic's
own FDA De Novo filing and published technical review.

**The real, canonical fix**: `AiScreeningResult` gained a new,
optional, genuinely vendor-agnostic `slideTriage` field
(`AiSlideTriageSummary` — `reviewRecommended`, `rankGroup`,
`totalRankGroups`) alongside the existing `findings[]` list — real
interface-engine territory to populate when a given vendor's own real
product reports a slide-level equivalent (BD), left honestly
undefined when it doesn't (Hologic's own real gallery-only model).
`AiScreeningResultEventPayload` and `markCompleted()` carry it
through. BD FocalPoint added to the vendor dictionary
(`mockDpVendorService.ts`) — with a real, honest regulatory nuance
recorded there: BD FocalPoint is FDA-*authorized* via a PMA
supplement, not 510(k) *cleared*, the specific pathway this
dictionary's own `fdaCleared` field (rendered in the admin UI as the
literal label "FDA Cleared") tracks — set to `false`, not because the
product lacks real authorization, but because "cleared" is the wrong
real regulatory word for it.

**The real "surfaced in the live screening queue" gap, now closed**:
confirmed directly before building — `CytologyWorklistPage.tsx` had
zero references to `AiScreeningResult` anywhere; the whole system
existed with no real consumer. Now fetches and displays a real,
per-case AI triage badge (quintile rank + review recommendation when
a vendor reports one, an AI-flagged-FOV count otherwise) in the
technician's own "My Worklist"/"Pool" queue rows.

6 new/updated tests confirm the canonical schema genuinely holds both
real shapes correctly (a BD-style slide-level rank alongside its FOV
list; a Hologic-style flat gallery with `slideTriage` honestly
`undefined`, never a fabricated default).

**Real, direct follow-up correction — the concordance loop itself was
not actually closed**: confirmed directly, per a pointed follow-up
("obviously that is a huge gap. Sort of the whole point of
concordance monitoring") — `recordAiHumanConcordance()` already
existed, already correctly required an explicit human judgment, and
already correctly raised a real, open `SpecimenDeficiency` on
discordance (never auto-escalated or auto-resolved) — but it had
**zero real callers anywhere in the UI**. `CytologyScreeningPage.tsx`
now prompts for this judgment, but only once the reviewer's own
independent finding has already been saved (so the AI result can
never bias that independent read), and only once per real AI result
(`humanConcordant === undefined` — never re-asked after a real
judgment is recorded). The prompt states the AI's own real result in
plain terms (its slide-level rank/gate when one exists, or its FOV
count otherwise) and asks a direct, explicit yes/no question — never
an automatic text-similarity guess between the AI's own finding label
and the reviewer's own dictionary term, which would be a real,
unreliable heuristic standing in for a genuine human judgment.

## Real, explicit scope boundary

None of this closes the actual FDA-cleared products' own real
integration — this is the canonical schema and workflow logic a real
vendor's own interface engine would map onto, matching this app's own
established "PathScribe owns the schema; the interface engine owns
vendor-specific translation" posture throughout.

## WSI Viewer Launch (Sep 2026)

Real, per direct guidance on RFP-APLIS-2026-GLOBAL §3.4.1 ("Native
launch of Whole Slide Images... via DICOM Web standards... or
vendor-agnostic APIs"): "my plan was to connect to vendors that
actually deal with the WSI. We just pass info and launch the app and
route the unique id so that the correct scan is placed in their
viewer." Confirmed directly first: `IWsiScanBatchService.ts` tracks
scan-batch status; nothing launched a real vendor's actual viewer.

- **`IWsiViewerVendorService.ts` / `mockWsiViewerVendorService.ts`** —
  a real, admin-editable dictionary, deliberately separate from
  `IDpVendorService.ts` above: that dictionary's own real job is
  tracking WHICH vendor's algorithm produced a given `AiScreeningResult`
  (QA/discordance), a genuinely different concern from "where do I
  click to open this slide." Seeded with the three real scanner
  vendors RFP §3.4 itself names (Leica, Roche, Hamamatsu) plus four
  more real, launchable platforms confirmed via current research —
  Paige IMS, PathAI PathOS, Proscia Concentriq, Philips IntelliSite —
  per direct follow-up ("many DP vendors actually have their own AI or
  they allow other AI to connect"). Paige and PathAI legitimately
  exist in *both* dictionaries — not a data inconsistency, an accurate
  reflection of these being real companies with two genuinely
  different real roles (Paige IMS bundles a real third-party AI
  marketplace; PathAI's PathOS "orchestrates both their own and
  partner models"). Per direct guidance's own framing ("contextual
  launch of the application, similar to the EMR approach"), this
  dictionary's one real job is that mechanism for any real, launchable
  DP platform, regardless of what runs inside it. All real
  `launchUrlTemplate` values ship empty — no real customer URL to ship
  — plus one `[DEMO ONLY]` entry with a real, working synthetic
  template. Admin UI: `Config/System/WsiViewerVendorDictionarySection.tsx`
  ("WSI Viewers" category within the consolidated "Vendor
  Integrations" screen, `VendorIntegrationsSection.tsx` — per direct
  guidance: "why not a main Vendor Integration and then have
  categories on the left," consolidating what had been four separate
  flat vendor-dictionary nav entries) — real, per the earlier, direct
  follow-up ("where is the url to the vendor configured?"); the data
  layer and launch button existed with no admin screen to actually
  set it until this, mirroring `DpVendorDictionarySection.tsx`'s own
  established list/add-edit-modal/deactivate pattern exactly.
- **`utils/buildWsiViewerLaunchUrl.ts`** — the entire real mechanism:
  substitutes one real identifier (`StainOrder.displayId`, the same
  barcode a real scanner already reads) into an admin-configured URL
  template. PathScribe never implements DICOMweb, never renders an
  image, never needs the vendor's own API credentials — the vendor's
  real viewer owns everything after the browser navigates there.
- **`pages/SynopticReportPage/components/WsiViewerLaunchButton.tsx`**
  — the real UI, wired into `BlockStainEditorModal.tsx`'s existing
  per-stain chip row. Only renders once a stain has genuinely reached
  `'Coverslipped'`/`'Ready for Review'` — no real slide to route to
  before that. Built as its own small, separately-translated
  component rather than converting that 1,300+-line host file
  wholesale, same boundary already established for `GrossingReleasePanel.tsx`
  and the OR Suite Live Board's own nav button.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
