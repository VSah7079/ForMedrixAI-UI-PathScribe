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
// Real, honest scope note: unlike computeDisposalQueue.ts, this
// queue is NOT facility-scoped — a freshly printed cassette has no
// real locationHistory yet (it's sitting on a bench, never scanned
// anywhere), so there is no real location signal to scope by. A lab
// with multiple physical sites sees one, unscoped list.
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
 * doesn't appear in any real, active batch's own manifest yet. Same
 * real "unscoped, all-cases" posture as computeDisposalQueue.ts's own
 * facilityId=undefined case — see that file for the equivalent,
 * scoped version once a real location signal exists for these items.
 */
export async function computePendingBatchQueue(): Promise<PendingBatchQueueItem[]> {
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
