# services/documentRendering/

**Real, per PS-276 ("Document Rendering Engine — PDF/A compliance,
deterministic re-rendering, vector/raster/barcode support") and PS-277
("Master Template Engine — modular headers/footers, conditional
branding, page-break control, typography governance"), both scoped
app-side per direct guidance after finding a genuine architectural
fork — see "Real scope wall" below before assuming anything here
applies to every report PathScribe produces.**

## Why this folder exists, and what it does NOT cover

PathScribe does not have one report-rendering pipeline — it has two,
architecturally different ones, confirmed directly before writing any
of this (not assumed):

- **Cytology** reports render via real, in-repo, client-side jsPDF/
  pdf-lib code (`services/cytology/generateCytologyReportPdf.ts`).
  Genuinely extensible from this repo — this is the pipeline every
  file in this folder actually reaches.
- **Surgical pathology** reports (the majority of real cases) render
  via an external, source-inaccessible Firebase `render_report` Cloud
  Function (`SynopticReportPage.tsx`'s own `generateReportPdfSnapshot`).
  This folder cannot inspect, verify, or extend that pipeline at all —
  the equivalent PDF/A/determinism/barcode work for it is real,
  separate backend work, tracked in the Jira ticket filed alongside
  this batch (see "Real, remaining gaps" below).

## What's real and closed here (PS-276 §1.1, cytology pipeline only)

- **§1.1.3, dynamic barcoding** — `resolveBarcodeVectorSpec.ts` +
  `drawBarcodeOnJsPdfDoc.ts` draw a real, scannable Code 128/QR/Data
  Matrix barcode as genuine PDF vector rectangles (never a rasterized
  image, never dependent on SVG/DOM/canvas) — wired into
  `generateCytologyReportPdf.ts`'s own header as a real Code 128
  encoding of the report's accession number. The exact bar/module
  geometry was independently verified against bwip-js's own working
  `toSVG()` renderer before shipping (see `resolveBarcodeVectorSpec.ts`'s
  own header comment) — not assumed correct.
  **Real bug found and worked around, not papered over**: bwip-js
  4.11.2's ESM build has a named-export collision — it defines a
  barcode symbology literally called "raw", and that shadows the real
  geometry-data utility function of the same name under `import *`.
  The real one only survives on the module's own default-export
  object, which the package's own published types don't declare.
  `resolveBarcodeVectorSpec.ts`'s own header comment has the full
  diagnosis and the defensive, fail-loud accessor this uses instead.
- **§1.1.2, deterministic re-rendering** — `applyDeterministicPdfMetadata.ts`,
  applied as the LAST step of `generateCytologyReportPdfWithAttachments()`
  regardless of which internal path ran. Closes **two real, verified**
  non-determinism sources (neither assumed — both found by diffing two
  real outputs of the same content byte-for-byte):
  1. jsPDF's own `/CreationDate`/`/ModDate` come from real wall-clock
     `new Date()` at generation time — now overwritten with a value
     derived from the report's own `signedAt`.
  2. jsPDF's own internal `setFileId()` unconditionally randomizes the
     PDF trailer's `/ID` via `Math.random()` on every `.output()` call
     — and pdf-lib's own `load()`/`.save()` round trip preserves that
     same random value unless told otherwise. This function clears
     `context.trailerInfo.ID` directly (pdf-lib has no dedicated public
     setter for this) — metadata alone was NOT enough; both fixes were
     required together.
  Verified directly, not just asserted: `applyDeterministicPdfMetadata.test.ts`
  and `generateCytologyReportPdf.test.ts` both generate the same real
  content twice (with a real delay between calls) and assert
  byte-for-byte `Uint8Array` equality.
- **§1.1.3, minimum 300 DPI raster images** — `checkEmbeddedImageResolution.ts`,
  wired into `imageAssociation/embedImageAssociationsIntoPdf.ts`. Real,
  deliberate definition: checks the image's EFFECTIVE DPI at the
  physical size it's actually printed at in the PDF (pixel dimension ÷
  printed size), never its raw camera resolution alone — a real,
  honest **warning**, never a silent drop or a blocked embed (a
  below-minimum gross photo is still real, useful clinical
  documentation).
- **§1.1.4, non-blocking client-side execution** — `generateCytologyReportPdfSnapshot()`
  is Promise-based and is only ever invoked as an async `generatePdf`
  callback into `printing/dispatchPrintJob.ts` — never on a hot render
  path. **Updated (gap-closing pass, Sep 2026)**: the actual CPU-bound
  jsPDF/pdf-lib work now runs off the main thread via a real Web
  Worker, closing the gap this section previously disclosed as open.
  `services/cytology/generateCytologyReportPdf.worker.ts` is the
  worker-side entry point (verified beforehand that this pipeline's
  own jsPDF/pdf-lib usage is pure vector/text/image drawing — never
  jsPDF's DOM-dependent `html()` canvas path — so it's genuinely safe
  to run off-main-thread); `services/cytology/generateCytologyReportPdfInWorker.ts`
  is the one public entry point callers use in place of calling
  `generateCytologyReportPdfWithAttachments()` directly, using Vite's
  documented `new Worker(new URL(...), { type: 'module' })` convention.
  Real, honest fallback, never a silent behavior difference: when
  `Worker` isn't a real, available global, or constructing one throws,
  this runs the exact same generation synchronously on the main thread
  instead — same result either way, the offload is purely a
  performance improvement. `generateCytologyReportPdfSnapshot.ts` (the
  one real sign-out/dispatch-time caller of the CPU-bound pipeline) now
  calls `generateCytologyReportPdfInWorker()` instead of
  `generateCytologyReportPdfWithAttachments()` directly; its own
  `{ pdfBase64?, generationError? }` contract is unchanged, so nothing
  downstream of it needed to change. This project has no real
  Worker-execution test harness (module Workers need a real bundler/
  browser runtime vitest doesn't provide), so
  `generateCytologyReportPdfInWorker.test.ts` verifies the real
  dispatch/message-passing/fallback/error-handling contract against a
  fake, in-memory Worker double — the real jsPDF/pdf-lib generation
  itself stays covered directly by `generateCytologyReportPdf.test.ts`.

## What's real and closed here (PS-277 §1.2, cytology pipeline only)

- **§1.2.1, modular header/footer** — `applyContinuationPageHeaders.ts`.
  A real, deliberate LAST pass over the finished doc (so "Page X of Y"
  is only ever computed once `doc.getNumberOfPages()` is genuinely
  final) — draws an abbreviated header (Patient Name, MRN, Accession
  Number, Page X of Y) on every page from 2 onward, never page 1
  (already carries the report's own full title/administrative
  section). A real, pre-existing gap found and closed in the same
  batch: `generateCytologyReportPdf.ts`'s own `addWrappedText` only
  ever checked for page overflow at section-header boundaries — a long
  paragraph or list mid-section could run off the bottom of the page
  uncaught. Now checks per real line, and every real `doc.addPage()`
  call resumes at `MARGIN + CONTINUATION_HEADER_HEIGHT_MM`, reserving
  the exact band this file's own second pass draws into.
- **§1.2.2, conditional branding & header overrides** —
  `services/facilities/resolveFacilityPrintBranding.ts` (real
  Facility → Department → Enterprise hierarchy, reusing Case Mask
  Scoping's own real architecture per direct guidance — see that
  file's own header comment), wired into `generateCytologyReportPdf.ts`'s
  header as a real, optional `content.printBranding` block (facility
  name/address always shown; Director/CLIA independently resolved,
  and withheld for a real, per-case 'TC' component-split status).
  **Updated (gap-closing pass, Sep 2026)**: `headerLogoUrl` is now
  actually fetched and drawn as real, embedded PDF image content — a
  fixed, content-independent box is reserved in the header (never
  shifts with any dynamic content) and read back out via a real,
  optional `layoutOut` out-parameter on `generateCytologyReportPdf()`,
  so `generateCytologyReportPdfWithAttachments()` can fetch the real
  logo bytes and draw them into that exact region on the existing page
  1 via the new `embedCytologyHeaderLogo.ts` (pdf-lib, "contain"
  scaling — never stretched or upscaled past native size — DPI-checked
  against the real 300 DPI minimum exactly like
  `embedImageAssociationsIntoPdf.ts` already does for clinical images).
  A fetch failure leaves the reserved space blank and logs a real,
  honest warning, never a thrown error or a placeholder page.
  **Also updated (gap-closing pass, Sep 2026)**: the admin UI gap is
  closed too — `Department.headerLogoUrl`/`directorName`/`cliaOrIsoNumber`
  are now editable via a new "Report Branding Override" field group in
  `DepartmentsSection.tsx` (Config/System/), and
  `FacilityEditorModal.tsx`'s own equivalent three fields — previously
  gated to `hasRole('performing_lab')` alone — are now also reachable
  for an Enterprise-tagged facility that doesn't hold that role (a
  real, latent gap: `isEnterprise` and `FacilityRole` are
  architecturally independent, even though every real seed Enterprise
  record today happens to carry `performing_lab` too). The split-'26'
  second-branding-block gap remains open — see "Real, remaining gaps"
  below.
- **§1.2.3, sectional page-break controls** — "Keep With Next" for
  section headers (`addSectionHeader` now checks for room for the
  header's own line AND at least one real line of body content
  beneath it, not just the header alone). Addenda forced onto a
  dedicated page when configured by client policy
  (`Facility.forceAddendumOnDedicatedPagePrintPolicy`, resolved by
  `services/cytology/releaseCytologyAddendum.ts`) — also closes a
  real, separate, pre-existing gap found while building this:
  `CytologyReportContent.addendumText` existed on the type already, but
  nothing in the renderer ever actually printed it. "Synoptic tables
  kept unbroken" — real, disclosed: cytology's own report content has
  no tabular/synoptic-grid content today (that's a surgical-pathology
  concept), so there's no real caller for this specific line yet, same
  "no gap to close because the feature has no real caller" posture as
  PS-276's own vector-diagram-embedding line below.
- **§1.2.4, font & layout governance** —
  `validatePrintLayoutGovernance.ts`'s `assertAllowedPrintFont()` (a
  real, fail-loud allowlist — `helvetica`/`times`/`courier`, jsPDF's
  own base-14-compatible families) and `assertMinimumPrintMargin()`
  (0.5in/12.7mm real minimum), both wired into
  `generateCytologyReportPdf.ts` — the existing 15mm `MARGIN` constant
  already cleared the real minimum before this batch; what's new is a
  real, fail-loud check rather than a comment merely claiming so.

## What's real and closed here (PS-276 §1.1.1, cytology pipeline only)

- **Font embedding.** **Updated (gap-closing pass, Sep 2026)**: the one
  material blocker to a PDF/A embedded-fonts claim is closed. jsPDF's
  default `'helvetica'`/`'times'/`'courier'` are the 14 PDF standard
  fonts, which by the PDF spec itself are never embedded, regardless of
  any jsPDF configuration — closing this required a genuinely separate
  font program. `registerEmbeddedPrintFont.ts` registers a real
  Liberation Sans font program (SIL OFL 1.1, metrically compatible with
  Helvetica — sourced from the `@typopro/dtp-liberation` npm package
  and verified directly via a `fontTools` name-table read before use;
  see `embeddedFonts/LICENSE_NOTICE.md` for the full provenance
  account) onto the doc via jsPDF's own documented
  `addFileToVFS()`/`addFont()` mechanism. Both real call sites in the
  cytology pipeline (`generateCytologyReportPdf.ts`'s own
  `addWrappedText`, and `applyContinuationPageHeaders.ts`'s own
  continuation-page header line) now draw with this embedded family
  instead of `'helvetica'` — a genuine, complete swap, not a partial
  one that would have left a real PDF/A gap on multi-page reports.
  Verified directly, not just asserted: `registerEmbeddedPrintFont.test.ts`
  inspects the actual output PDF bytes and asserts a real `/FontFile2`
  object is present (the real, literal proof a font program is
  embedded — the 14 standard fonts never produce one), alongside a
  contrasting test confirming the old, non-embedded baseline never did.
  Real, disclosed trade-off: the full font program is embedded, not a
  subsetted one (no subsetting tool exists in this project's toolchain
  today) — adds a real, fixed ~370KB combined (Regular + Bold) to every
  generated cytology PDF.

## Real, remaining gaps — not closed here, and not silently deferred

- **Independent PDF/A validation was re-attempted (Sep 2026, Gap 6
  pass) and confirmed genuinely not achievable from this environment**
  — not a wrong-URL problem, a structural one. Checked directly rather
  than assumed: (1) veraPDF's `veraPDF-apps` GitHub repo has **no
  releases published at all** ("There aren't any releases here") — the
  prior attempt's 404 wasn't a stale link, there was never a GitHub
  release to fetch; (2) veraPDF's real, canonical distribution is its
  own installer zips on `software.verapdf.org` (confirmed via
  `docs.verapdf.org`'s own install instructions), and that domain is
  outside this project's build/dev environment's network allowlist
  (direct request returns `403 Forbidden` at the proxy, same as any
  other non-package-registry host — confirmed by testing directly, not
  inferred); (3) no npm or PyPI package was found that bundles a real,
  standalone, offline-runnable veraPDF validator — the handful of
  veraPDF-adjacent npm packages found are either UI components (a
  results-highlighting viewer) or third-party services that would
  still need their own external network access. **Conclusion: this
  gap cannot be closed from inside this build environment at all**, by
  any tool choice — it needs to run somewhere with broader network
  access (a CI runner, or the veraPDF GUI/CLI installed directly on a
  developer's own machine) against a generated cytology PDF pulled out
  of this repo. What's shipped here remains PDF/A-*oriented* metadata
  handling plus genuine font embedding (see §1.1.1 above), not an
  independently verified PDF/A-1b/2b conformant file.
- **Vector diagram embedding** (§1.1.3's "vector graphic scaling for
  embedded diagrams") — cytology reports don't currently have any
  diagram content to embed; no gap was found to close because the
  feature this line describes has no real caller yet.
- **A genuinely split '26' branding block (PS-277 §1.2.2)** — real,
  disclosed, and now confirmed by direct inspection rather than
  assumed: a genuinely split '26' (professional-only) billing case's
  own separate "which facility did the technical work" branding block
  is not resolved. Checked
  directly: `ServiceChargeRecord.ts` (the permanent billing ledger),
  `OutboundChargeQueueEntry.ts` (the outbound dispatch queue),
  `BillingRuleVersion.ts` (the billing rule dictionary, scoped by
  `siteId`, never `facilityId`), and `Case.ts`/`OrderMetadata` (whose
  only facility reference is the single, ordering `facilityId`) — none
  of them carry a distinct technical-component-performing-facility
  reference anywhere in this app's real data model. `billingType: 'TC'
  | '26' | 'Global'` genuinely exists and is genuinely resolved at
  charge finalization, but there is no second facility identifier for
  it to point at. Closing this gap for real would mean inventing a new
  field on `Case`/`ServiceChargeRecord` that no direct guidance has
  ever specified — out of scope for a gap-closing pass; it needs its
  own ticket with its own data-model decision. See
  `resolveFacilityPrintBranding.ts`'s own header comment for the same
  disclosure at the point where it actually bites.
- **Everything on the surgical-pathology (`render_report` Cloud
  Function) side of the fork above** — PDF/A, determinism, and
  barcode embedding for the majority of real reports this app
  produces. Entirely backend work in a separate repository this
  session cannot reach — see the Jira ticket filed alongside this
  batch for the specific scope handed to whoever owns that function.

## Files

- **`resolveBarcodeVectorSpec.ts`** / **`drawBarcodeOnJsPdfDoc.ts`** —
  real barcode geometry + real vector drawing onto a jsPDF doc.
- **`applyDeterministicPdfMetadata.ts`** — real, verified byte-for-byte
  deterministic metadata pass (see "What's real and closed" above).
- **`checkEmbeddedImageResolution.ts`** — real, pure effective-DPI
  check against the 300 DPI minimum.
- **`applyContinuationPageHeaders.ts`** (**NEW, PS-277**) — real,
  second-pass abbreviated header + "Page X of Y" for every page after
  the first.
- **`validatePrintLayoutGovernance.ts`** (**NEW, PS-277**) — real,
  fail-loud font-allowlist and minimum-margin guards.
- **`embedCytologyHeaderLogo.ts`** (**NEW, gap-closing pass**) — real
  pdf-lib header-logo fetch/embed onto the reserved region
  `generateCytologyReportPdf.ts` hands back via its `layoutOut`
  out-parameter (see §1.2.2 above).
- **`registerEmbeddedPrintFont.ts`** (**NEW, gap-closing pass**) — real
  Liberation Sans embedding onto a jsPDF doc (see §1.1.1 above).
  `embeddedFonts/` carries the actual font program data + its own
  provenance/license notice.

The §1.1.4 Web Worker offload itself lives in `services/cytology/`
(`generateCytologyReportPdf.worker.ts` /
`generateCytologyReportPdfInWorker.ts`), not this folder — see
[services/cytology/README.md](../cytology/README.md).

---
*See [services/cytology/README.md](../cytology/README.md) for how the
cytology PDF pipeline this folder extends actually works end to end.*
*When this folder's contents change meaningfully, update THIS file.*
