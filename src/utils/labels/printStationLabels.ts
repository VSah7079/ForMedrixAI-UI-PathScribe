// src/utils/labels/printStationLabels.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Station barcode label
// generation itself... Right now someone would have to hand-write
// 'STATION:GROSSING-03' on a barcode by some other means." Same real
// build-then-print orchestration as
// printRequisitionAndContainerLabels.ts — buildStationLabelHtml() +
// printLabels(), the same proven window.open()-based print pipeline
// every other real label in this app already uses, not a separate
// one built just for this.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanStation } from '@/services/scanStations/IScanStationService';
import { buildStationLabelHtml } from './buildLabelHtml';
import { printLabels } from './printLabels';
import { getLabelSizePreset } from '@/types/labels/LabelSizePreset';

// Real, deliberate choice: a station label is a permanent, bench-
// taped fixture (not a per-specimen consumable), read from across a
// real bench, not held close — the same real "medium_container"
// preset (3.0in x 2.0in, Code 128) already used for container labels
// large enough to have real room to spare, rather than inventing a
// dedicated new preset size for a single new label kind.
const STATION_LABEL_PRESET_ID = 'medium_container';

export function printStationLabel(station: Pick<ScanStation, 'name' | 'barcodeCode' | 'workflowStage'>): boolean {
  const preset = getLabelSizePreset(STATION_LABEL_PRESET_ID)!;
  const html = buildStationLabelHtml({
    stationName: station.name,
    barcodeCode: station.barcodeCode,
    workflowStage: station.workflowStage,
    printedAt: new Date().toISOString(),
  }, preset);
  return printLabels([html], preset, `Station Label — ${station.name}`);
}

export function printAllStationLabels(stations: Pick<ScanStation, 'name' | 'barcodeCode' | 'workflowStage'>[]): boolean {
  const preset = getLabelSizePreset(STATION_LABEL_PRESET_ID)!;
  const printedAt = new Date().toISOString();
  const htmlFragments = stations.map(s => buildStationLabelHtml({
    stationName: s.name,
    barcodeCode: s.barcodeCode,
    workflowStage: s.workflowStage,
    printedAt,
  }, preset));
  return printLabels(htmlFragments, preset, 'Station Labels');
}
