// src/utils/labels/dispatchContainerLabelPrint.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Admin Config screen for Container
// Label Management" — printer-IP config now exists (ScanStation.printerIp),
// so this is the real, honest dispatch stub that config feeds into.
//
// Real, deliberate scope, per direct follow-up: "Let's go with OS-level
// printer queue (what's already built)... let's get something into
// Jira so the backend developers can work on the final solution." The
// OS-level print queue (window.print(), already wired in
// NewContainerModal.tsx) remains the real, working production path —
// this stub does NOT attempt a real ZPL/EPL bridge integration (Zebra
// Browser Print, BarTender, etc.); that real, vendor-dependent work is
// tracked separately (PS-51). Same honest-stub discipline as
// dispatchCassetteLabel.ts/dispatchMaterialScanEvent.ts: records the
// real intent (which printer, symbology, size preset) for inspection
// and testing, alongside the real, working browser print — not instead
// of it.
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelBarcodeSymbology } from '@/types/labels/LabelSizePreset';

export interface ContainerLabelPrintRequest {
  masterBarcode: string;
  /** Undefined when the target station has no real printerIp
   *  configured — a genuine, real state (see ScanStation.printerIp's
   *  own doc comment), not an error. Recorded either way so an
   *  inspector can see exactly what would have happened, including
   *  "no real printer was configured for this station." Not currently
   *  used to actually route anywhere (see this file's own header) —
   *  captured now so PS-51's real bridge work has a real field to
   *  read from once it exists. */
  printerIp: string | undefined;
  symbology: LabelBarcodeSymbology;
  labelSizePresetId: string;
}

export interface ContainerLabelPrintDispatchResult {
  dispatched: boolean;
  /** Always 'stub' — see this file's own header for the real,
   *  deliberate scope decision (OS print queue is production; a real
   *  ZPL/EPL bridge is PS-51's own, separate, later work). */
  method: 'stub';
}

const DISPATCHED_LOG: ContainerLabelPrintRequest[] = [];

/**
 * Real, honest record of print intent alongside the real, working
 * window.print() call — never throws, since a logging failure here
 * must never block a tech's own real, working print. See PS-51 for
 * the real, tracked follow-up once a genuine ZPL/EPL bridge is built.
 */
export async function dispatchContainerLabelPrint(
  request: ContainerLabelPrintRequest,
): Promise<ContainerLabelPrintDispatchResult> {
  DISPATCHED_LOG.push(request);
  console.info(
    `[PathScribe] Container label print — OS print queue is the real production path (window.print()); ` +
    `this is a real, honest record alongside it, not a second transport. ${request.masterBarcode} ` +
    `(${request.symbology}, preset ${request.labelSizePresetId})` +
    `${request.printerIp ? ` — station printer on file: ${request.printerIp} (not yet used for routing; see PS-51).` : ' — no printer configured for this station.'}`,
  );
  return { dispatched: true, method: 'stub' };
}

/** Real, dedicated inspection method — for tests, and for PS-51's own
 *  real work to build from once it starts. */
export function getDispatchedContainerLabelPrints(): readonly ContainerLabelPrintRequest[] {
  return DISPATCHED_LOG;
}

/** Test-only reset — same pattern as dispatchCassetteLabel.ts's own
 *  identical helper. */
export function _resetDispatchedContainerLabelPrintsForTests(): void {
  DISPATCHED_LOG.length = 0;
}
