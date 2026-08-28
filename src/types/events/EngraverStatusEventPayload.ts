// src/types/events/EngraverStatusEventPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// PathScribe-owned internal event contract for RECEIVING high-level
// engraver/fleet status from the Cassette Engine — the fourth real
// inbound event, alongside BlockExceptionEventPayload,
// MaterialLocationEventPayload, and CassetteDispatchOutcomeEventPayload.
// Same real "PathScribe ingests its own specification, the Engine owns
// translation" philosophy those three already established.
//
// Real, deliberate architectural boundary, per direct guidance's own
// verdict on the Engraver Monitor requirement: PathScribe owns the
// "Clinical & Workflow Layer" (a high-level device health summary),
// the Cassette Engine owns the "Hardware & Fleet Layer" (physical
// diagnostics, hopper topology, direct hardware controls). This file
// is deliberately scoped to ONLY the former:
//   - status is a coarse, real operational state (online / engraving /
//     warning / fault / offline) — never a raw sensor reading.
//   - supplyWarnings is a real, functional-state model, per direct
//     guidance's own explicit correction: a per-hopper fill percentage
//     ("Hopper 3 at 14%") forces PathScribe to track physical hardware
//     state it doesn't own and can't validate locally. Reporting a
//     named supply STATE instead (low / depleted / a color genuinely
//     unavailable) keeps PathScribe completely agnostic to whether a
//     real device has 2, 4, or 6 physical hoppers under the hood — the
//     Engine still owns which literal hopper feeds which color
//     (mockCassetteColorService.ts's own real color dictionary is
//     PathScribe's side of that mapping; the Engine's own hopper
//     topology is a separate, real thing this app never models).
//   - diagnosticsUrl is a real, Engine-hosted link — PathScribe embeds
//     or links out to it (per direct guidance's own "Launch Engine
//     Diagnostics" requirement) rather than ever building its own
//     calibration/firmware/queue-reordering UI.
// ─────────────────────────────────────────────────────────────────────────────

export type EngraverStatus = 'online' | 'engraving' | 'warning' | 'fault' | 'offline';

/** Real, closed set of functional supply states — genuinely bounded,
 *  operational categories the Engine reports, unlike a cassette color
 *  itself (CassetteColorDefinition.key), which is an open, admin-
 *  editable dictionary and stays a plain string for that reason. */
export type SupplyWarningCode = 'CASSETTE_SUPPLY_LOW' | 'CASSETTE_SUPPLY_DEPLETED' | 'COLOR_UNAVAILABLE';

export interface SupplyWarning {
  code: SupplyWarningCode;
  /** Real CassetteColorDefinition.key this warning applies to, e.g.
   *  'COLOR_BIOPSY' — same real key convention already established by
   *  CassetteDispatchOutcomeEventPayload's own requestedColorKey/
   *  actualColorKey, resolved to a real, human-readable displayName
   *  ("Blue") via mockCassetteColorService.ts when PathScribe renders
   *  this. Omitted for a genuinely device-wide supply issue not tied
   *  to one specific color. */
  colorKey?: string;
}

export interface EngraverStatusEventPayload {
  // 1. Transaction traceability — same real fields/reasoning as every
  // other real inbound event in this app.
  messageId: string;               // UUID v4, idempotency/tracing
  timestamp: string;                // ISO-8601 UTC — when the Engine sent this

  // 2. Tenant & physical location hierarchy — same real shape as
  // BlockExceptionEventPayload/MaterialLocationEventPayload.
  organisationId: string;           // e.g. 'ORG-MFT' — Organisation.id
  siteId?: string;                  // e.g. 'SITE-MRI' — Site.id from Organisation.sites[]

  // 3. Real device identity — enough for a real dashboard card and a
  // real "Launch Engine Diagnostics" link, nothing more granular.
  deviceId: string;                 // Real, stable Engine-assigned device id — e.g. 'ENG-NY-04'
  deviceName?: string;              // Real, human-facing alias, when the Engine has one
  locationLabel?: string;           // e.g. 'Grossing Bench 01' — free text, not a modeled PathScribe location entity

  // 4. The actual status being reported — deliberately coarse, see
  // this file's own header for why.
  status: EngraverStatus;
  /** Real, structured, functional supply state — see this file's own
   *  header and SupplyWarning's own doc comment for the full
   *  reasoning. This is the real, deliberate replacement for raw
   *  per-hopper telemetry. */
  supplyWarnings?: SupplyWarning[];
  /** Real, human-readable summary strings for non-supply operational
   *  issues — e.g. "Cover Open", "Firmware update required". Kept as
   *  free text deliberately: unlike supply state, these aren't a
   *  small, closed set worth a real enum, and PathScribe has no
   *  functional response to any of them beyond display (no equivalent
   *  of "tell the tech which color to go replenish"). */
  warnings?: string[];
  /** Real, Engine-hosted URL for this specific device's own native
   *  diagnostics/calibration/queue UI — PathScribe links or embeds
   *  this, never rebuilds it. Omitted if the Engine doesn't expose
   *  one for this device. */
  diagnosticsUrl?: string;
  /** Real, honest provenance — same real reasoning as
   *  BlockExceptionEventPayload.sourceSystem. */
  sourceSystem: string;
}
