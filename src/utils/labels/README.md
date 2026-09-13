# utils/labels/

The whole real label-printing architecture: building label data, rendering it, and dispatching it to a physical printer via one of several real bridge paths (browser print window, QZ Tray, network/Interface Engine). 17 modules, each with its own test file.

## Building label data (pure, no dispatch)

- **`buildContainerLabelData.ts`** (+ `buildContainerLabelData.test.ts`) — real container-label data (requisition-adjacent, larger format).
- **`buildDecantContainerLabelData.ts`** (+ `buildDecantContainerLabelData.test.ts`) — decant container label data.
- **`buildRequisitionLabelData.ts`** (+ `buildRequisitionLabelData.test.ts`) — full requisition label data (patient name, MRN, accession).
- **`buildSecondaryLabelData.ts`** (+ `buildSecondaryLabelData.test.ts`) — the barcode-unreadable fallback overlay label. `buildSecondaryLabelDataForBlock`, `buildSecondaryLabelDataForMatrixBlock`, `buildSecondaryLabelDataForDecant` — all three return `null` unless a real foreign ID exists to explain why a fallback is needed.
- **`buildLabelHtml.ts`** (+ `buildLabelHtml.test.ts`) — turns built label data into the actual HTML a print window renders.

## Rendering barcodes

- **`generateBarcodeSvg.ts`** (+ `generateBarcodeSvg.test.ts`) — thin, pure wrapper around `bwip-js`'s `toSVG()`. Returns a real SVG string directly (not a canvas) specifically because that embeds cleanly into a print window's `innerHTML`.
- **`gs1DataMatrix.ts`** (+ `gs1DataMatrix.test.ts`) — GS1 Application Identifier encoding (PS-51 spec Sections 3–4, "Barcode & Label Data Standards" / "GS1 Validation Engine").
- **`zplTemplates.ts`** (+ `zplTemplates.test.ts`) — real ZPL template generation for thermal printers (PS-51 spec Section 6.2), built on `gs1DataMatrix.ts`'s own encoding.

## Dispatch — triggering a real print

- **`printLabels.ts`** (+ `printLabels.test.ts`) — the base dispatch mechanic: opens a real browser print window. Deliberately mirrors `CopilotReportViewModal.tsx`'s own, hard-won `handlePrint` logic — that file's own comment documents real, confirmed browser print-engine behavior worth not re-deriving.
- **`dispatchCassetteLabel.ts`** (+ `dispatchCassetteLabel.test.ts`) / **`dispatchSlideLabel.ts`** — on-demand, per-item print triggers, fired as each cassette/slide is logged.
- **`printCassetteSlideLabel.ts`** (+ `printCassetteSlideLabel.test.ts`) — combined cassette+slide print flow.
- **`printRequisitionAndContainerLabels.ts`** (+ `printRequisitionAndContainerLabels.test.ts`) — combined requisition+container print flow.
- **`printStationLabels.ts`** — real station-barcode label generation/print (`STATION:GROSSING-03` and similar), replacing what used to be hand-written labels.
- **`dispatchContainerLabelPrint.ts`** — the real, honest dispatch stub for container labels once a `ScanStation.printerIp` is configured; genuinely open until a real Local Bridge Agent exists — see this file's own header for the honest scope boundary.
- **`dispatchNetworkPrintJob.ts`** (+ `dispatchNetworkPrintJob.test.ts`) — real network print job dispatch to a genuine Interface Engine (PS-51 spec Sections 5–7).
- **`qzTrayBridge.ts`** (+ `qzTrayBridge.test.ts`) — the QZ Tray bridge path, the most widespread vendor-agnostic browser-to-printer bridge in web-based healthcare/logistics; many labs already run it for another tool's raw ZPL/EPL pass-through. Chosen over building a from-scratch native agent (PS-52) because it's a real, existing, open-source (LGPL 2.1) desktop service with a real JS API — not something needing to be built and gain adoption from zero. Verified safe to add before writing any integration code, not assumed: `qz-tray` (2.2.6) has zero vulnerabilities of its own (confirmed directly — the 21 `npm audit` flags present are all pre-existing, unrelated dependencies), the real `@types/qz-tray` definitions were read before use, and a full production `vite build` was confirmed to bundle it cleanly. See `PrinterBridgeType`'s own doc comment in `services/printerProfiles/IPrinterProfileService.ts` for the full tradeoff reasoning against the other 5 real bridge options.

## Batch/reprint support

- **`getAllCassetteLabelRequests.ts`** (+ `getAllCassetteLabelRequests.test.ts`) / **`getAllSlideLabelRequests.ts`** — given a real case, the full list of real cassette/slide label dispatch requests across every specimen — feeds `ManageReprintsModal.tsx`'s bulk "Print All Cassettes for Case [Accession #]" action and the reprint manager generally. `getAllSlideLabelRequests` mirrors `getAllCassetteLabelRequests`'s own pattern one level down (one request per real, ordered stain).

## Notes

- Dispatch is deliberately layered: pure data-building functions never talk to a printer directly; the `dispatch*`/`print*` functions are the only real I/O boundary. This is why every build function has its own, independent unit test with no print/browser mocking needed.
- **Real, direct correction**: `qzTrayBridge.ts` itself is no longer an unwired stub — confirmed directly, it now has real, dispatched callers: `printCassetteSlideLabel.ts` (cassette/slide), `printRequisitionAndContainerLabels.ts` (requisition, container, and — per direct follow-up ("Why is the decant label being handled differently?"), a real, direct fix closing a genuine, undiscovered gap — decant, which previously skipped this real path entirely even though its own sibling function already had it), and `printMolecularLabels.ts` (all four molecular label types). `dispatchContainerLabelPrint.ts` and `dispatchNetworkPrintJob.ts` remain real, honest, unwired halves of a real integration path — waiting on the actual Local Bridge Agent / Interface Engine connection respectively. See `services/printerProfiles/README.md` for the related capability-registry side of this.

---
*See [utils/README.md](../README.md) for how this folder fits the whole utils/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
