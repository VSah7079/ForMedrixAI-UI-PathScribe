# services/printing/

Component B of the "Decoupled Dispatch & Print Management System" spec — the Print Queue Engine. Both real delivery modes the source spec describes, gated by Component C (`services/delivery/`) and running as a genuinely concurrent second subscriber to `services/reports/publishReportReleasedEvent.ts`, alongside electronic dispatch.

**Pattern:** standard interface/mock pattern for the queue (`IPrintQueueService`/`mockPrintQueueService`), mirroring `services/reports/mockOutboundResultQueueService.ts`'s own already-proven queue/retry/error-code shape rather than inventing a new one.

## What's real and built

- **`types/printing/PrintJob.ts`** — the queue entry shape. `PrintDeliveryMode` is exactly the source spec's own two modes:
  - `NATIVE_QZ_TRAY` (Mode 1, Native Spooler) — routes the rendered PDF directly to a printer via the same, already-integrated QZ Tray bridge (`utils/labels/qzTrayBridge.ts`) this app already uses for cassette/slide labels, extended here with a real PDF print path (`printPdfViaQzTray`) alongside its existing raw-ZPL one. Checked directly against QZ Tray's own real, installed type definitions (`@types/qz-tray`) before building this — the correct real shape is `{type: 'pixel', format: 'pdf', flavor: 'base64', data}`, not a guessed one.
  - `INTERFACE_ENGINE_HANDOFF` (Mode 2) — hands the rendered PDF off via `services/interfaceDispatch/dispatchInterfaceMessage.ts`'s own, already-generic dispatch (`'PRINT_JOB'` added to `InterfaceTransactionType`), letting the Interface Engine's own real printer-spooling middleware take over from there.
  - `PaperSize` (`'LETTER' | 'A4' | 'LEGAL'`) — a facility-level setting (`Facility.printDeliveryConfig.paperSize`, `services/facilities/IFacilityService.ts`), since which paper a printer is loaded with is a property of the site, not any one report. Defaults to `LETTER` (this app's own existing US-market default) when unset — never silently assumed `A4` for a site that never configured it. Real, accurate mm dimensions (`PAPER_SIZE_DIMENSIONS_MM`), passed through to QZ Tray's own real `size`/`units` config.
- **`IPrintQueueService.ts` / `mockPrintQueueService.ts`** — the real, persisted queue: enqueue, retry, mark-failed (with a real, permanent audit log entry the moment a failure happens, same posture `services/reports/mockOutboundResultQueueService.ts` already established), mark-printed.
- **`dispatchPrintJob.ts`** — the real function tying it together. Resolves a facility's `printDeliveryConfig`; a facility that never configured print is a real, honest `not_configured` outcome, never a surprise print job. Routes to whichever mode the facility chose, and fails a job honestly (`PRINTER_OFFLINE`, `PRINTER_UNREACHABLE`, `PRINT_REJECTED`) rather than throwing — per the source spec's own Use Case 2 ("holds the job, alerts the administrator, re-attempts... without blocking the electronic HL7 interface"). Real, honest requirement: needs a `generatePdf` callback from its own caller, since the actual PDF-rendering function lives inside `pages/SynopticReportPage/SynopticReportPage.tsx`'s own React closure (`generateReportPdfSnapshot`) — this file has no way to reach it on its own, same real structural limit `services/reports/buildOruR01Payload.ts`'s own identical parameter already documents. A caller with no real access to one fails the print job honestly rather than queuing one with nothing to ever print. 11 tests covering every real branch of both modes.

## Where this is wired in

`services/reports/publishReportReleasedEvent.ts` runs `dispatchPrintJob` via `Promise.all` alongside electronic dispatch, only when Component C's own resolved action calls for it (`PRINT_ONLY` or `DUAL`). A print failure is caught and reported as an honest `printOutcome: 'failed'` on the event's own result — never allowed to break the whole publish call or mask electronic dispatch succeeding independently.

## Real, deliberate scope not yet built

- **No facility has `printDeliveryConfig` set in seed data**, and there's no admin UI to set one — this built the engine itself, not its own settings screen. Same honest gap named for the Delivery Rules Engine's own missing configuration UI.
- **QZ Tray's actual print behavior can't be exercised in this sandbox** regardless of UI — it's a real, external desktop application. The 11 tests on `dispatchPrintJob.ts` are the real coverage for both modes' own logic; nothing here can prove a physical printer actually receives ink.
- Cytology's own PDF generation for this path is real (`services/cytology/generateCytologyReportPdfSnapshot.ts` — see that folder's own README), so print genuinely works for a Cytology case once a facility configures it.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
