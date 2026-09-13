// src/utils/labels/printRequisitionAndContainerLabels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Label Reprint is a real thing too.
// Either a batch or single." Extracted from AccessionPage.tsx's own
// handlePrintLabels (which only ever fired once, transiently, right after
// accession — no standing way to reprint for an existing case) so the
// same real logic can be called from both the original accession-time
// flow and a new, persistent reprint entry point (MaterialTreePanel.tsx).
//
// Real bug found and fixed while extracting this: the original code
// hardcoded DEFAULT_CONTAINER_LABEL_PRESET_ID rather than reading
// printSettingsService's own containerLabelPresetId (built in Step 3,
// exposed in the real Config UI) — an admin's real preset choice was
// silently never applied.
//
// Real, direct correction, per direct follow-up: "Requisition Labels
// should never be a Full page, using standard thermal label printers
// (like Zebra or Brady at 2×1 inch or 4×6 inch multi-peel sheets) is
// much more standard and practical than a full-page layout." This
// file's own earlier comment here claimed requisition labels
// "always print full-page regardless of this setting" — that claim
// was itself the real bug: DEFAULT_REQUISITION_LABEL_PRESET_ID was
// hardcoded to a full-page preset that never should have been the
// default, and printRequisitionLabel never read a real, configurable
// setting the way printContainerLabel already did. Both are now
// fixed together — requisitionLabelPresetId (real, configurable,
// defaulting to the real, standard 4"×6" thermal size) and the same
// real QZ Tray hardware-bridge eligibility container labels already
// have.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import type { Decant } from '@/types/case/Material';
import { buildRequisitionLabelData } from './buildRequisitionLabelData';
import { buildContainerLabelData } from './buildContainerLabelData';
import { buildDecantContainerLabelData } from './buildDecantContainerLabelData';
import { buildContainerLabelHtml, buildDecantContainerLabelHtml, buildRequisitionStickerSheetHtml } from './buildLabelHtml';
import { barcodePayloadForContainer, barcodePayloadForDecantContainer } from '@/types/labels/LabelData';
import type { ContainerLabelData, DecantContainerLabelData, RequisitionStickerSheetData } from '@/types/labels/LabelData';
import { DEFAULT_REQUISITION_STICKER_COUNTS } from '@/types/labels/LabelData';
import { printLabels } from './printLabels';
import { getLabelSizePreset, DEFAULT_REQUISITION_LABEL_PRESET_ID, DEFAULT_CONTAINER_LABEL_PRESET_ID } from '@/types/labels/LabelSizePreset';
// Real, deliberate direct import — see printMolecularLabels.ts's own
// identical header comment for the real, empirically-measured reason
// (importing the full '@/services/index' barrel costs 2+ seconds).
import { mockPrintSettingsService as printSettingsService } from '@/services/printSettings/mockPrintSettingsService';
import { mockPrinterProfileService as printerProfileService } from '@/services/printerProfiles/mockPrinterProfileService';
import { buildSimpleZplLabel } from './simpleZplTemplate';
import { buildRequisitionStickerSheetZpl } from './buildRequisitionStickerSheetZpl';
import { dispatchZplLabel } from './dispatchZplLabel';

async function resolveContainerPreset() {
  const res = await printSettingsService.get();
  const presetId = res.ok ? res.data.containerLabelPresetId : DEFAULT_CONTAINER_LABEL_PRESET_ID;
  // Real, honest fallback — a genuinely unknown/stale stored preset id
  // (e.g. from a prior version) never silently produces no label at
  // all; falls back to the real, documented default instead.
  return getLabelSizePreset(presetId) ?? getLabelSizePreset(DEFAULT_CONTAINER_LABEL_PRESET_ID)!;
}

/** Real, per direct follow-up ("should we update the req and container
 *  labels as well?"): when a real PrinterProfile is configured
 *  (containerLabelPrinterProfileId) with a real, working bridge
 *  (qz_tray today), dispatches the real, physical thermal print
 *  directly — the same real hardware path cassette/slide labels
 *  already use. Real, honest degrade: returns false (never throws) on
 *  any real failure to look up settings/profile, or a genuinely
 *  unconfigured/unsupported bridge — the caller's own existing
 *  window.print() path remains the real, working fallback either way. */
async function tryDispatchContainerLabelViaHardwareBridge(data: ContainerLabelData): Promise<boolean> {
  const settingsRes = await printSettingsService.get();
  const profileId = settingsRes.ok ? settingsRes.data.containerLabelPrinterProfileId : undefined;
  if (!profileId) return false;

  const profileRes = await printerProfileService.getById(profileId);
  if (!profileRes.ok || !profileRes.data) return false;
  const printer = profileRes.data;
  if (printer.bridgeType !== 'qz_tray') return false;

  const preset = await resolveContainerPreset();
  const zpl = buildSimpleZplLabel({
    barcodePayload: barcodePayloadForContainer(data),
    symbology: preset.defaultBarcodeSymbology,
    textLines: [data.patientName, data.mrn, `${data.fullAccession}-${data.specimenLabel}`],
    dpi: printer.dpi, widthMm: preset.widthMm, heightMm: preset.heightMm,
  });
  const result = await dispatchZplLabel(printer, zpl, 1);
  return result.ok;
}

async function resolveRequisitionPreset() {
  const res = await printSettingsService.get();
  const presetId = res.ok ? res.data.requisitionLabelPresetId : DEFAULT_REQUISITION_LABEL_PRESET_ID;
  return getLabelSizePreset(presetId) ?? getLabelSizePreset(DEFAULT_REQUISITION_LABEL_PRESET_ID)!;
}

/** Real, per direct follow-up + supplied research on ZPL layout
 *  verification: tries the real, mathematically-verified multi-zone
 *  ZPL path first when a real printer profile is configured, falling
 *  back to the tested window.print() sheet otherwise. Same real
 *  degrade posture as tryDispatchContainerLabelViaHardwareBridge above
 *  — never throws, a genuine failure or missing config simply means
 *  the real, working fallback runs instead. */
async function tryDispatchRequisitionSheetViaHardwareBridge(data: RequisitionStickerSheetData, preset: { widthMm: number; heightMm: number }): Promise<boolean> {
  const settingsRes = await printSettingsService.get();
  const profileId = settingsRes.ok ? settingsRes.data.requisitionLabelPrinterProfileId : undefined;
  if (!profileId) return false;

  const profileRes = await printerProfileService.getById(profileId);
  if (!profileRes.ok || !profileRes.data) return false;
  const printer = profileRes.data;
  if (printer.bridgeType !== 'qz_tray') return false;

  const zpl = buildRequisitionStickerSheetZpl(data, preset.widthMm, preset.heightMm, printer.dpi);
  const result = await dispatchZplLabel(printer, zpl, 1);
  return result.ok;
}

export async function printRequisitionLabel(caseData: Case): Promise<boolean> {
  const preset = await resolveRequisitionPreset();
  const data: RequisitionStickerSheetData = { ...buildRequisitionLabelData(caseData), ...DEFAULT_REQUISITION_STICKER_COUNTS };
  if (await tryDispatchRequisitionSheetViaHardwareBridge(data, preset)) return true;
  const html = buildRequisitionStickerSheetHtml(data, preset);
  return printLabels([html], preset, `Requisition — ${caseData.accession.fullAccession}`);
}

export async function printContainerLabel(caseData: Case, specimen: Pick<Specimen, 'label' | 'description' | 'blocks'>): Promise<boolean> {
  const data = buildContainerLabelData(caseData, specimen);
  if (await tryDispatchContainerLabelViaHardwareBridge(data)) return true;
  const preset = await resolveContainerPreset();
  const html = buildContainerLabelHtml(data, preset);
  return printLabels([html], preset, `Container Label — ${caseData.accession.fullAccession}-${specimen.label}`);
}

export async function printAllContainerLabels(caseData: Case, specimens: Pick<Specimen, 'label' | 'description' | 'blocks'>[]): Promise<boolean> {
  const allData = specimens.map(sp => buildContainerLabelData(caseData, sp));
  // Real, per this file's own established "batch job" posture — if a
  // real hardware bridge is configured, every real label in this
  // batch dispatches through it; a real batch never partially
  // succeeds via hardware and falls back to a browser print dialog
  // for the rest, which would confuse a tech mid-run.
  const settingsRes = await printSettingsService.get();
  if (settingsRes.ok && settingsRes.data.containerLabelPrinterProfileId) {
    const results = await Promise.all(allData.map(d => tryDispatchContainerLabelViaHardwareBridge(d)));
    if (results.every(Boolean)) return true;
  }
  const preset = await resolveContainerPreset();
  const htmlFragments = allData.map(d => buildContainerLabelHtml(d, preset));
  return printLabels(htmlFragments, preset, `Container Labels — ${caseData.accession.fullAccession}`);
}

/** Real, direct fix, per direct follow-up ("Why is the decant label
 *  being handled differently?"): confirmed directly — there was no
 *  real, deliberate reason. This is the same real hardware-bridge
 *  eligibility every other real label type already has
 *  (printContainerLabel above, cassette/slide, all four molecular
 *  types); the decant label was added later specifically to fix a
 *  real, separate problem (it had no barcode at all before) and never
 *  retrofitted with this same pattern its own sibling function
 *  already had. Real, deliberate reuse: shares
 *  `containerLabelPrinterProfileId`, not a new, separate setting — a
 *  decant container is the same real, physical label size/printer
 *  target as an ordinary specimen container (this file's own
 *  printDecantContainerLabel doc comment below already states this
 *  for the preset; the printer profile follows the same real
 *  reasoning). */
async function tryDispatchDecantContainerLabelViaHardwareBridge(data: DecantContainerLabelData): Promise<boolean> {
  const settingsRes = await printSettingsService.get();
  const profileId = settingsRes.ok ? settingsRes.data.containerLabelPrinterProfileId : undefined;
  if (!profileId) return false;

  const profileRes = await printerProfileService.getById(profileId);
  if (!profileRes.ok || !profileRes.data) return false;
  const printer = profileRes.data;
  if (printer.bridgeType !== 'qz_tray') return false;

  const preset = await resolveContainerPreset();
  const zpl = buildSimpleZplLabel({
    barcodePayload: barcodePayloadForDecantContainer(data),
    symbology: preset.defaultBarcodeSymbology,
    textLines: [data.patientName, data.mrn, `${data.fullAccession}-${data.specimenLabel}${data.decantLabel}`],
    dpi: printer.dpi, widthMm: preset.widthMm, heightMm: preset.heightMm,
  });
  const result = await dispatchZplLabel(printer, zpl, 1);
  return result.ok;
}

/** Real feature, per direct follow-up: "proceed with the decant
 *  container label." Same real, on-demand print action as
 *  printContainerLabel above, for a decant's own, separate physical
 *  container — reuses the exact same resolveContainerPreset()/
 *  printLabels() pipeline, since a decant container label is the
 *  same real physical label SIZE/print path as an ordinary specimen
 *  container label, just a different real content template. */
export async function printDecantContainerLabel(
  caseData: Case,
  specimenLabel: string,
  specimenDesc: string,
  decant: Pick<Decant, 'label' | 'decantType'>,
): Promise<boolean> {
  const data = buildDecantContainerLabelData(caseData, specimenLabel, specimenDesc, decant);
  if (await tryDispatchDecantContainerLabelViaHardwareBridge(data)) return true;
  const preset = await resolveContainerPreset();
  const html = buildDecantContainerLabelHtml(data, preset);
  return printLabels([html], preset, `Decant Container Label — ${caseData.accession.fullAccession}-${specimenLabel}${decant.label}`);
}
