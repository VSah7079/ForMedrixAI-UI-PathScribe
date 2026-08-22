// src/services/scanStations/IScanStationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "we need to pass a asset
// location - I don't think we have that configured anywhere in the
// system." Confirmed directly before building: services/locations/
// (Location/ILocationService) is a real, existing dictionary, but for
// a completely different real-world concept — WHERE A PATIENT IS
// PHYSICALLY PLACED (ward/room/bed, HL7 PV1) — not where a specimen
// is scanned at the bench. No existing config covers that at all.
//
// Same real, established shape as ILocationService.ts (facility-
// scoped, Active/Inactive/Unverified lifecycle, admin-managed CRUD) —
// reusing the proven pattern, not inventing a new one, for a
// genuinely different real entity.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

/** Real, standard workflow stages a scan station commonly maps to —
 *  the same real vocabulary cerebroAdapter.ts's own header comment
 *  already documents (Accessioning → Grossing → Processing →
 *  Embedding → Microtomy/Sectioning → Staining → Slide Archival).
 *  Guided free text, not a closed enum — a real site's own station
 *  naming/staging genuinely varies (confirmed directly — no shared
 *  standard found), same reasoning as MaterialLocation.workflowStage. */
export const SCAN_STATION_WORKFLOW_STAGES = [
  'Accessioning', 'Grossing', 'Processing', 'Embedding',
  'Microtomy / Sectioning', 'Staining', 'Slide Archival', 'Other',
] as const;

export interface ScanStation {
  id: ID;
  /** e.g. "Grossing Station 3" — the real, human-facing name that
   *  ends up in MaterialLocation.location once a scan at this station
   *  fires an outbound event. */
  name: string;
  /** Real feature, per direct follow-up: "MVP Station-Switching via
   *  Barcode Label... Admins generate and print 2D/1D barcode labels
   *  for each location (e.g., STATION:GROSSING-03)." The stable code
   *  a real, printed label encodes — deliberately separate from `id`
   *  (an internal, opaque key) so a physical label keeps working even
   *  if the underlying record is ever recreated, and so an admin can
   *  choose a real, short, printable code independent of internal
   *  storage concerns. Matched case-insensitively against the part of
   *  a scan after the real "STATION:" prefix. */
  barcodeCode: string;
  /** Which Facility (services/facilities/) this station physically
   *  sits in — same real, established scoping as Location.facilityId. */
  facilityId: string;
  /** Guided free text — see SCAN_STATION_WORKFLOW_STAGES. */
  workflowStage?: string;
  status: 'Active' | 'Inactive';
  /** Real feature, per direct follow-up: "network printer IP
   *  assignment per station." Optional — most stations (any that
   *  never print a real container label directly, e.g. a pure scan
   *  bench) genuinely have no real printer of their own; undefined
   *  means exactly that, not "not configured yet." Used by
   *  dispatchContainerLabelPrint.ts as the real, target printer for a
   *  batch created with this station as its own targetStationId. */
  printerIp?: string;
  /** Real feature, per direct follow-up: "I would like to support
   *  both slide engraving and printed labels." Confirmed directly:
   *  dispatchCassetteLabel.ts/dispatchSlideLabel.ts's own real
   *  engraver-stub dispatch is genuinely correct for sites with real
   *  engraver hardware (Leica CEREBRO, etc.) — unchanged by this.
   *  This is the real, parallel, ALSO-supported path for sites
   *  without one, or as a genuine fallback for sites with both.
   *  Deliberately two independent flags, not a three-way enum
   *  ('engrave' | 'print' | 'both') — "both" is exactly what having
   *  both flags true already means, and a station supporting neither
   *  (a pure scan bench) needs no special third state either.
   *  Trigger sites (handleAddBlock for cassettes, the scan-triggered
   *  slide dispatch in useGlobalMaterialScanTracking.ts) check both
   *  flags independently and fire whichever real dispatch(es) apply —
   *  never assume exactly one is ever true. */
  supportsEngraving: boolean;
  /** See supportsEngraving's own doc comment. When true, a real GS1
   *  DataMatrix label is built and dispatched via
   *  cassetteSlidePrinterProfileId's own configured bridge (QZ Tray
   *  today; Interface Engine/Local Bridge Agent once those exist) —
   *  see printCassetteSlideLabel.ts. */
  supportsPrinting: boolean;
  /** Real, deliberate link to the PrinterProfile registry
   *  (services/printerProfiles/) — NOT the same as printerIp above.
   *  printerIp is real, existing, and already used by
   *  dispatchContainerLabelPrint.ts for a genuinely different label
   *  type (Mode A/B container barcodes); this is specifically which
   *  real printer profile (with its own real bridgeType, GS1/
   *  DataMatrix capability flags) this station's own cassette/slide
   *  GS1 labels print through. Required when supportsPrinting is
   *  true — a station configured to print without a real target
   *  printer profile isn't actually printable yet, and shouldn't
   *  silently no-op as if it were. */
  cassetteSlidePrinterProfileId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IScanStationService {
  getAll(): Promise<ServiceResult<ScanStation[]>>;
  listForFacility(facilityId: string): Promise<ServiceResult<ScanStation[]>>;
  getById(id: ID): Promise<ServiceResult<ScanStation>>;
  /** Real lookup for the barcode-switching flow — matches
   *  case-insensitively against the part of a scan after the real
   *  "STATION:" prefix. */
  getByBarcodeCode(code: string): Promise<ServiceResult<ScanStation>>;
  create(draft: Omit<ScanStation, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceResult<ScanStation>>;
  update(id: ID, changes: Partial<Omit<ScanStation, 'id'>>): Promise<ServiceResult<ScanStation>>;
  deactivate(id: ID): Promise<ServiceResult<ScanStation>>;
  reactivate(id: ID): Promise<ServiceResult<ScanStation>>;
}
