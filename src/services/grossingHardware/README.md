# services/grossingHardware/

Real, per the RFP-APLIS-2026-GLOBAL Story 9 — Grossing Station
Hardware Integration gap: "Camera integration at the grossing
station, digital scale integration, and confirmation of whether real
speech-to-text gross dictation... is in scope or a separate, later
capability."

## Confirmed directly before building: the third part is already done

Real speech-to-text gross dictation already exists — `ENTER_GROSS`
(`services/actionRegistry/`) triggers the same real, browser-native,
continuous `SpeechRecognition`-based dictation mode already used for
microscopic and diagnosis entry (`contexts/VoiceProvider.tsx`'s own
`dictate` phase). This is genuine free-text transcription, not a
discrete command system limited to a fixed vocabulary. No new work
was needed for this part — it was already in scope and already built.

## Real, existing groundwork found before building the other two

- **Piece count** (a real, adjacent grossing concern, checked while
  scoping this gap): already fully supported.
  `HistologyBlock.pieceCount` (recorded at grossing) and
  `pieceCountAtEmbedding` (observed at embedding) already exist, with
  a real, working Tissue Discrepancy QA flag comparing the two — live
  in `BlockStainEditorModal.tsx`'s own "Pieces Grossed" field.
  Nothing to build here.
- **`DigitalAsset`** (`types/case/Material.ts`) already existed as a
  type — `gross_photo` / `block_face_photo` / `wsi_scan` — but its own
  header confirmed directly: "no upload or scan pipeline exists in
  the app yet... left empty everywhere for now." This module is that
  real pipeline's first real producer.
- **The established hardware-bridge pattern** —
  `services/printerProfiles/IPrinterProfileService.ts`'s own
  `PrinterBridgeType`, including a real, named, from-scratch local
  agent (`pathscribe_agent`, PS-52) as the last-resort bridge when no
  existing third-party bridge is already installed at a site. Reused
  directly here rather than inventing a competing hardware-profile
  concept.

## Files

- **`IGrossingHardwareProfileService.ts` / `mockGrossingHardwareProfileService.ts`**
  — real, per-station hardware profiles (`kind: 'camera' | 'scale'`),
  same interface/mock pattern as `printerProfiles/`. Real, honest
  asymmetry, confirmed directly before designing this: a camera can
  be reached with NO bridge at all, via the browser's own standard
  `getUserMedia()` — most grossing-station macro cameras are standard
  USB/UVC devices. A digital scale has no equivalent reliable,
  cross-browser standard API (Web Serial exists but is Chromium-only
  and needs a real, vendor-specific protocol parser per scale model),
  so `'browser_native'` is only ever a valid `bridgeType` for
  `kind: 'camera'`. Seeded honestly: camera defaults to
  `'browser_native'` (a real, working default), scale defaults to
  `'manual_entry_only'` (the real, already-working fallback — never a
  fabricated "connected" default for hardware that isn't actually
  reachable).

- **`resolveScaleWeightCapture.ts`** — the real, testable HTTP
  contract a `pathscribe_agent` instance's own scale endpoint would
  need to satisfy (`GET {agentBaseUrl}/scale/weight` →
  `{ grams, stable }`). A `stable: false` reading (the scale still
  settling) is honestly rejected, never accepted as a real weight. 6
  real tests cover not-configured, unreachable, malformed, unstable,
  and genuinely successful cases.

- **`components/GrossingHardware/CameraCaptureControl.tsx`** — the
  real, working camera capture UI, using `getUserMedia()` directly.
  Live preview, real permission/device-error handling (distinguishes
  denied permission from no camera found from a genuine device
  error), captures a still frame to a canvas. **Updated (Sep 2026)**:
  per the uploaded image/PDF architecture spec's own §1.1
  (Reference-Only Storage Model), the captured frame is no longer
  stored directly as a `data:` URL — it's uploaded via
  `services/imageAssociation/IImageUploadService.ts` first (to the
  active Gross Imaging vendor — see `services/imageAssociation/README.md`),
  and only the real returned URL becomes `DigitalAsset.url`. Wired
  into both `BlockStainEditorModal.tsx`'s block cards ("📷 Add Photo",
  populating `HistologyBlock.digitalAssets` with `block_face_photo`
  assets) and, new in this same pass, `IntraopQueuePage.tsx`'s own
  Quick Gross step ("📷 Capture Gross Photo", populating the newly
  added `IntraopSpecimen.digitalAssets` with `gross_photo` assets) —
  confirmed directly beforehand that no real gross/frozen-section
  photo capture existed anywhere in the intraop workflow until this.

## Real, honest scope boundary

The camera capture path is genuinely functional and testable today —
real, standard browser API, no bridge dependency, no unverifiable
external hardware assumption. The one real, still-open piece: the
actual bytes-over-the-wire upload to a real vendor endpoint is genuine
backend/infra work no sandbox can perform — `mockImageUploadService.ts`
simulates a successful upload and returns a real-shaped URL, but no
real network call happens. The scale path is real, tested
*architecture* (the HTTP contract, the honest stable/unstable
distinction, the graceful degrade to manual entry) — but whether any
real, physical scale and a real `pathscribe_agent` binary actually
exist and correctly speak this contract at a real site is genuinely
unverifiable from this sandbox, per the RFP's own "Backend need" note
for this gap ("typically a local hardware/driver integration... worth
confirming once scoped"). The manual-entry fallback (the grossing
template's own existing, already-working weight field) remains the
real, always-working path regardless of whether a physical scale
bridge is ever installed at a given site.

**Real, remaining UI wiring not done in this pass**: specimen-level
`gross_photo` capture (this pass wired block-level `block_face_photo`
only, the more immediately requested case) and a settings screen for
managing `GrossingHardwareProfile` records — the service layer is
real and complete; an admin UI to create/edit profiles through
Configuration was not built.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
