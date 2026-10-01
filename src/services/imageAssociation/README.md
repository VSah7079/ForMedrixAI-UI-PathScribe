# services/imageAssociation/

Real, per an uploaded "Architectural & Integration Overview" spec's
own §1.1 (Reference-Only Storage Model): PathScribe stores image/PDF
associations exclusively as metadata records pointing at external
media hosts, never the binary payload itself. Real, direct
motivation, confirmed: "I didn't want to store large PDF reports or
image captures in the cloud."

Items 1 and 2 of a 5-item scoping breakdown (item 3 — migrating
`CameraCaptureControl.tsx`'s own real, existing base64 capture onto
this model — and item 5 — fidelity-preserving embedding into generated
reports — are real, separate, deferred work; item 4 — ref-lab HL7/MIME
inbound results — is confirmed interface-engine work, not tracked
here).

## Files

- **`types/imageAssociation/ImageAssociation.ts`** — the real type,
  matching spec §2.1's exact fields (`asset_id`, `image_url`,
  `image_type`, `source_system_id`, `fallback_url`). Deliberately a
  NEW, separate type from `types/case/Material.ts`'s own
  `DigitalAsset` — that type stores a base64 `data:` URL inline,
  confirmed non-compliant with §1.1. Migrating existing consumers
  onto this model is real, separate, deferred work (item 3).
- **`resolveImageUrlWithFallback.ts`** — the real, pure decision logic
  behind spec §2.2. Kept the spec's own exact carve-out: a 401/403 on
  the primary URL does **not** trigger a fallback — that's an auth
  problem, not an availability one, and rerouting to a different
  server wouldn't fix it. Surfaced as its own real `auth_required`
  outcome, never folded into the generic "both failed" case.
- **`logImageFallbackTrigger.ts`** — the one real side effect
  (`mockAuditService.logEvent`) the pure resolver above deliberately
  doesn't perform itself, per spec §2.2's own "MUST log all fallback
  triggers for audit and diagnostic purposes."
- **`resolveImageUnavailablePlaceholder.ts`** — the real, pure
  placeholder text generator per spec §4.3, kept to the spec's own
  exact worked-example wording (`"Image Unavailable - Server
  Unreachable: [Asset ID]"`) since this is real, clinical-record text
  a reviewer reads literally.
- **`IImageManagementSystemVendorService.ts` / `mockImageManagementSystemVendorService.ts`**
  — a real, admin-editable dictionary, per direct guidance's own real
  clarification: "Ideally we would integrate with an image management
  system or for smaller sites on prem file servers." Two genuinely
  different real deployment models (`enterprise_ims` vs
  `on_prem_file_server`), not two names for the same thing. Real,
  honest seed data: no specific real VNA/PACS/DAM vendor is named
  anywhere in the uploaded spec, so — unlike the WSI viewer vendor
  dictionary, where the RFP names real companies — this ships with
  clearly-generic, unconfigured placeholders rather than a guessed
  real company name, plus one `[DEMO ONLY]` entry with a real, working
  synthetic base URL.
- **Admin UI**: `Config/System/ImageManagementSystemVendorDictionarySection.tsx`
  ("Image Management Systems" category within the consolidated
  "Vendor Integrations" screen, `VendorIntegrationsSection.tsx` — per
  direct guidance: "why not a main Vendor Integration and then have
  categories on the left")
- **`IGrossImagingVendorService.ts` / `mockGrossImagingVendorService.ts`**
  — a real, fourth, genuinely distinct vendor category, per direct
  research: point-of-capture workflow tools for the gross/cut-up
  bench (annotation, dimension measurement, side-by-side serial-
  section comparison, live telepathology streaming) — neither a WSI
  viewer nor a passive image store. Real, named, researched seed
  vendors: PAX-it!/PAXcam (MIS Incorporated, Villa Park IL), Smart In
  Media PathoZoom® (Cologne, Germany), Milestone Medical MacroPATH
  (UK). Directly unblocks the still-deferred "item 3" migration of
  `CameraCaptureControl.tsx`'s own real gross/block-face photo
  capture — this is the real vendor category that capture should
  eventually hand off to.
- **`Config/System/VendorIntegrationsSection.tsx`** — the real,
  consolidated home for all four vendor categories above (Digital
  Pathology/AI, WSI Viewers, Image Management Systems, Gross/Macro
  Imaging & Telepathology), replacing what had accumulated as four
  separate, flat top-level Config nav entries. A thin wrapper only —
  reuses the exact same `ps-confsys-shell`/`sidebar`/`nav-btn`/
  `content` classes this whole page's own outer level already uses,
  and renders each category's already-built dictionary component
  unchanged.

## Real, deliberate scope boundaries — not done here

- **Item 3 (camera capture migration) — DONE (Sep 2026).** Both real
  parts, per direct confirmation ("Yes sounds good"):
  1. **Compliance fix**: `CameraCaptureControl.tsx` no longer stores a
     base64 `data:` URL inline. `IImageUploadService.ts`/
     `mockImageUploadService.ts` now sit between capture and
     `DigitalAsset` — the captured frame goes out to the active Gross
     Imaging vendor (see `IGrossImagingVendorService.ts` above — the
     real vendor category this belongs to, not the generic Image
     Management dictionary), and only the real returned URL is ever
     stored. Refuses honestly (no fabricated success) if no vendor
     has a real, configured base URL — never silently substitutes the
     seeded `[DEMO ONLY]` entry on a real customer's behalf.
  2. **New real capability**: confirmed directly that no gross/
     frozen-section photo capture existed anywhere in the intraop
     workflow before this, despite being explicitly named in both
     PAX-it!'s and PathoZoom®'s real capabilities.
     `IntraopSpecimen.digitalAssets` (types/intraop/IntraoperativeEntry.ts)
     and `mockIntraoperativeService.addDigitalAsset()` (pure append,
     mirrors `addMilestone`'s own pattern, performs no upload itself)
     back a real "📷 Capture Gross Photo" button wired into
     `IntraopQueuePage.tsx`'s own Quick Gross step — the real moment a
     specimen is actually being examined.
  Real, still-open follow-up: the actual bytes-over-the-wire upload to
  a real vendor endpoint remains genuine backend/infra work no
  sandbox can perform — the mock simulates a successful upload and
  returns a real-shaped URL, but no real network call happens.
- **Item 4 (ref-lab HL7/MIME inbound results)**: confirmed directly —
  "4 is engine work." The interface engine should own decoding a
  MIME-encoded inbound attachment and uploading it, handing PathScribe
  only the resulting `ImageAssociation` fields — same real
  "PathScribe owns schema, the engine owns translation" posture as
  the OCR migration hand-off (see `services/migration/README.md`).
  Not yet formally ticketed at time of writing.
- **Item 5 (fidelity-preserving report embedding) — DONE for the
  cytology pipeline specifically (Sep 2026).** Real investigation
  done first, not assumed: verified directly (a real, standalone test
  — merge one PDF's page into another via `pdf-lib`'s `copyPages()`,
  then decompress the output content stream and inspect it) that the
  merged page contains genuine vector drawing operators
  (`moveto`/`lineto`/`stroke`) and zero `/Image` XObjects — a real,
  non-rasterized, spec-§3.2-compliant merge, not a claim taken on
  faith. `embedImageAssociationsIntoPdf.ts` composes this app's own
  real, existing `generateCytologyReportPdf.ts` (jsPDF, text-only)
  with real image embedding (`pdf-lib`'s `embedPng`/`embedJpg` —
  losslessly for PNG, byte-exact for JPEG, never a destructive
  re-compression pass) and real PDF-page merging, plus the real §2.2
  fallback resolution and exact §4.3 placeholder text on a genuine,
  unresolvable failure — never silently dropping an association or
  halting the rest of the document. `generateCytologyReportPdf.ts`
  gained a new, separate `generateCytologyReportPdfWithAttachments()`
  async wrapper — the original, synchronous function's own signature
  and every existing caller are untouched.
  **Real, new dependency**: `pdf-lib` is not yet in this project's own
  `package.json` — needs a real `npm install pdf-lib` before this
  code can run for real.
  **Real, honest scope wall, confirmed before building anything**:
  this only ever reaches `generateCytologyReportPdf.ts`'s own
  real, in-repo, client-side pipeline. The *main* synoptic report
  pipeline (used for the majority of surgical pathology reports)
  generates its PDF via an external, source-inaccessible Firebase
  Cloud Function (`SynopticReportPage.tsx`'s own
  `generateReportPdfSnapshot`) — this cannot be inspected, verified,
  or extended from here at all. The equivalent fidelity/merging work
  for that pipeline is real, separate backend work for whoever owns
  that function's source — see the Jira ticket filed alongside this.
  **Updated (PS-276, Sep 2026)**: `embedImageAssociationsIntoPdf()`'s
  own return shape changed from a bare `Uint8Array` to
  `{ bytes, warnings }` — `warnings` is a real, per-association
  below-300-DPI flag (see `services/documentRendering/
  checkEmbeddedImageResolution.ts`), never a silent drop; the single
  real call site (`generateCytologyReportPdf.ts`) logs each one via
  `console.warn` rather than blocking the real output. The
  determinism gap this same PS-276 batch closed
  (`services/documentRendering/applyDeterministicPdfMetadata.ts`) is
  applied on top of this function's own output, not inside it.
- **§4.2 (ephemeral memory buffer, purge-on-completion)** and the
  actual real network fetch/auth-token resolution behind
  `resolveImageUrlWithFallback.ts`'s own pure decision logic are both
  genuine backend/infra concerns this sandbox cannot build or verify.

---
*When this folder's contents change meaningfully, update THIS file.*
