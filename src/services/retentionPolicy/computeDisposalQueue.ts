// src/services/retentionPolicy/computeDisposalQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "the client selects the disposal
// tile and the system delivers a list of specimens that qualify for
// disposal... The list should be aware of specimens that are actually
// stored at that laboratory location." A real, computed worklist — not
// something a tech manually assembles (see IBatchService.ts's own
// header for why disposal specifically moved away from the batch/
// container model: "disposal is the only workflow that demands this
// approach, building batches absolutely makes sense for the other
// workflow").
//
// A block/slide qualifies only when ALL of the following are true:
//   1. Its case has been signed out (finalizedAt set) — no real
//      retention clock runs before that.
//   2. No active RetentionHold on that case (types/case/RetentionHold.ts)
//      — always wins, checked first.
//   3. The jurisdiction's own retention period has elapsed
//      (RetentionPolicy.ts's calculateRetentionEligibleDate) — real,
//      full resolution now: Department-level overrides ARE
//      resolved here (Specimen.specimenDictionaryEntryId ->
//      SpecimenEntry.departmentId -> Department.
//      retentionOverrideDays), correcting this module's own earlier,
//      honest scope limitation once that real, existing chain was
//      confirmed traceable.
//   4. Not already disposed (block/slide's own disposedAt is unset).
//   5. Physically at the given facility — resolved via the item's own
//      most recent MaterialLocation (a real station-name string),
//      matched back to a real ScanStation record for its facilityId.
//      An item with no real location history at all is never included
//      — "unknown location" is not the same as "confirmed here."
//
// Real, architectural fix, per direct follow-up: "actually, blocks
// don't generally get disposed of" — confirmed against this app's own,
// already-cited retention figures (RetentionPolicy.ts: blocks 10-30
// years vs slides 8-10 years): blocks were ALREADY treated this way,
// just via a much longer retention window, not a special case. A real
// matrix block gets the identical treatment — evaluated as a real
// 'block'-materialType item using the SAME long window, so it's
// technically included once eligible (consistent with an ordinary
// block) but naturally, correctly rare in practice, never hard-
// excluded as a special case. A matrix block's own real slides
// (MatrixBlock.slides[]) ARE the real, common case here, on the same
// real 'slide' window as an ordinary slide — evaluated per real slide,
// not once for the whole cassette, since each is its own, physically
// independent, disposable object. Both use
// resolveRetentionEligibility.ts's own resolveMostConservativeEligibleDate
// — the MOST conservative (latest) real date across every real
// participant's own, individual retention clock, never the earliest.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { getCurrentJurisdiction } from './RetentionPolicy';
import type { RetainableMaterialType } from './RetentionPolicy';
import { resolveMostConservativeEligibleDate, resolveFacilityIdForLocation } from './resolveRetentionEligibility';
import { cassetteIdentifier, slideIdentifier, matrixBlockIdentifier, matrixSlideIdentifier, specimenIdentifier, decantIdentifier, decantSlideIdentifier } from '@/types/labels/LabelData';
import type { Case } from '@/types/case/Case';
import type { MaterialLocation } from '@/types/case/Material';

export interface DisposalQueueItem {
  /** Composite, real key — caseId + block/slide id — unique across the
   *  whole real queue, since displayId alone could theoretically
   *  collide across older, pre-displayId records. Same real shape
   *  disposeItemByScan.ts builds when matching a scan against this
   *  queue. */
  key: string;
  displayId: string;
  materialType: RetainableMaterialType;
  caseId: string;
  caseAccession: string;
  /** Real, honest plural shape — e.g. "A" for an ordinary block, "A,
   *  B" for a real matrix block shared by two real participants, so
   *  a tech looking at the queue can immediately see when an item
   *  affects more than one specimen's own tissue before an
   *  irreversible action. */
  specimenLabel: string;
  eligibleSince: string;
  lastKnownLocation?: string;
}

/** Real fix, found by this app's own inline-CSS/business-logic sweep:
 *  this used to assume append-order and take the last array element,
 *  the same bug class MaterialTreePanel.tsx's own mostRecentLocation()
 *  header comment already documented and fixed for the tree view — a
 *  late-arriving or backfilled location event should never silently
 *  look current just because it happened to append last. This
 *  compliance-facing disposal queue needs the exact same real
 *  "current location" answer the tree view already shows, so it now
 *  sorts by `at` instead of trusting array order. */
function mostRecentLocation(history: MaterialLocation[] | undefined): MaterialLocation | undefined {
  if (!history || history.length === 0) return undefined;
  return [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

async function evaluateItem(
  c: Case,
  specimenLabels: string[],
  specimenDictionaryEntryIds: (string | undefined)[],
  materialType: RetainableMaterialType,
  /** Real, freshly-computed displayId (cassetteIdentifier/
   *  slideIdentifier/matrixBlockIdentifier/matrixSlideIdentifier) —
   *  the SAME real functions utils/resolveMaterialFromScan.ts itself
   *  calls, not a stored displayId field. Confirmed directly, via
   *  live testing, not assumed: a stored field can genuinely go stale
   *  on older/seeded records, which silently broke matching a queue
   *  entry back against what a real scan resolves to — this queue
   *  and disposeItemByScan.ts must always agree on the same real id
   *  for the same real item. */
  displayId: string,
  id: string,
  locationHistory: MaterialLocation[] | undefined,
  disposedAt: string | undefined,
  facilityId: string | undefined,
): Promise<DisposalQueueItem | null> {
  if (disposedAt) return null;
  if (!c.finalizedAt) return null;
  const activeHold = (c.retentionHolds ?? []).some(h => h.active);
  if (activeHold) return null;

  const jurisdiction = getCurrentJurisdiction();
  const eligibleDate = await resolveMostConservativeEligibleDate(materialType, jurisdiction, c.finalizedAt, specimenDictionaryEntryIds);
  if (!eligibleDate || eligibleDate.getTime() > Date.now()) return null;

  const lastLocation = mostRecentLocation(locationHistory);
  if (facilityId) {
    const itemFacilityId = await resolveFacilityIdForLocation(lastLocation?.location);
    if (itemFacilityId !== facilityId) return null;
  }

  const fullAccession = c.accession?.fullAccession ?? c.id;
  return {
    key: `${c.id}-${id}`,
    displayId,
    materialType,
    caseId: c.id,
    caseAccession: fullAccession,
    specimenLabel: specimenLabels.join(', '),
    eligibleSince: eligibleDate.toISOString(),
    lastKnownLocation: lastLocation?.location,
  };
}

/**
 * Real, computed disposal queue. `facilityId` scopes the result to one
 * real laboratory location (per the spec's own "aware of specimens
 * that are actually stored at that laboratory location") — pass
 * undefined only for a deliberate, unscoped, all-locations view (e.g.
 * a central compliance report), never as a silent default for normal,
 * bench-level disposal work.
 */
export async function computeDisposalQueue(facilityId: string | undefined): Promise<DisposalQueueItem[]> {
  // Real, deliberate choice: bypasses per-user case access control,
  // same real posture as this app's own batch/container scan flows
  // (mockBatchService.ts's own addItemByScan never checks "is this
  // case assigned to me" either) — disposal is a real, facility-level
  // operations task, not a per-user clinical-content access decision.
  const casesRes = await caseRouter.getAll(undefined, { bypassAccessControl: true, includeOrchestration: true });
  if (!casesRes.ok) return [];

  const queue: DisposalQueueItem[] = [];
  for (const c of casesRes.data) {
    const fullAccession = c.accession?.fullAccession ?? c.id;
    for (const specimen of c.specimens ?? []) {
      // Real feature, per direct follow-up: "does disposal queue
      // include container id so specimens can be disposed?" A
      // specimen's own wet tissue, held in its own, real, printed
      // container (barcodePayloadForContainer already matches this
      // same real displayId — confirmed directly before wiring this
      // in) — evaluated once per specimen, on the real 'wet_tissue'
      // window (RetentionPolicy.ts), same real eligibility path as
      // every other material type here. Real, seeded governing-body
      // windows for wet_tissue already existed before this; this was
      // genuinely just the missing queue enumeration.
      const specimenDisplayId = specimenIdentifier(fullAccession, specimen.label);
      const specimenItem = await evaluateItem(
        c, [specimen.label], [specimen.specimenDictionaryEntryId], 'wet_tissue',
        specimenDisplayId, specimen.id, specimen.locationHistory, specimen.disposedAt, facilityId,
      );
      if (specimenItem) queue.push(specimenItem);

      for (const block of specimen.blocks ?? []) {
        const blockDisplayId = cassetteIdentifier(fullAccession, specimen.label, block.label);
        const blockItem = await evaluateItem(
          c, [specimen.label], [specimen.specimenDictionaryEntryId], 'block',
          blockDisplayId, block.id, block.locationHistory, block.disposedAt, facilityId,
        );
        if (blockItem) queue.push(blockItem);

        for (let i = 0; i < (block.stains ?? []).length; i++) {
          const slide = block.stains![i];
          const level = `L${i + 1}`;
          const slideDisplayId = slideIdentifier(fullAccession, specimen.label, block.label, level);
          const slideItem = await evaluateItem(
            c, [specimen.label], [specimen.specimenDictionaryEntryId], 'slide',
            slideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, facilityId,
          );
          if (slideItem) queue.push(slideItem);
        }
      }

      // Real feature, per direct follow-up: "please wire decants for
      // disposal." Same real, parallel treatment as the specimen loop
      // immediately above — a decant's own wet tissue/fluid, held in
      // its own real container, on the same real 'wet_tissue' window.
      // decant.stains[] is the real, physical slides cut FROM that
      // decant (e.g. a cell block sectioned onto glass) — same real
      // StainOrder type, same real 'slide' window, as an ordinary
      // block's own stains immediately above; StainOrder already had
      // disposedAt/disposedBy (built for blocks), so only the queue
      // enumeration was genuinely missing here, not new fields.
      for (const decant of specimen.decants ?? []) {
        const decantDisplayId = decantIdentifier(fullAccession, specimen.label, decant.label);
        const decantItem = await evaluateItem(
          c, [specimen.label], [specimen.specimenDictionaryEntryId], 'wet_tissue',
          decantDisplayId, decant.id, decant.locationHistory, decant.disposedAt, facilityId,
        );
        if (decantItem) queue.push(decantItem);

        for (let i = 0; i < (decant.stains ?? []).length; i++) {
          const slide = decant.stains![i];
          const level = `L${i + 1}`;
          const decantSlideDisplayId = decantSlideIdentifier(fullAccession, specimen.label, decant.label, level);
          const decantSlideItem = await evaluateItem(
            c, [specimen.label], [specimen.specimenDictionaryEntryId], 'slide',
            decantSlideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, facilityId,
          );
          if (decantSlideItem) queue.push(decantSlideItem);
        }
      }
    }

    // Real, architectural fix, per direct follow-up — see this file's
    // own header. A real matrix block's own participants can span
    // multiple real specimens, each with its own, potentially
    // different specimenDictionaryEntryId — resolved via
    // resolveMostConservativeEligibleDate, never a single, arbitrary
    // participant's own override.
    for (const matrixBlock of c.matrixBlocks ?? []) {
      const participantLabels: string[] = [];
      const participantCategoryIds: (string | undefined)[] = [];
      for (const p of matrixBlock.participants) {
        const sp = (c.specimens ?? []).find(s => s.id === p.specimenId);
        participantLabels.push(sp?.label ?? '?');
        participantCategoryIds.push(sp?.specimenDictionaryEntryId);
      }

      const matrixBlockDisplayId = matrixBlockIdentifier(fullAccession, matrixBlock.label);
      const matrixBlockItem = await evaluateItem(
        c, participantLabels, participantCategoryIds, 'block',
        matrixBlockDisplayId, matrixBlock.id, matrixBlock.locationHistory, matrixBlock.disposedAt, facilityId,
      );
      if (matrixBlockItem) queue.push(matrixBlockItem);

      for (let i = 0; i < (matrixBlock.slides ?? []).length; i++) {
        const slide = matrixBlock.slides[i];
        const level = `L${i + 1}`;
        const matrixSlideDisplayId = matrixSlideIdentifier(fullAccession, matrixBlock.label, level);
        const matrixSlideItem = await evaluateItem(
          c, participantLabels, participantCategoryIds, 'slide',
          matrixSlideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, facilityId,
        );
        if (matrixSlideItem) queue.push(matrixSlideItem);
      }
    }
  }
  return queue;
}
