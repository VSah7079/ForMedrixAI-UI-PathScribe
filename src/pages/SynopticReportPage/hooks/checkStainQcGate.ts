// src/pages/SynopticReportPage/hooks/checkStainQcGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289/PS-292's own Gating Strategy — the async "gather the
// real data" half of the gate, paired with resolveStainQcGate.ts's own
// pure "decide, given the data" half (services/batches/). Mirrors
// checkPreAnalyticAndFixativeGates()'s own real, established shape
// (useSignOutWorkflow.ts) — a case in, an array of blocking items out.
//
// Real, honest scope limit, confirmed directly before writing this:
// StainOrder.stainName (types/case/Specimen.ts) is explicitly
// documented as "display name only for this pass — not yet a real
// foreign key into the Stain Dictionary (stainTypeId)... flagged as
// real follow-up work." Without that real FK, a given stain order
// cannot be reliably matched back to its own StainType record, so
// StainType.qcEnforcementMode's own per-stain override (the second
// half of "both — instrument-level default, per-stain override")
// cannot be safely applied here yet — a name-based fuzzy match would
// risk silently misapplying a compliance-critical enforcement mode.
// This gate therefore resolves the effective mode from the batch's
// own WorkstationGroup default ONLY. Once StainOrder gets a real
// stainTypeId, resolveEffectiveQcEnforcementMode() (already built,
// already tested) is ready to take the per-stain value the moment
// it's resolvable — no change needed there, only here.
// ─────────────────────────────────────────────────────────────────────────────

import { mockBatchService } from '@/services/batches/mockBatchService';
import { mockScanStationService } from '@/services/scanStations/mockScanStationService';
import { mockWorkstationGroupService } from '@/services/workstationGroups/mockWorkstationGroupService';
import { resolveStainQcGate, resolveEffectiveQcEnforcementMode } from '@/services/batches/resolveStainQcGate';
import type { StainQcGateStatus } from '@/services/batches/resolveStainQcGate';
import type { QcEnforcementMode } from '@/services/workstationGroups/IWorkstationGroupService';
import { slideIdentifier } from '@/types/labels/LabelData';
import type { Case } from '@/types/case/Case';

export interface StainQcGateBlockingItem {
  specimenId: string;
  specimenLabel: string;
  blockLabel: string;
  stainName: string;
  status: Extract<StainQcGateStatus, 'blocked-failed' | 'blocked-enforced' | 'blocked-hybrid'>;
  batchId: string;
  batchMasterBarcode: string;
}

export async function checkStainQcGate(caseData: Case): Promise<StainQcGateBlockingItem[]> {
  const batchesRes = await mockBatchService.getAll();
  if (!batchesRes.ok) return [];
  const stainingBatches = batchesRes.data.filter(b => b.processingNode === 'Staining');
  if (stainingBatches.length === 0) return [];

  // Real, per-batch, resolved once per batch rather than once per
  // stain — the same batch's own station/group lookup would
  // otherwise repeat needlessly for every slide it contains. A batch
  // itself carries no direct WorkstationGroup reference — it's
  // created at a real ScanStation (Batch.stationId), and THAT
  // station's own workstationGroupId is the real chain to follow.
  const modeByBatchId = new Map<string, QcEnforcementMode | undefined>();
  for (const batch of stainingBatches) {
    if (!batch.stationId) { modeByBatchId.set(batch.id, undefined); continue; }
    const stationRes = await mockScanStationService.getById(batch.stationId);
    if (!stationRes.ok || !stationRes.data.workstationGroupId) { modeByBatchId.set(batch.id, undefined); continue; }
    const groupRes = await mockWorkstationGroupService.getById(stationRes.data.workstationGroupId);
    modeByBatchId.set(batch.id, resolveEffectiveQcEnforcementMode(undefined, groupRes.ok ? groupRes.data.qcEnforcementMode : undefined));
  }

  const blocking: StainQcGateBlockingItem[] = [];

  for (const specimen of caseData.specimens ?? []) {
    for (const block of specimen.blocks ?? []) {
      (block.stains ?? []).forEach((stain, index) => {
        const level = `L${index + 1}`;
        const slideId = slideIdentifier(caseData.accession.fullAccession, specimen.label, block.label, level);
        const batch = stainingBatches.find(b => (b.items ?? []).some(i => i.displayId === slideId));
        if (!batch) return;

        const effectiveMode = modeByBatchId.get(batch.id);
        const status = resolveStainQcGate({
          effectiveMode,
          stainingInstrumentStatus: batch.stainingInstrumentStatus,
          hasVisualReadConfirmation: !!batch.qcVisualReadConfirmation,
        });

        if (status === 'not-applicable' || status === 'clear') return;
        blocking.push({
          specimenId: specimen.id, specimenLabel: specimen.label, blockLabel: block.label,
          stainName: stain.stainName, status, batchId: batch.id, batchMasterBarcode: batch.masterBarcode,
        });
      });
    }
  }

  return blocking;
}
