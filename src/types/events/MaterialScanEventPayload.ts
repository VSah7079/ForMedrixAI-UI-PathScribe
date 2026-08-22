// src/types/events/MaterialScanEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned OUTBOUND event contract — the real, missing other
// direction, per direct follow-up: "for pathscribe to be able to
// participate in the tracking, we might need to pass tracking events
// to the engine." Same real philosophy as ModeAOrderPayload.ts's own
// header comment ("PathScribe publishes what happened in its own
// system; local lab middleware owns [the vendor-specific part]"), but
// this is a real, distinct event shape from ModeAOrderPayload — that
// one is an ORDER (a request for work); this one is an OBSERVATION
// (a real, physical fact just confirmed at the bench). Forcing this
// through the ORM^O01 order-message pipeline (ModeAInterfaceService,
// ormBuilder.ts) would be the wrong shape for what this actually is.
//
// Real, deliberate constraint, per direct follow-up: "it should only
// be triggered by a real barcode scan input." This type has no field
// for "how confident are we this is real" — it's not optional or
// probabilistic. The one, real caller that's allowed to build this
// payload (useMaterialScanTracking.ts) only does so from a genuine
// ScannerProvider PATHSCRIBE_SCAN event whose raw value matched a real,
// known cassette/slide identifier for the case actually open — never
// from a button click, a page navigation, or any other UI action that
// doesn't prove the physical item was actually scanned.
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialScanEventPayload {
  // 1. Transaction traceability — same real shape as every other
  // event contract in this app.
  messageId: string;               // UUID v4
  timestamp: string;                // ISO-8601 UTC — when the scan was captured

  // 2. Tenant & physical location hierarchy.
  organisationId: string;
  siteId?: string;

  // 3. Canonical domain keys — same real shape as
  // MaterialLocationEventPayload's own target addressing.
  internalCaseId?: string;
  accessionNumber: string;
  /** Real, architectural fix, per direct follow-up — same real
   *  reasoning as MaterialLocationEventPayload.specimenLetter's own
   *  doc comment: undefined exactly when target.level ===
   *  'matrix_block'. */
  specimenLetter?: string;
  target:
    /** Real fix, per direct follow-up: "Specimen/Decant-level foreign
     *  ID." This level already existed on this payload's own sibling,
     *  MaterialLocationEventPayload — a real, genuine gap that this
     *  one didn't have it too, found while wiring
     *  resolveMaterialFromScan.ts's own new 'specimen' target level
     *  through to both real event payloads. */
    | { level: 'specimen' }
    | { level: 'block'; blockNumber: string }
    | { level: 'slide'; blockNumber: string; slideLevel: string }
    | { level: 'decant'; decantLabel: string }
    | { level: 'decant_slide'; decantLabel: string; slideLevel: string }
    | { level: 'matrix_block'; matrixBlockId: string }
    | { level: 'matrix_slide'; matrixBlockId: string; slideLevel: string };

  /** The real, raw barcode payload the scanner actually read — kept
   *  verbatim (not just the parsed specimen/block/slide breakdown)
   *  for real audit/debugging value if a parsing assumption ever
   *  turns out wrong. */
  rawScanValue: string;

  // 4. Where this scan happened — real, admin-configured
  // ScanStation (services/scanStations/), never free text typed by
  // whoever's at the terminal. stationId is the real, stable
  // reference; stationName/workflowStage are carried alongside it so
  // a receiving system doesn't need to look the station up itself.
  stationId: string;
  stationName: string;
  workflowStage?: string;

  /** Real PathScribe user id who was logged in when the real scan
   *  happened — distinct from BlockExceptionEventPayload/
   *  MaterialLocationEventPayload's own free-text reportedBy, since
   *  this is an outbound event PathScribe itself fully controls the
   *  identity for for, not something an external system self-reports. */
  scannedByUserId: string;
}
