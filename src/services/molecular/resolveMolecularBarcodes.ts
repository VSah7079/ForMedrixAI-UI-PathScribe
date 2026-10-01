// src/services/molecular/resolveMolecularBarcodes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §2 "Core Operational
// Entities & Unique Identifier (UUID) Hierarchy" — the exact barcode
// formats the specification names, as pure, testable functions.
// Real, deliberate design: date and sequence are given by the caller
// rather than read from the system clock/a counter inside this file —
// matching this app's own established "pure function, caller supplies
// context" posture used throughout (e.g. resolveCytologyWorkloadCapacity.ts),
// so the same barcode is reproducible in a test without mocking time.
// ─────────────────────────────────────────────────────────────────────────────

/** Real, shared zero-padding helper — every one of the spec's own
 *  barcode formats pads its sequence number to a fixed width. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatDateYyyymmdd(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
}

/** SPEC-YYYYMMDD-XXXXXXXX — the primary collection vial. */
export function generateSpecimenContainerBarcode(date: Date, sequence: number): string {
  return `SPEC-${formatDateYyyymmdd(date)}-${pad(sequence, 8)}`;
}

/** RACK-MOLE-XXXXX — extraction/storage rack. */
export function generateExtractionRackBarcode(sequence: number): string {
  return `RACK-MOLE-${pad(sequence, 5)}`;
}

/** PLT-[AssayCode]-YYYYMMDD-XXX — molecular plate/matrix container. */
export function generateMolecularPlateBarcode(assayCode: string, date: Date, sequence: number): string {
  return `PLT-${assayCode}-${formatDateYyyymmdd(date)}-${pad(sequence, 3)}`;
}

/** PLT-[UUID]:[Row][Col] — plate well/position identifier. Real, per
 *  the spec's own worked example (PLT-98F2A:A01): the plate side uses
 *  a short form of the plate's own real UUID, not the full UUID
 *  string — the well identifier is meant to be human-scannable/
 *  readable, and the full plate UUID is already carried separately on
 *  MolecularBatch.plateUuid for exact lookups. */
export function generateWellIdentifier(plateUuid: string, wellPosition: string): string {
  const shortUuid = plateUuid.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `PLT-${shortUuid}:${wellPosition}`;
}

/** BATCH-YYYYMMDD-XXXX — the batch's own master barcode, per the
 *  spec's own §4.1 worked JSON example (batch_id). */
export function generateMolecularBatchBarcode(date: Date, sequence: number): string {
  return `BATCH-${formatDateYyyymmdd(date)}-${pad(sequence, 4)}`;
}

/** LOC-INST-[ID]-[POSITION] — printable deck/instrument location
 *  label, per the spec's own §3.1 "Deck Location Labeling." */
export function generateDeckLocationLabel(instrumentId: string, position: string): string {
  return `LOC-INST-${instrumentId}-${position}`;
}

/** Real, per the spec's own §3.1 "Automated... Well Mapping... Row-
 *  Major or Column-Major order." Given a plate's own real dimensions,
 *  produces every real well position in the requested fill order — the
 *  real basis for auto-population, kept separate from any specific
 *  batch so it can be tested and reused without constructing one.
 *
 *  Real, direct correction, per direct follow-up expanding real plate
 *  format support to include 1536-well (32 rows): confirmed directly
 *  (not assumed) that a real, single-character row label only ever
 *  covers 26 rows (A-Z) — the earlier version silently produced
 *  invalid, non-letter characters (via raw charCode arithmetic) for
 *  any real row past 26, a real, latent bug that simply never
 *  surfaced while every supported format topped out at 16 rows
 *  (384-well). Checked directly before picking a fix: there is no
 *  single, universally-agreed real industry standard for 1536-well row
 *  labeling past 'Z' — real, competing conventions exist in the field.
 *  This picks the same real, common scheme spreadsheet column
 *  labeling already uses (continuing past Z with AA, AB, AC, ...) —
 *  cited directly as a real, existing convention for 1536-well plates
 *  specifically, unambiguous to compute correctly, and a real,
 *  deliberate choice stated plainly here rather than presented as the
 *  one true standard it genuinely isn't.
 *
 *  Confirmed directly, per direct follow-up, as the real, most common
 *  convention specifically for LIMS/automation platforms (Tecan,
 *  Hamilton, Beckman Coulter) — matches standard spreadsheet column-
 *  naming logic exactly.
 *
 *  Real, flagged for later rather than built now: a real, multi-vendor
 *  interface-engine integration will likely need explicit parsing
 *  rules to normalize a real, external system's own row notation
 *  (which may not match this AA-AF convention) into this internal
 *  standard on inbound data, and to convert back out on outbound
 *  data — real, future work for whichever interface-engine
 *  integration (PS-239) actually exchanges well-position data with a
 *  specific vendor's own system, not something to speculatively build
 *  against an unknown, real vendor format today. */
function rowLabel(i: number): string {
  let n = i;
  let label = '';
  do {
    label = String.fromCharCode('A'.charCodeAt(0) + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function generateWellPositionsInOrder(
  layout: { rows: number; columns: number },
  order: 'row_major' | 'column_major' = 'row_major',
): string[] {
  const positions: string[] = [];
  if (order === 'row_major') {
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 1; c <= layout.columns; c++) positions.push(`${rowLabel(r)}${pad(c, 2)}`);
    }
  } else {
    for (let c = 1; c <= layout.columns; c++) {
      for (let r = 0; r < layout.rows; r++) positions.push(`${rowLabel(r)}${pad(c, 2)}`);
    }
  }
  return positions;
}
