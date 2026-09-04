// src/services/printerProfiles/IPrinterProfileService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct request: PS-51's own spec, Section 2
// ("Printer Capability & Profile Registry") — "Printers vary widely in
// ZPL support, DPI, DataMatrix module sizes, and firmware. A registry
// ensures correct template selection and prevents unreadable
// barcodes." Real, standalone dictionary, matching the same
// established pattern as every other real registry in this app
// (Protocol Dictionary, Stain Dictionary, Departments) —
// interface + mock service + admin UI, not a one-off.
//
// Real, honest scope note: this registry is real and complete on the
// PathScribe side (storing/managing profiles, real capability
// validation before a job is dispatched). What it does NOT do — and
// structurally can't, from inside this web app — is discover a real
// printer's own capabilities automatically, or push templates to real
// hardware. Section 8's own Local Bridge Agent ("Detect local printer
// capabilities") is the real, separate piece that would populate/
// verify these profiles against actual, connected hardware; this
// registry is where that data lives and gets validated against once
// it exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

/** Real, named vendor families — per Section 5.1's own targetPrinter
 *  shape ("vendor": "ZEBRA_ZPL") and Section 1's own architecture
 *  diagram (Zebra, Citizen, SATO for local USB; Zebra, Leica, Sakura
 *  for network/cassette). Deliberately not a free-text field — the
 *  real template-selection logic (Section 2.3's own "Auto select ZPL
 *  template based on profile") needs to branch on this. */
export type PrinterVendor = 'ZEBRA_ZPL' | 'CITIZEN' | 'SATO' | 'LEICA_CEREBRO' | 'SAKURA_TISSUE_TEK' | 'OTHER';

/** Real, researched bridge landscape — per direct research into what
 *  real target sites actually have installed. `vendor` (above)
 *  describes the physical printer hardware brand; this describes the
 *  separate, orthogonal question of HOW a browser reaches it — the
 *  same printer could, in principle, be reachable via more than one
 *  of these depending on what a given site already runs.
 *
 *  - 'qz_tray': the most widespread, vendor-agnostic browser bridge —
 *    real, open-source (LGPL 2.1), already installed at many sites for
 *    other web tools' own raw ZPL/EPL needs. See qzTrayBridge.ts —
 *    this is the one bridge type this app has real, working,
 *    tested client-side integration code for already, since it's a
 *    real, existing third-party service with a real JS API, not
 *    something that needs building from scratch.
 *  - 'zebra_browser_print': common at mid-market/smaller sites with
 *    Zebra-only hardware (ZD420/ZD621) — real, but strictly
 *    single-vendor, and genuinely fragile in practice (unmanaged
 *    local service on localhost:9100/9101, real, reported issues with
 *    local SSL certificate mismatches and WebSocket drops on
 *    locked-down hospital endpoints).
 *  - 'bartender_rest': the dominant ENTERPRISE precedent — NHS Trusts/
 *    large health systems with complex compliance rules or multi-site
 *    templates typically already run BarTender's own Integration
 *    Platform (Commander), listening via REST/SOAP or watched-folder —
 *    real, purely server-to-server, no client-side browser bridge at
 *    all. PathScribe's own real integration point for this is PS-53's
 *    Interface Engine work, not a browser-side module.
 *  - 'direct_interface_engine': centralized histology/grossing
 *    stations often bypass any local workstation agent entirely — the
 *    LIS/Interface Engine (Mirth/Rhapsody) itself routes ZPL over TCP
 *    9100 directly to static-IP printers. Same real PS-53 scope.
 *  - 'pathscribe_agent': the from-scratch native agent (PS-52) — real,
 *    but genuinely the fallback of last resort now, not the default
 *    assumption: real research shows most target sites already have
 *    one of the above, and enterprise IT is real, actively resistant
 *    to installing a new, unproven vendor's own background daemon.
 *  - 'os_print_dialog': today's real, working default (the browser's
 *    own OS print-queue path) — kept deliberately, not as a stopgap:
 *    real research confirms OS-driver rasterization/margin-drift
 *    genuinely matters for thermal barcode label precision, but the
 *    same research says this path remains the right, permanent choice
 *    specifically for non-ZPL graphic printers (Leica/Sakura). */
export type PrinterBridgeType =
  | 'qz_tray' | 'zebra_browser_print' | 'bartender_rest' | 'direct_interface_engine' | 'pathscribe_agent' | 'os_print_dialog';

/** Real shape, matching Section 2.2's own "Printer Profile Schema"
 *  exactly, field for field. */
export interface PrinterProfile {
  id: ID;
  /** Real, human-facing identifier — Section 2.2's own example
   *  ("ZEBRA-192.168.12.85") combines model + address; kept as a
   *  separate, editable display name here rather than derived, since
   *  a real lab may want its own naming convention (e.g. "Grossing
   *  Station 3 Zebra"). */
  printerId: string;
  model: string;
  dpi: number;
  supportsDataMatrix: boolean;
  supportsGS1: boolean;
  zplVersion: string;
  maxPrintDensity: number;
  /** Real DataMatrix module size, in dots — Section 2.2's own field;
   *  directly affects real scannability at a given DPI (too small a
   *  module at low DPI is a real, common cause of unreadable
   *  barcodes in the field). */
  moduleSize: number;
  vendor: PrinterVendor;
  /** Real, required field — which real, software bridge mechanism
   *  reaches this specific printer at this specific site. See
   *  PrinterBridgeType's own doc comment for the full, researched
   *  reasoning behind each option. Required, not optional or
   *  defaulted — a printer profile with an unknown bridge type isn't
   *  actually addressable yet, and shouldn't silently pass capability
   *  checks as if it were. */
  bridgeType: PrinterBridgeType;
  /** Real, additive fields beyond Section 2.2's own minimal schema —
   *  needed to actually ADDRESS the printer for Section 5's own
   *  targetPrinter payload shape, not just describe its capabilities. */
  ipAddress?: string;
  port?: number;
  /**
   * Real, per direct guidance (Workstation & Hardware redesign):
   * which real performing-lab Facility this printer is physically
   * registered at — same Global/scoped convention as everywhere else
   * in this app (ContainerType.performingLabFacilityId,
   * ScanStation.facilityId). Undefined/empty is real and valid, not a
   * placeholder — a genuinely shared, network-pool printer reachable
   * from more than one facility's own benches has no single owner;
   * scoped is the default an admin actively chooses, not a fallback
   * for "hasn't been set yet."
   */
  facilityId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IPrinterProfileService {
  getAll(): Promise<ServiceResult<PrinterProfile[]>>;
  getById(id: ID): Promise<ServiceResult<PrinterProfile | null>>;
  add(profile: Omit<PrinterProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<PrinterProfile>>;
  update(id: ID, changes: Partial<Omit<PrinterProfile, 'id'>>): Promise<ServiceResult<PrinterProfile>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
