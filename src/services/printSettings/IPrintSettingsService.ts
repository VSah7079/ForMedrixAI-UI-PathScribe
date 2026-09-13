// src/services/printSettings/IPrintSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up on the label/cassette print-
// workflow architecture: "Structure your print settings hierarchically
// so labs can enforce their own policies." Real, confirmed Tier 1
// (System/Facility-wide default) — the same single-tier, global config
// pattern every other settings screen in this app already uses
// (aiBehaviorService.ts is the closest real analog; this mirrors it
// exactly, right down to reusing the shared mockStorage.ts utility
// every current mock service is built on).
//
// Deliberately does NOT attempt Tier 2 (workstation/device-level) or
// Tier 3 (voice/hotkey action wiring) here — see
// pages/SynopticReportPage/hooks/README.md's own discussion for why
// Tier 2 is a real, separate piece of infrastructure (this app has no
// existing "which physical bench is this browser at" concept at all),
// not a config screen away.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';
import type { ContainerType } from '@/services/hardwareContainers/IHardwareContainerRegistryService';

export interface PrintSettingsConfig {
  /** "On-Demand" (per-block/container, as each cassette is logged) vs
   *  "Batch" (explicit, per-case bulk action) — real, per direct
   *  research: default to on-demand to respect patient-safety
   *  guardrails, while still supporting labs that insist on batching. */
  defaultPrintBehavior: 'on_demand' | 'batch';
  /** Whether operators can override the default behavior per action,
   *  or the system-wide default is enforced without exception. */
  enforceOnDemandGuardrails: boolean;
  /** Real, direct follow-up: "Require (or offer a soft guardrail)
   *  scanning the newly printed label barcode before moving to the
   *  next specimen block to close the loop." Reuses the real,
   *  already-built barcode-scan infrastructure (contexts/
   *  ScannerProvider.tsx's own PATHSCRIBE_SCAN event) — this flag
   *  gates a new listener, not new scanning infrastructure. */
  requireScanVerificationBeforeNextBlock: boolean;
  /** Which real LabelSizePreset id (types/labels/LabelSizePreset.ts)
   *  is active for container labels — requisition labels stay on the
   *  full-page preset regardless, per how buildContainerLabelData.ts's
   *  own real call site already works. Also the real, single source of
   *  truth for Batch Management's own Master Batch Barcode labels
   *  (NewContainerModal.tsx) — both are genuinely "container labels";
   *  keeping one shared setting avoids two, silently-driftable presets
   *  for the same real kind of physical label. */
  containerLabelPresetId: string;
  /** Real, direct correction, per direct follow-up: "Requisition
   *  Labels should never be a Full page... standard thermal label
   *  printers... is much more standard and practical." Configurable
   *  the same way containerLabelPresetId is — a lab that genuinely
   *  wants a full-page requisition can still choose one of the real,
   *  available full-page presets; the honest default
   *  (DEFAULT_REQUISITION_LABEL_PRESET_ID) is now a real, standard
   *  thermal size instead. */
  requisitionLabelPresetId: string;
  /** Real feature, per direct follow-up: "Admin Config screen for
   *  Container Label Management: barcode symbology (DataMatrix/QR)...
   *  prefix-convention editing." Applied to Batch Management's own
   *  Master Batch Barcode labels — was a hardcoded 'code128' literal
   *  directly in NewContainerModal.tsx before this existed. */
  containerBarcodeSymbology: LabelBarcodeSymbology;
  /** The literal prefix before {TYPE}-{YYYYMMDD}-{SUFFIX} for a
   *  disposable (Mode A) label — was the hardcoded literal "CONT" in
   *  mockBatchService.ts's own generateDisposableBarcode. */
  disposableBarcodePrefix: string;
  /** The literal prefix before {TYPE}-{NN} for a semi-permanent (Mode
   *  B) physical rack — was the hardcoded literal "RACK" throughout
   *  hardwareContainerRegistryService.ts and its own doc comments. */
  rackBarcodePrefix: string;
  /** Real, per-container-type short codes — was the hardcoded
   *  CONTAINER_TYPE_CODE map (IHardwareContainerRegistryService.ts).
   *  Kept as a full, real Record (not partial) so every real container
   *  type always has an admin-visible, editable code — never a silent
   *  fallback a site's own admin can't see or change. */
  containerTypeCodes: Record<ContainerType, string>;
  /** Real feature, per direct follow-up: "get through all the barcode
   *  and print bits." AI(01) in every real GS1 DataMatrix cassette/
   *  slide label (utils/labels/gs1DataMatrix.ts) needs a real GTIN —
   *  and a genuine GTIN requires a real GS1 Company Prefix, registered
   *  with GS1 US (or the applicable regional GS1 Member Organisation)
   *  for ForMedrixAI LLC. That's a real, separate business/legal step
   *  no code can fabricate — this field is deliberately empty by
   *  default, not a placeholder value, so an unregistered GTIN can
   *  never silently reach a real, physical label. printCassetteSlideLabel.ts
   *  refuses to print with a real, clear error when this is unset,
   *  rather than encoding an empty/fabricated GTIN. */
  gs1Gtin: string;
  /** Real, per direct follow-up ("should we update the req and
   *  container labels as well?"): which real PrinterProfile
   *  (services/printerProfiles/) container labels dispatch through —
   *  same real link as ScanStation.cassetteSlidePrinterProfileId, at
   *  the global/system level since container labels aren't printed
   *  from one specific physical station the way cassette/slide labels
   *  are. Undefined by default — a genuinely real, honest "not yet
   *  configured" state, not a guessed default; printContainerLabel
   *  falls back to the real, working window.print() path when unset,
   *  never silently failing. Deliberately does NOT cover requisition
   *  labels — those print on the real, existing
   *  requisition_full_page_letter preset (a true, full letter-size
   *  page), a genuine physical mismatch for a thermal ZPL bridge sized
   *  for small labels, not full pages; requisition labels stay on
   *  window.print() (the real, correct mechanism for that size)
   *  regardless of this setting. */
  containerLabelPrinterProfileId?: string;
  /** Real, per the same direct follow-up, now that requisition labels
   *  default to a real thermal size (see
   *  DEFAULT_REQUISITION_LABEL_PRESET_ID's own corrected doc comment)
   *  rather than a full page — the same real hardware-bridge
   *  eligibility containerLabelPrinterProfileId already has, kept as
   *  its own, separate setting since a lab may genuinely want a
   *  different physical printer for requisition labels than for
   *  ordinary specimen containers. */
  requisitionLabelPrinterProfileId?: string;
  /** Real, per the same direct follow-up, for the Molecular Testing
   *  Execution Module's own labels (specimen/plate/rack/deck location)
   *  — same real reasoning as containerLabelPrinterProfileId above. */
  molecularLabelPrinterProfileId?: string;
}

export const DEFAULT_PRINT_SETTINGS_CONFIG: PrintSettingsConfig = {
  defaultPrintBehavior: 'on_demand',
  enforceOnDemandGuardrails: false,
  requireScanVerificationBeforeNextBlock: false,
  containerLabelPresetId: 'clsi_standard_specimen',
  requisitionLabelPresetId: 'requisition_pouch',
  containerBarcodeSymbology: 'code128',
  disposableBarcodePrefix: 'CONT',
  rackBarcodePrefix: 'RACK',
  containerTypeCodes: {
    'Staining Rack': 'STAIN',
    'Tissue Processor Basket': 'PROC',
    'Archive Storage Tray': 'TRAY',
    'Decal Vessel': 'DECAL',
    'Ad-Hoc Batch': 'ADHOC',
  },
  gs1Gtin: '',
};

export interface IPrintSettingsService {
  get(): Promise<ServiceResult<PrintSettingsConfig>>;
  update(patch: Partial<PrintSettingsConfig>): Promise<ServiceResult<PrintSettingsConfig>>;
  reset(): Promise<ServiceResult<PrintSettingsConfig>>;
}
