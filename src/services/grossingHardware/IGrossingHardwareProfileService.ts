// src/services/grossingHardware/IGrossingHardwareProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware
// Integration gap: camera and digital scale integration at the
// grossing station.
//
// Real, deliberate reuse of this app's own established, researched
// hardware-bridge pattern (printerProfiles/IPrinterProfileService.ts's
// own PrinterBridgeType) rather than inventing a competing concept —
// that file's own real research already named 'pathscribe_agent' (the
// from-scratch native agent, PS-52) as the real, last-resort local
// bridge when no existing third-party bridge is already installed at
// a site. The same real agent is the honest, right answer for camera
// and scale too — neither has a real, mature, vendor-agnostic
// third-party browser bridge the way qz_tray does for printers.
//
// Real, honest asymmetry between camera and scale, confirmed directly
// before designing this: a camera can ALSO be reached without any
// bridge at all, via the browser's own real, standard
// navigator.mediaDevices.getUserMedia() — genuinely buildable and
// testable today for any camera the OS already exposes as a standard
// USB/UVC webcam (most grossing-station macro cameras are). A digital
// scale has no equivalent standard browser API with reliable,
// cross-browser support — the Web Serial API exists, but is
// Chromium-only and still needs a real, vendor-specific protocol
// parser per scale model, so it is not treated here as a real,
// general-purpose fallback the way getUserMedia() is for camera.
// ─────────────────────────────────────────────────────────────────────────────

import type { ID, ServiceResult } from '../types';

export type GrossingHardwareKind = 'camera' | 'scale';

/** Real, per this file's own header — 'browser_native' (getUserMedia)
 *  is only ever a real, valid choice for kind: 'camera'. A scale
 *  profile's own real, honest choices are 'pathscribe_agent' (once a
 *  real, physical agent is installed and reachable) or
 *  'manual_entry_only' (the real, already-working fallback — typing
 *  the observed weight directly into the grossing template's own
 *  weight field, unchanged by this gap). */
export type GrossingHardwareBridgeType = 'pathscribe_agent' | 'browser_native' | 'manual_entry_only';

export interface GrossingHardwareProfile {
  id: ID;
  kind: GrossingHardwareKind;
  /** Real, human-facing identifier, same real naming convention as
   *  PrinterProfile.printerId — e.g. "Grossing Station 3 Macro Cam",
   *  "Grossing Station 3 Mettler Scale". */
  label: string;
  bridgeType: GrossingHardwareBridgeType;
  /** Real, per PrinterProfile's own established shape — which real
   *  station this hardware is physically connected at, so more than
   *  one grossing bench's own camera/scale can be independently
   *  configured. Undefined/empty is real and valid — not every real
   *  deployment names individual stations. */
  stationId?: string;
  /** Real, only meaningful when bridgeType is 'pathscribe_agent' —
   *  the real, local agent's own listening address (e.g.
   *  "http://localhost:9191"), same real shape as PrinterProfile's
   *  own ipAddress/port fields for its own local bridges. */
  agentBaseUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IGrossingHardwareProfileService {
  getAll(): Promise<ServiceResult<GrossingHardwareProfile[]>>;
  getById(id: ID): Promise<ServiceResult<GrossingHardwareProfile | null>>;
  create(profile: Omit<GrossingHardwareProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<GrossingHardwareProfile>>;
  update(id: ID, changes: Partial<GrossingHardwareProfile>): Promise<ServiceResult<GrossingHardwareProfile>>;
}
