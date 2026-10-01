// src/services/hardwareContainers/IHardwareContainerRegistryService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Container & Batch
// Label Management" — FR-3: "Hardware Release & Re-use Lifecycle." The
// spec's own "register" that "returns the physical rack to an Available
// hardware state... preventing duplicate batch conflicts on subsequent
// runs" — this is that register.
//
// Deliberately a NEW, separate registry, not folded into ScanStation
// (services/scanStations/) despite the real, structural similarity (both
// are admin-managed, physical-hardware records with a lifecycle) —
// confirmed directly: a scan station is WHERE a tech works (a fixed
// bench/terminal); a hardware container is WHAT a tech works WITH (a
// reusable rack/basket/tray that moves between benches and gets
// checked in/out of active batch sessions). Conflating them would force
// a scan station's own real fields (barcodeCode for "STATION:" prefix
// switching, workflowStage, facilityId) onto a genuinely different real
// entity, or vice versa.
//
// Only semi-permanent containers (Mode B — laser-engraved, reusable rack
// IDs) get a real record here. Disposable containers (Mode A — a single-
// use, timestamped CONT- label) are deliberately NOT tracked as hardware
// at all — see the spec's own FR-1.2 distinction; a disposable label has
// no physical re-use lifecycle to register.
// ─────────────────────────────────────────────────────────────────────────────

import { ServiceResult, ID } from '../types';

/** Real container types per the spec's own dropdown list — kept as a
 *  closed set (not free text) since it drives real, downstream
 *  behavior (which barcode prefix applies, whether a container is
 *  even eligible for Mode B/hardware registration at all — Ad-Hoc
 *  Batch never is, see isHardwareEligible below). */
export const CONTAINER_TYPES = [
  'Staining Rack', 'Tissue Processor Basket', 'Archive Storage Tray', 'Decal Vessel', 'Ad-Hoc Batch',
] as const;
export type ContainerType = typeof CONTAINER_TYPES[number];

/** Real, short prefix code per container type — the spec's own
 *  "STAIN" in its worked example (CONT-STAIN-YYYYMMDD-XXXX,
 *  RACK-STAIN-04). "Ad-Hoc Batch" has no real, meaningful short code
 *  of its own (it's the spec's own catch-all, not a specific piece of
 *  hardware) — mapped to a real, honest "ADHOC" rather than guessing
 *  at hardware-style shorthand for a container type that isn't real
 *  hardware. */
export const CONTAINER_TYPE_CODE: Record<ContainerType, string> = {
  'Staining Rack': 'STAIN',
  'Tissue Processor Basket': 'PROC',
  'Archive Storage Tray': 'TRAY',
  'Decal Vessel': 'DECAL',
  'Ad-Hoc Batch': 'ADHOC',
};

/** Real, honest gate — Ad-Hoc Batch is deliberately never eligible for
 *  Mode B (semi-permanent/hardware) registration; it exists
 *  specifically for the spec's own "no physical carrier at all, just a
 *  logical grouping" case, per FR-1.2's own container-type list
 *  including it alongside three real, physical carrier types. */
export function isHardwareEligible(type: ContainerType): boolean {
  return type !== 'Ad-Hoc Batch';
}

export type HardwareContainerStatus = 'Available' | 'InUse';

export interface HardwareContainer {
  id: ID;
  /** The real, laser-engraved, physical identifier — e.g.
   *  "RACK-STAIN-04". Matched case-insensitively against a real scan,
   *  same real convention as ScanStation.barcodeCode. */
  rackId: string;
  containerType: ContainerType;
  status: HardwareContainerStatus;
  /** Set only while status === 'InUse' — the real, currently-active
   *  Batch this hardware is checked out to. Cleared (not just left
   *  stale) the moment the batch is released or completes — see the
   *  spec's own FR-3.2 "disbanding logic." */
  currentBatchId?: string;
  facilityId?: string;
  /** Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
   *  Laboratory Sensor & Cold-Chain Integration gap — "smart transport
   *  containers." Most real racks are NOT smart-sensored; this stays
   *  false/undefined for the vast majority of real containers, never
   *  assumed true. */
  isSmartContainer?: boolean;
  /** The real StorageConditionType (`services/coldChain/`) this
   *  specific container's own contents must be kept within — only
   *  meaningful when isSmartContainer is true. */
  storageConditionTypeId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface IHardwareContainerRegistryService {
  getAll(): Promise<ServiceResult<HardwareContainer[]>>;
  getById(id: ID): Promise<ServiceResult<HardwareContainer>>;
  /** Real lookup for the scan-ingestion flow — matches
   *  case-insensitively against a real, scanned rackId. */
  getByRackId(rackId: string): Promise<ServiceResult<HardwareContainer>>;
  create(draft: { rackId: string; containerType: ContainerType; facilityId?: string; isSmartContainer?: boolean; storageConditionTypeId?: string }): Promise<ServiceResult<HardwareContainer>>;
  /** Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Reference
   *  Laboratory Sensor & Cold-Chain Integration gap — lets an admin
   *  retroactively mark an existing rack as smart-sensored and assign
   *  its real storage condition type, not only at creation time. */
  update(id: ID, changes: { isSmartContainer?: boolean; storageConditionTypeId?: string }): Promise<ServiceResult<HardwareContainer>>;
  /** The spec's own FR-3.2 "disbanding logic" — real, atomic check-out:
   *  fails honestly if the rack is already InUse (a real, existing
   *  conflict — see the spec's own "preventing duplicate batch
   *  conflicts"), rather than silently overwriting a different batch's
   *  own active session. */
  checkOut(rackId: string, batchId: ID): Promise<ServiceResult<HardwareContainer>>;
  /** Real, atomic check-in — the spec's own "Release Rack" action and
   *  automatic release on batch completion both call this. Idempotent:
   *  releasing an already-Available rack is a real, honest no-op, not
   *  an error. */
  checkIn(rackId: string): Promise<ServiceResult<HardwareContainer>>;
}
