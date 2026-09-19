// src/services/batches/ensureControlSlideAppended.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289/PS-292's own "batch-manifest scanning with
// automatic control-slide appending" piece. Per direct clarification:
// "the active run" a passing control needs to cover is the batch
// itself, not a calendar day or reagent lot spanning multiple
// batches — so this checks and appends per real batch, never reusing
// a control that passed in some earlier, different batch.
//
// Creates a real, synthetic case for the control slide — same real
// "accessioned the exact same real way as any real patient case"
// pattern proficiencyTestContext's own seed data already establishes
// (mockCaseService.ts), a normal-shaped accession carrying clearly-
// synthetic patient content, marked via controlSlideContext
// (Case.ts) as the one real, structural difference — never a
// separate accession format or a non-patient BatchItem shape.
//
// Deliberately does NOT determine or record the control's own
// pass/fail here — per direct decision, that's the same real
// StainQcGate mechanism already built (resolveStainQcGate.ts,
// batch-level stainingInstrumentStatus/qcVisualReadConfirmation).
// This function's only real job is the earlier, setup-time question:
// is a real control for this reagent lot already present in this
// batch's own manifest at all.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { slideIdentifier } from '@/types/labels/LabelData';
import type { Case } from '@/types/case/Case';
import type { ReagentLot } from '../reagentLots/IReagentLotService';
import type { StainType } from '../stains/IStainService';
import type { Batch } from './IBatchService';

let controlSequence = 0;

/** Real — true when this batch's own manifest already carries a real
 *  control-slide item for this same reagent lot (present, regardless
 *  of that control's own pass/fail status, which is a separate,
 *  later gate concern). Checks each real item's own case data
 *  directly for controlSlideContext.reagentLotId — a control case is
 *  a real case like any other, so this is the same real lookup any
 *  other "what does this batch item actually belong to" check would
 *  use, not a separately-maintained index that could drift. */
export async function batchHasControlForLot(batch: Pick<Batch, 'items'>, reagentLotId: string): Promise<boolean> {
  for (const item of batch.items ?? []) {
    const itemCase = await caseRouter.getCase(item.caseAccession);
    if (itemCase?.controlSlideContext?.reagentLotId === reagentLotId) return true;
  }
  return false;
}

/** Real — creates one new, synthetic control case for a real reagent
 *  lot + stain, and returns the real cassette id to add as this
 *  batch's own new item. Never creates a second control case for a
 *  lot already represented in the SAME batch — callers check
 *  batchHasControlForLot first. */
export async function createControlSlideCase(reagentLot: ReagentLot, stainType: StainType, facilityId: string): Promise<{ caseData: Case; slideId: string }> {
  controlSequence += 1;
  const year = new Date().getFullYear() % 100;
  const accessionNumber = `CTRL${String(controlSequence).padStart(4, '0')}`;
  const fullAccession = `S${year}-${accessionNumber}-CTL-001`;
  const id = fullAccession;

  const caseData: Case = {
    id,
    accession: { accessionNumber, accessionPrefix: 'S', accessionYear: 2000 + year, fullAccession },
    controlSlideContext: { reagentLotId: reagentLot.id, stainTypeId: stainType.id },
    originHospitalId: facilityId,
    patient: {
      id: `PAT-CTRL-${accessionNumber}`, mrn: `CTRL-SYNTH-${accessionNumber}`,
      firstName: `QC Control (${stainType.name})`, lastName: `Lot ${reagentLot.lotNumber}`,
      dateOfBirth: '2000-01-01', sex: 'U',
    },
    status: 'in-progress',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    participants: [], synopticReports: [],
    order: { priority: 'Routine' },
    specimens: [{
      id: `${id}-SP-A`, label: 'A', description: `${stainType.name} positive control${stainType.defaultControlTissueType ? ` \u2014 ${stainType.defaultControlTissueType}` : ''}`,
      blocks: [{ id: `${id}-BLK-1`, label: '1', status: 'Cut & Placed', stains: [{ id: `${id}-ST-0`, stainName: stainType.name, status: 'Cut & Placed' }] }],
    }],
  } as unknown as Case;

  await caseRouter.createCase(caseData);
  return { caseData, slideId: slideIdentifier(fullAccession, 'A', '1', 'L1') };
}
