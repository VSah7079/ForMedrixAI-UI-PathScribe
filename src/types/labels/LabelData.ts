// src/types/labels/LabelData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label-printing architecture
// scope: pure view models for what actually renders on a requisition or
// container label. Deliberately NOT persisted records — a label is
// always a real-time rendering of existing Case/Specimen/Patient data,
// built fresh from buildRequisitionLabelData()/buildContainerLabelData()
// (utils/labels/) at print time, never its own separate source of
// truth that could drift from the real case data it describes.
// ─────────────────────────────────────────────────────────────────────────────

export interface RequisitionLabelData {
  /** The real, human-facing accession identifier — same field
   *  Case.ts's own AccessionMetadata.fullAccession doc comment already
   *  names as "what appears on labels, cassettes, and report headers." */
  fullAccession: string;
  patientName: string;
  dateOfBirth: string;
  mrn: string;
  requestingProvider?: string;
  submittingFacility: string;
  /** ISO string — when this label was generated, not when the case was
   *  accessioned; a reprint gets its own real, honest timestamp. */
  printedAt: string;
}

export interface ContainerLabelData extends RequisitionLabelData {
  /** e.g. "A" — Specimen.label */
  specimenLabel: string;
  specimenDesc: string;
  /** Real feature, per direct follow-up: "when we print we need to
   *  have some indication of these shared cassettes." Populated only
   *  when this specimen has a real block carrying a
   *  HistologyBlock.sharedCassetteId — the real siblings (other
   *  specimens physically embedded in that same cassette), so the
   *  printed, physical label affixed to that one shared object makes
   *  clear it isn't a normal, single-specimen container. Real, honest
   *  scope note: this app's container label is specimen-level, not
   *  block-level (a specimen with multiple blocks isn't distinguished
   *  on this label at all, a real, pre-existing gap this doesn't
   *  attempt to fix) — set when ANY of the specimen's own blocks is
   *  part of a shared cassette. Undefined = not shared, no change to
   *  how this label has always rendered. */
  sharedCassetteSiblings?: Array<{ specimenLabel: string; specimenDesc: string; positionInBlock?: number }>;
}

/** Real, deterministic barcode payload — the same real fullAccession
 *  for a requisition label; fullAccession + specimenLabel for a
 *  container label, matching the same "case ID + specimen letter"
 *  pattern already used for block/cassette identifiers elsewhere in
 *  this app (e.g. AccessionPage.tsx's own displayId construction). */
export function barcodePayloadForRequisition(data: RequisitionLabelData): string {
  return data.fullAccession;
}

/** Real, human-facing SPECIMEN identifier — added per direct follow-up:
 *  "Specimen/Decant-level foreign ID... ResolvedScanTarget still only
 *  has block/slide/matrix_block/matrix_slide." Added here as its own,
 *  named function for consistency with every other level
 *  (cassetteIdentifier, slideIdentifier, decantIdentifier, etc.) —
 *  even though the shape was already, unnamed, exactly what
 *  barcodePayloadForContainer below already computed. That function
 *  now calls this one directly, rather than the two staying two,
 *  separately-maintained copies of the identical string. */
export function specimenIdentifier(fullAccession: string, specimenLabel: string): string {
  return `${fullAccession}-${specimenLabel}`;
}

export function barcodePayloadForContainer(data: ContainerLabelData): string {
  return specimenIdentifier(data.fullAccession, data.specimenLabel);
}

/** Real feature, per direct follow-up: "But wet tissue is labeled
 *  with container labels" — confirmed directly: a specimen's own
 *  container label (ContainerLabelData above) already has a real,
 *  correct, scannable barcode. A DECANT poured off into its own,
 *  separate container did not — decantIdentifier() already existed
 *  as a real scheme, and resolveMaterialFromScan.ts already resolves
 *  it to a real {level: 'decant'} target, but nothing ever built the
 *  physical label itself. Deliberately its own type, not
 *  ContainerLabelData reused — a decant's real, physical container is
 *  a genuinely different object from its parent specimen's own
 *  container (the fluid/cell-block prep was poured OFF into this one,
 *  separately), and sharedCassetteSiblings (a real, block-specific
 *  concept — multiple TISSUE pieces sharing one physical cassette)
 *  has no real analog for a fluid decant. */
export interface DecantContainerLabelData extends RequisitionLabelData {
  /** e.g. "A" — the parent Specimen.label this decant was poured from. */
  specimenLabel: string;
  specimenDesc: string;
  /** e.g. "D1" — Decant.label. */
  decantLabel: string;
  /** Human-readable — "Cell Block" or "Residual Fluid", per
   *  Material.ts's own DecantType union, resolved by the caller
   *  (buildDecantContainerLabelData.ts) rather than duplicating that
   *  mapping's own display strings a second time here. */
  decantTypeLabel: string;
}

export function barcodePayloadForDecantContainer(data: DecantContainerLabelData): string {
  return decantIdentifier(data.fullAccession, data.specimenLabel, data.decantLabel);
}

/**
 * Real feature, per direct follow-up: "Station barcode label
 * generation itself... I never built anything to actually produce
 * those labels." Deliberately a real, separate, simpler interface
 * from RequisitionLabelData/ContainerLabelData above rather than
 * reusing/extending either — a station label has no patient, no
 * accession, no case at all; it's a static, admin-printed label for a
 * physical bench, built fresh from a real ScanStation record
 * (services/scanStations/), not derived from Case/Specimen data the
 * way every other label on this page is.
 */
export interface StationLabelData {
  /** e.g. "Grossing Station 3" — ScanStation.name */
  stationName: string;
  /** e.g. "GROSSING-03" — ScanStation.barcodeCode, the real code the
   *  barcode itself encodes (with the real "STATION:" prefix
   *  useGlobalStationSwitch.ts's own real scan-detection logic
   *  requires — see barcodePayloadForStation immediately below). */
  barcodeCode: string;
  workflowStage?: string;
  /** ISO string — when this label was generated. */
  printedAt: string;
}

/**
 * Real feature, per direct follow-up: "Fallback Physical Relabeling
 * (Secondary Labeling)... place an adhesive slide/cassette secondary
 * label over the non-tissue side... rather than attempting laser
 * re-engraving." A real, distinct label KIND, same real posture as
 * StationLabelData above — no patient/case fields beyond what's
 * needed for physical re-identification, since the point of this
 * label is narrow: give the object a real, scannable barcode again,
 * using PathScribe's own already-existing native identifier (never a
 * new scheme) — not replace a full container/requisition label.
 */
export interface SecondaryLabelData {
  /** The real, existing PathScribe-native identifier this label's own
   *  barcode encodes — e.g. "S26-4403-A1" or "S26-4403-C7", exactly
   *  what cassetteIdentifier()/matrixBlockIdentifier() already
   *  computed at real creation time. Never a new identifier minted
   *  for this label — the whole point is restoring a scan path to
   *  the SAME real record, not creating a second, competing one. */
  displayId: string;
  /** e.g. "A1" or "C7" — the record's own short label, shown as the
   *  one line of human-readable text this tiny label has room for. */
  recordLabel: string;
  /** The real, original foreign id this label is standing in for —
   *  shown so whoever handles this object next understands why a
   *  PathScribe-native label is here alongside (not instead of) the
   *  cassette's own real, original engraving. */
  foreignId: string;
  foreignIdSource: string;
  /** ISO string — when this label was generated. */
  printedAt: string;
}

/** Real, deterministic barcode payload for a station label — the
 *  literal "STATION:" prefix useGlobalStationSwitch.ts's own real
 *  scan-detection logic checks for; a label built any other way
 *  would produce an unrecognized barcode a real scan would silently
 *  ignore. */
export function barcodePayloadForStation(data: StationLabelData): string {
  return `STATION:${data.barcodeCode}`;
}

/** Real, deliberate simplicity — the payload is exactly the record's
 *  own, already-existing displayId, unchanged. No new prefix, no new
 *  scheme: a scan of this secondary label needs to resolve through
 *  resolveMaterialFromScan.ts's own, existing, native path exactly
 *  the same way scanning the original engraving would have. */
export function barcodePayloadForSecondaryLabel(data: SecondaryLabelData): string {
  return data.displayId;
}

/** Real, human-facing cassette identifier — what would actually be
 *  printed/scanned on a physical cassette, independent of
 *  HistologyBlock.id's own internal key (which, found while building
 *  this, isn't even consistent between the two real places a block
 *  gets created — see SCRUM ticket filed for that separately). Matches
 *  the same "case + specimen letter" pattern as
 *  barcodePayloadForContainer, with the block label appended. */
export function cassetteIdentifier(fullAccession: string, specimenLabel: string, blockLabel: string): string {
  return `${fullAccession}-${specimenLabel}${blockLabel}`;
}

/** Real, human-facing SLIDE identifier — per direct follow-up: "I
 *  think I would expect to reprint a slide label but that print icon
 *  is for the cassette." A slide is a real, physically distinct
 *  object from its parent cassette (one cassette can carry several
 *  slides — one per real, ordered stain/level), so its own identifier
 *  needs the level appended on top of the cassette's own id, not
 *  reused as-is. */
export function slideIdentifier(fullAccession: string, specimenLabel: string, blockLabel: string, level: string): string {
  return `${cassetteIdentifier(fullAccession, specimenLabel, blockLabel)}-${level}`;
}

/** Real, human-facing DECANT identifier — the direct sibling of
 *  cassetteIdentifier for cytology material (Material.ts's own
 *  Decant, which never goes through the block/embed lifecycle at
 *  all). Same "case + specimen letter" prefix, decant label appended
 *  the same way a block label is. Real, honest gap this closes only
 *  half of, per direct follow-up on unique material identification:
 *  confirmed directly — nothing in this app actually creates a
 *  Decant anywhere yet (no real UI flow exists), so unlike
 *  cassetteIdentifier/slideIdentifier (both wired into real creation
 *  call sites elsewhere), this function has no real caller today. Kept
 *  ready — ideally correct, ideally consistent with everything else —
 *  for the moment a real decant-creation flow exists, rather than
 *  inventing a different scheme later under time pressure.
 */
export function decantIdentifier(fullAccession: string, specimenLabel: string, decantLabel: string): string {
  return `${fullAccession}-${specimenLabel}${decantLabel}`;
}

/** Real, human-facing DECANT SLIDE identifier — the direct sibling of
 *  slideIdentifier for a decant's own stains, found genuinely missing
 *  per direct follow-up: "resolveBlockDisplayId() etc. are defined
 *  but never called anywhere in the real UI" — wiring the real UI
 *  surfaced that decant slides had no identifier function at all,
 *  since decantIdentifier() only ever covered the decant itself.
 *  Same real "level appended on top of the parent's own id" shape as
 *  slideIdentifier — a decant's slide is a real, physically distinct
 *  object from the decant it came from, same as a block's slide is
 *  from its cassette. */
export function decantSlideIdentifier(fullAccession: string, specimenLabel: string, decantLabel: string, level: string): string {
  return `${decantIdentifier(fullAccession, specimenLabel, decantLabel)}-${level}`;
}

/** Real, human-facing ALIQUOT identifier — per direct follow-up's own
 *  concrete example: "Aliquot A1-1A: `AP-2026-08912-A1-1A`" (specimen
 *  A, block 1, slide level 1, aliquot A). Real fix, found via direct
 *  self-review before shipping: an aliquot's own id must be built on
 *  its PARENT SLIDE's real identifier (slideIdentifier() above,
 *  which already correctly includes the dash before the level) with
 *  the aliquot's own label appended directly, no separator — never
 *  reconstructed from raw parts independently, which risks silently
 *  drifting from the slide's own real format the moment either
 *  changes. */
export function aliquotIdentifier(fullAccession: string, specimenLabel: string, blockLabel: string, level: string, aliquotLabel: string): string {
  return `${slideIdentifier(fullAccession, specimenLabel, blockLabel, level)}${aliquotLabel}`;
}

/** Same real shape as aliquotIdentifier, for an aliquot taken from a
 *  decant's own slide rather than a block's. */
export function decantAliquotIdentifier(fullAccession: string, specimenLabel: string, decantLabel: string, level: string, aliquotLabel: string): string {
  return `${decantSlideIdentifier(fullAccession, specimenLabel, decantLabel, level)}${aliquotLabel}`;
}

/** Real, human-facing MATRIX BLOCK identifier — per direct follow-up:
 *  "the matrix block itself is the tracked asset." Deliberately NOT
 *  built from cassetteIdentifier's own "case + specimen letter"
 *  pattern — a matrix block doesn't belong to one specimen, so its
 *  own real label (e.g. "M1", case-scoped and sequential — see
 *  types/case/MatrixBlock.ts's own doc comment) is appended directly
 *  to the accession instead. */
export function matrixBlockIdentifier(fullAccession: string, matrixBlockLabel: string): string {
  return `${fullAccession}-${matrixBlockLabel}`;
}

/** Real, human-facing MATRIX SLIDE identifier — the direct sibling of
 *  slideIdentifier() above, same real "L1"/"L2" level convention
 *  (confirmed directly against resolveMaterialFromScan.ts's own
 *  array-index-derived level for ordinary blocks — `L${i + 1}`, not
 *  a second, differently-lettered scheme) — never "S1"/"S2", which
 *  would mean the same real thing two different ways depending on
 *  whether a block happens to be shared. Built on
 *  matrixBlockIdentifier() exactly the way slideIdentifier() itself
 *  is built on cassetteIdentifier(). */
export function matrixSlideIdentifier(fullAccession: string, matrixBlockLabel: string, level: string): string {
  return `${matrixBlockIdentifier(fullAccession, matrixBlockLabel)}-${level}`;
}
