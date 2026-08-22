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
// silently never applied. Fixed here; requisition stays on the fixed
// full-page preset regardless, matching PrintSettingsSection.tsx's own
// stated behavior ("Requisition labels always print full-page
// regardless of this setting").
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';
import type { Decant } from '@/types/case/Material';
import { buildRequisitionLabelData } from './buildRequisitionLabelData';
import { buildContainerLabelData } from './buildContainerLabelData';
import { buildDecantContainerLabelData } from './buildDecantContainerLabelData';
import { buildRequisitionLabelHtml, buildContainerLabelHtml, buildDecantContainerLabelHtml } from './buildLabelHtml';
import { printLabels } from './printLabels';
import { getLabelSizePreset, DEFAULT_REQUISITION_LABEL_PRESET_ID, DEFAULT_CONTAINER_LABEL_PRESET_ID } from '@/types/labels/LabelSizePreset';
import { printSettingsService } from '@/services/index';

async function resolveContainerPreset() {
  const res = await printSettingsService.get();
  const presetId = res.ok ? res.data.containerLabelPresetId : DEFAULT_CONTAINER_LABEL_PRESET_ID;
  // Real, honest fallback — a genuinely unknown/stale stored preset id
  // (e.g. from a prior version) never silently produces no label at
  // all; falls back to the real, documented default instead.
  return getLabelSizePreset(presetId) ?? getLabelSizePreset(DEFAULT_CONTAINER_LABEL_PRESET_ID)!;
}

export function printRequisitionLabel(caseData: Case): boolean {
  const preset = getLabelSizePreset(DEFAULT_REQUISITION_LABEL_PRESET_ID)!;
  const html = buildRequisitionLabelHtml(buildRequisitionLabelData(caseData), preset);
  return printLabels([html], preset, `Requisition — ${caseData.accession.fullAccession}`);
}

export async function printContainerLabel(caseData: Case, specimen: Pick<Specimen, 'label' | 'description' | 'blocks'>): Promise<boolean> {
  const preset = await resolveContainerPreset();
  const html = buildContainerLabelHtml(buildContainerLabelData(caseData, specimen), preset);
  return printLabels([html], preset, `Container Label — ${caseData.accession.fullAccession}-${specimen.label}`);
}

export async function printAllContainerLabels(caseData: Case, specimens: Pick<Specimen, 'label' | 'description' | 'blocks'>[]): Promise<boolean> {
  const preset = await resolveContainerPreset();
  const htmlFragments = specimens.map(sp => buildContainerLabelHtml(buildContainerLabelData(caseData, sp), preset));
  return printLabels(htmlFragments, preset, `Container Labels — ${caseData.accession.fullAccession}`);
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
  const preset = await resolveContainerPreset();
  const html = buildDecantContainerLabelHtml(buildDecantContainerLabelData(caseData, specimenLabel, specimenDesc, decant), preset);
  return printLabels([html], preset, `Decant Container Label — ${caseData.accession.fullAccession}-${specimenLabel}${decant.label}`);
}
