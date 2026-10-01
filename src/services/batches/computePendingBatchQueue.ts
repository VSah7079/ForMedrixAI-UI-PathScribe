// src/services/batches/computePendingBatchQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow, and the real, direct answer to the batch-loading
// safety question: "Auto-load into a 'pending' queue only — still
// needs a real scan to confirm physical placement in the basket/rack."
//
// Real, confirmed architectural fact this respects (checked directly
// before building): the existing Batch system's own manifest
// (Batch.items[]) only ever grows from a real, physical
// addItemByScan() call — it has no concept of "expected but not yet
// scanned" items pre-populated before any scanning happens. This
// queue is therefore a genuinely new, separate, COMPUTED concept
// (same real "derive it fresh every time, never a separately stored,
// driftable copy" discipline as computeDisposalQueue.ts) — a real
// cassette/slide is "pending" here purely because its own real
// displayId doesn't appear in ANY real, active batch's own manifest
// yet, never because of a separate, stored flag that could drift
// from reality.
//
// Real, honest scope note, corrected per PS-289's own direct request
// to close this gap: a freshly printed cassette has no real
// locationHistory yet (it's sitting on a bench, never scanned
// anywhere), so computeDisposalQueue.ts's own pattern — resolving
// facility from an item's own scan-derived locationHistory — cannot
// be copied verbatim here; every pending item would fail to match
// any given facilityId, since none of them have a location signal
// yet.
//
// Real, direct correction made while building this: Case.facilityId
// was the first field checked, but its own doc comment says it's
// "the institution that sent the specimen" — the REFERRING facility,
// not the performing lab. Using it would have scoped this queue by
// who sent the specimen, not which bench is processing it, which is
// backwards for this real use case. The correct field, confirmed
// directly against resolveCaseAccess()'s own real tenant-scoping
// logic (services/auth/caseAccessControl.ts) and real seed data
// (originHospitalId: 'c-fenwick-general' — the same real id space
// ScanStation.facilityId already uses) is Case.originHospitalId —
// the case's own, required, real performing-enterprise identity.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { mockBatchService } from './mockBatchService';
import { cassetteIdentifier, slideIdentifier } from '@/types/labels/LabelData';
import type { BlockStatus } from '@/types/case/Specimen';

export interface PendingBatchQueueItem {
  key: string;
  displayId: string;
  materialType: 'block' | 'slide';
  caseId: string;
  caseAccession: string;
  specimenLabel: string;
}

/** Real block statuses that mean "physically exists, printed, not yet
 *  disposed/cancelled" — the real, meaningful population for this
 *  queue. 'Pending' (a real, still-unreleased placeholder — see
 *  hydrateGrossingBlocks.ts) is deliberately excluded: nothing has
 *  actually been printed for it yet. */
const PHYSICALLY_EXISTS: ReadonlySet<BlockStatus> = new Set(['Grossed', 'Embedded', 'Exhausted']);

/**
 * Real, computed queue — every real block/slide that physically
 * exists (per PHYSICALLY_EXISTS above) but whose own real displayId
 * doesn't appear in any real, active batch's own manifest yet.
 * `facilityId` scopes the result to one real performing facility's
 * own cases (via Case.originHospitalId — see this file's own header
 * for why that field, not Case.facilityId or scan-derived
 * locationHistory, is the correct signal here); `undefined` returns
 * the same, real "unscoped, all-cases" result this function always
 * returned before this fix.
 */
export async function computePendingBatchQueue(facilityId: string | undefined): Promise<PendingBatchQueueItem[]> {
  const [casesRes, batchesRes] = await Promise.all([
    caseRouter.getAll(undefined, { bypassAccessControl: true, includeOrchestration: true }),
    mockBatchService.getAll(),
  ]);
  if (!casesRes.ok || !batchesRes.ok) return [];

  const batchedDisplayIds = new Set<string>();
  for (const batch of batchesRes.data) {
    if (batch.status !== 'active' && batch.status !== 'reconciling') continue;
    for (const item of batch.items) batchedDisplayIds.add(item.displayId);
  }

  const queue: PendingBatchQueueItem[] = [];
  for (const c of casesRes.data) {
    if (facilityId && c.originHospitalId !== facilityId) continue;
    const fullAccession = c.accession?.fullAccession ?? c.id;
    for (const specimen of c.specimens ?? []) {
      for (const block of specimen.blocks ?? []) {
        if (!PHYSICALLY_EXISTS.has(block.status)) continue;
        const blockDisplayId = cassetteIdentifier(fullAccession, specimen.label, block.label);
        if (!batchedDisplayIds.has(blockDisplayId)) {
          queue.push({
            key: `${c.id}-${block.id}`, displayId: blockDisplayId, materialType: 'block',
            caseId: c.id, caseAccession: fullAccession, specimenLabel: specimen.label,
          });
        }

        for (let i = 0; i < (block.stains ?? []).length; i++) {
          const stain = block.stains[i];
          if (stain.status === 'Pending Cut') continue; // real, not-yet-cut slide — nothing physical exists yet
          const level = `L${i + 1}`;
          const slideDisplayId = slideIdentifier(fullAccession, specimen.label, block.label, level);
          if (!batchedDisplayIds.has(slideDisplayId)) {
            queue.push({
              key: `${c.id}-${stain.id}`, displayId: slideDisplayId, materialType: 'slide',
              caseId: c.id, caseAccession: fullAccession, specimenLabel: specimen.label,
            });
          }
        }
      }
    }
  }
  return queue;
}
