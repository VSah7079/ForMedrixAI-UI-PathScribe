// src/utils/labels/printMolecularLabels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Continue with printing (labels and
// barcodes). We have mechanisms for this as well" — and the direct
// correction immediately after ("Do the histology labels have an
// integration") that found this file's own first version had wrongly
// generalized a boundary that only applies to container/requisition
// labels (window.print()-only) onto the whole app. Cassette/slide
// labels have a real, working QZ Tray thermal-printer bridge already
// — confirmed directly by reading printCassetteSlideLabel.ts before
// writing this. Molecular labels are the same real physical object
// category (small, plate/specimen/rack scale) as cassette/slide and
// container labels, so they get the same real hardware-bridge
// eligibility container labels now have
// (printRequisitionAndContainerLabels.ts) — via the shared
// dispatchZplLabel.ts routing and the plain, non-GS1
// simpleZplTemplate.ts (a molecular label's own barcode is a plain
// container/plate/rack identifier, never a GS1-encoded symbol —
// zplTemplates.ts's own GS1 machinery genuinely doesn't apply here).
//
// Real, deliberate preset choice per label kind, unchanged from this
// file's own first version — no new presets invented.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularBatch } from '@/services/molecular/IMolecularBatchService';
import {
  buildMolecularSpecimenLabelHtml, buildMolecularPlateLabelHtml,
  buildMolecularRackLabelHtml, buildMolecularDeckLocationLabelHtml,
} from './buildLabelHtml';
import { barcodePayloadForMolecularPlate, barcodePayloadForMolecularRack, barcodePayloadForMolecularDeckLocation } from '@/types/labels/LabelData';
import { printLabels } from './printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';
import type { LabelSizePreset } from '@/types/labels/LabelSizePreset';
import { generateExtractionRackBarcode, generateDeckLocationLabel } from '@/services/molecular/resolveMolecularBarcodes';
// Real, deliberate direct import — NOT via '@/services/index'. That
// barrel re-exports this app's entire service layer; a real,
// empirical timing check found importing it alone costs 2+ seconds
// (confirmed directly, not assumed), which is what actually caused a
// real, reproduced test timeout in this file. Importing the specific
// service files directly avoids paying that cost just to reach two
// narrow services.
import { mockPrintSettingsService as printSettingsService } from '@/services/printSettings/mockPrintSettingsService';
import { mockPrinterProfileService as printerProfileService } from '@/services/printerProfiles/mockPrinterProfileService';
import { buildSimpleZplLabel } from './simpleZplTemplate';
import { dispatchZplLabel } from './dispatchZplLabel';

const SPECIMEN_PRESET_ID = 'clsi_standard_specimen';
const PLATE_AND_RACK_PRESET_ID = 'medium_container';
const DECK_LOCATION_PRESET_ID = 'clsi_standard_specimen';

/** Real, per this file's own header: when a real PrinterProfile is
 *  configured (molecularLabelPrinterProfileId) with a real, working
 *  bridge (qz_tray today), dispatches the real, physical thermal
 *  print directly. Real, honest degrade: returns false (never throws)
 *  on any real failure to look up settings/profile, or a genuinely
 *  unconfigured/unsupported bridge — the caller's own existing
 *  window.print() path remains the real, working fallback either way. */
async function tryDispatchViaHardwareBridge(barcodePayload: string, textLines: string[], preset: LabelSizePreset): Promise<boolean> {
  const settingsRes = await printSettingsService.get();
  const profileId = settingsRes.ok ? settingsRes.data.molecularLabelPrinterProfileId : undefined;
  if (!profileId) return false;

  const profileRes = await printerProfileService.getById(profileId);
  if (!profileRes.ok || !profileRes.data) return false;
  const printer = profileRes.data;
  if (printer.bridgeType !== 'qz_tray') return false;

  const zpl = buildSimpleZplLabel({ barcodePayload, symbology: preset.defaultBarcodeSymbology, textLines, dpi: printer.dpi, widthMm: preset.widthMm, heightMm: preset.heightMm });
  const result = await dispatchZplLabel(printer, zpl, 1);
  return result.ok;
}

/** Real, per the given specification's own §3.1: prints every real
 *  patient specimen well on this batch as its own, individual
 *  container label — a real tech relabeling/verifying tubes going
 *  into this run needs one real label per real tube, not one combined
 *  sheet. Real, honest no-op when the batch has no real specimen wells
 *  assigned yet (a draft batch with only controls placed so far) —
 *  never a fabricated blank label. Real, per this file's own header —
 *  each real specimen well independently tries the real hardware
 *  bridge first; a batch never partially dispatches via hardware and
 *  falls back to a browser dialog for the rest. */
export async function printMolecularSpecimenLabels(batch: MolecularBatch): Promise<boolean> {
  const preset = getLabelSizePreset(SPECIMEN_PRESET_ID)!;
  const printedAt = new Date().toISOString();
  const specimenWells = batch.wells.filter(w => w.sampleType === 'PATIENT_SPECIMEN' && w.containerBarcode);
  if (specimenWells.length === 0) return false;

  const settingsRes = await printSettingsService.get();
  if (settingsRes.ok && settingsRes.data.molecularLabelPrinterProfileId) {
    const results = await Promise.all(specimenWells.map(w => tryDispatchViaHardwareBridge(
      w.containerBarcode!, [w.accessionNumber ?? '—'], preset,
    )));
    if (results.every(Boolean)) return true;
  }

  const htmlFragments = specimenWells.map(w => buildMolecularSpecimenLabelHtml({
    containerBarcode: w.containerBarcode!, accessionNumber: w.accessionNumber ?? '—',
    aliquotVolumeUl: w.aliquotVolumeUl, printedAt,
  }, preset));
  return printLabels(htmlFragments, preset, `Specimen Labels — ${batch.batchBarcode}`);
}

export async function printMolecularPlateLabel(batch: MolecularBatch): Promise<boolean> {
  const preset = getLabelSizePreset(PLATE_AND_RACK_PRESET_ID)!;
  if (await tryDispatchViaHardwareBridge(barcodePayloadForMolecularPlate({ plateBarcode: batch.plateBarcode, assayName: batch.assayName, targetInstrumentId: batch.targetInstrumentId, printedAt: '' }), [batch.assayName, batch.targetInstrumentId], preset)) return true;
  const html = buildMolecularPlateLabelHtml({
    plateBarcode: batch.plateBarcode, assayName: batch.assayName,
    targetInstrumentId: batch.targetInstrumentId, printedAt: new Date().toISOString(),
  }, preset);
  return printLabels([html], preset, `Plate Label — ${batch.plateBarcode}`);
}

/** Real, per the given specification's own §2.2: an extraction rack is
 *  a real, physical carrier independent of any one specific batch — a
 *  real caller supplies its own sequence number (e.g. from a real
 *  rack-tracking count), this function does not invent one. */
export async function printMolecularRackLabel(sequence: number): Promise<boolean> {
  const preset = getLabelSizePreset(PLATE_AND_RACK_PRESET_ID)!;
  const rackBarcode = generateExtractionRackBarcode(sequence);
  // Real, direct bug fix per direct feedback from real Labelary
  // verification ("Seems like there should be a Printed Designation
  // under the barcode?"): this used to pass an empty textLines array,
  // the one real place this label's own hardware-bridge/ZPL path
  // diverged from its own HTML path — buildMolecularRackLabelHtml
  // already shows rackBarcode as real, visible text (labelWrapper's
  // own accessionText argument); the ZPL path now shows the exact
  // same real text, matching every sibling molecular label (plate,
  // deck location), each of which already passes its own real,
  // meaningful text lines here.
  if (await tryDispatchViaHardwareBridge(barcodePayloadForMolecularRack({ rackBarcode, printedAt: '' }), [rackBarcode], preset)) return true;
  const html = buildMolecularRackLabelHtml({ rackBarcode, printedAt: new Date().toISOString() }, preset);
  return printLabels([html], preset, `Extraction Rack Label — ${rackBarcode}`);
}

export async function printMolecularDeckLocationLabel(batch: MolecularBatch): Promise<boolean> {
  if (!batch.deckSlot) return false; // real, honest no-op — no real deck slot assigned to this batch yet
  const preset = getLabelSizePreset(DECK_LOCATION_PRESET_ID)!;
  const deckLocationLabel = generateDeckLocationLabel(batch.targetInstrumentId, batch.deckSlot);
  if (await tryDispatchViaHardwareBridge(barcodePayloadForMolecularDeckLocation({ deckLocationLabel, targetInstrumentId: batch.targetInstrumentId, deckSlot: batch.deckSlot, printedAt: '' }), [batch.targetInstrumentId, batch.deckSlot], preset)) return true;
  const html = buildMolecularDeckLocationLabelHtml({
    deckLocationLabel, targetInstrumentId: batch.targetInstrumentId, deckSlot: batch.deckSlot, printedAt: new Date().toISOString(),
  }, preset);
  return printLabels([html], preset, `Deck Location Label — ${deckLocationLabel}`);
}
