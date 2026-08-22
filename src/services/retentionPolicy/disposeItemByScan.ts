// src/services/retentionPolicy/disposeItemByScan.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "As the user scans each specimen
// container it gets updated to disposed and comes off the list. If the
// scan doesn't match what the system expects, the screen turns red."
//
// Deliberately RE-validates every real check computeDisposalQueue.ts
// itself applies, rather than trusting that a scanned item was still on
// the last-rendered queue — the queue is a real, point-in-time
// snapshot; a hold could have been set, or another tech could have
// already disposed the same item, in the seconds since it was last
// fetched. A stale "it was on the list a moment ago" is not the same
// real guarantee as "it's genuinely eligible right now" — and this is
// the one action in the whole app that's genuinely irreversible.
//
// Real, architectural fix, per direct follow-up: "actually, blocks
// don't generally get disposed of" — same real posture as
// computeDisposalQueue.ts's own identical header note. A real matrix
// block/matrix slide now gets full, real support here — resolved via
// resolveRetentionEligibility.ts's own resolveMostConservativeEligibleDate,
// the MOST conservative (latest) real eligible date across every real
// participant's own, individual retention clock.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveMaterialFromScan } from '@/utils/resolveMaterialFromScan';
import { caseRouter } from '@/services/cases/CaseRouter';
import { mockAuditService } from '@/services/auditlog/mockAuditService';
import { getCurrentJurisdiction } from './RetentionPolicy';
import { resolveMostConservativeEligibleDate, resolveFacilityIdForLocation } from './resolveRetentionEligibility';
import type { HistologyBlock, StainOrder, Specimen } from '@/types/case/Specimen';
import type { MatrixBlock } from '@/types/case/MatrixBlock';
import type { Case } from '@/types/case/Case';
import type { MaterialLocation, Decant } from '@/types/case/Material';

export type DisposeItemOutcome =
  | { outcome: 'disposed'; displayId: string }
  | { outcome: 'rejected'; reason: string };

interface ResolvedTargetRecord {
  disposedAt: string | undefined;
  locationHistory: MaterialLocation[] | undefined;
  /** One label per real participant — a single-element array for an
   *  ordinary block/slide, one per real participant for a matrix
   *  block/slide. */
  specimenLabels: string[];
  specimenDictionaryEntryIds: (string | undefined)[];
}

/** Real, single resolution point — every real participant on a real
 *  matrix block, resolved back to their own real Specimen record. */
function resolveMatrixParticipants(caseData: Case, matrixBlock: MatrixBlock): { labels: string[]; dictionaryEntryIds: (string | undefined)[] } {
  const labels: string[] = [];
  const dictionaryEntryIds: (string | undefined)[] = [];
  for (const p of matrixBlock.participants) {
    const sp = caseData.specimens?.find(s => s.id === p.specimenId);
    labels.push(sp?.label ?? '?');
    dictionaryEntryIds.push(sp?.specimenDictionaryEntryId);
  }
  return { labels, dictionaryEntryIds };
}

/** Real, single scan-to-dispose action — see this file's own header
 *  for why every check is re-run live, not trusted from a cached
 *  queue. `facilityId` — undefined means "no location restriction,"
 *  same real meaning as computeDisposalQueue's own parameter. */
export async function disposeItemByScan(scannedValue: string, facilityId: string | undefined, byUserId: string, byUserName: string): Promise<DisposeItemOutcome> {
  const resolved = await resolveMaterialFromScan(scannedValue);
  if (!resolved) {
    return { outcome: 'rejected', reason: `"${scannedValue}" doesn't match any real cassette or slide on any case.` };
  }
  const { caseData, specimenLetter, target, displayId, fullAccession } = resolved;

  // Real, single resolution point per real target shape — the rest of
  // this function (finalized/hold/eligibility/facility checks, audit
  // log) is genuinely identical regardless of which real kind of
  // material this scan resolved to.
  let record: ResolvedTargetRecord;
  let materialType: 'block' | 'slide' | 'wet_tissue';
  let matrixBlock: MatrixBlock | undefined;
  let matrixSlideIndex: number | undefined;
  let specimen: Specimen | undefined;
  let block: HistologyBlock | undefined;
  let decant: Decant | undefined;

  if (target.level === 'specimen') {
    specimen = caseData.specimens?.find(s => s.label === specimenLetter);
    if (!specimen) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    materialType = 'wet_tissue';
    record = {
      disposedAt: specimen.disposedAt,
      locationHistory: specimen.locationHistory,
      specimenLabels: [specimen.label],
      specimenDictionaryEntryIds: [specimen.specimenDictionaryEntryId],
    };
  } else if (target.level === 'decant' || target.level === 'decant_slide') {
    // Real feature, per direct follow-up: "please wire decants for
    // disposal." Same real, parallel structure as the block/slide
    // branch immediately below — the decant itself is the real
    // 'wet_tissue' item (its own container); decant.stains[] are the
    // real, physical slides cut from it, on the same real 'slide'
    // window as an ordinary block's own stains.
    specimen = caseData.specimens?.find(s => s.label === specimenLetter);
    decant = specimen?.decants?.find(d => d.label === target.decantLabel);
    if (!specimen || !decant) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    const decantSlide = target.level === 'decant_slide' ? decant.stains?.find((_, i) => `L${i + 1}` === target.slideLevel) : undefined;
    if (target.level === 'decant_slide' && !decantSlide) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    materialType = target.level === 'decant' ? 'wet_tissue' : 'slide';
    record = {
      disposedAt: target.level === 'decant' ? decant.disposedAt : decantSlide?.disposedAt,
      locationHistory: target.level === 'decant' ? decant.locationHistory : decantSlide?.locationHistory,
      specimenLabels: [specimen.label],
      specimenDictionaryEntryIds: [specimen.specimenDictionaryEntryId],
    };
  } else if (target.level === 'block' || target.level === 'slide') {
    specimen = caseData.specimens?.find(s => s.label === specimenLetter);
    block = specimen?.blocks?.find(b => b.label === target.blockNumber);
    if (!specimen || !block) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    const slide = target.level === 'slide' ? block.stains?.find((_, i) => `L${i + 1}` === target.slideLevel) : undefined;
    if (target.level === 'slide' && !slide) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    materialType = target.level === 'block' ? 'block' : 'slide';
    record = {
      disposedAt: target.level === 'block' ? block.disposedAt : slide?.disposedAt,
      locationHistory: target.level === 'block' ? block.locationHistory : slide?.locationHistory,
      specimenLabels: [specimen.label],
      specimenDictionaryEntryIds: [specimen.specimenDictionaryEntryId],
    };
  } else {
    // target.level is 'matrix_block' or 'matrix_slide'
    matrixBlock = caseData.matrixBlocks?.find(m => m.id === target.matrixBlockId);
    if (!matrixBlock) {
      return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
    }
    const { labels, dictionaryEntryIds } = resolveMatrixParticipants(caseData, matrixBlock);
    if (target.level === 'matrix_block') {
      materialType = 'block';
      record = {
        disposedAt: matrixBlock.disposedAt,
        locationHistory: matrixBlock.locationHistory,
        specimenLabels: labels,
        specimenDictionaryEntryIds: dictionaryEntryIds,
      };
    } else {
      materialType = 'slide';
      matrixSlideIndex = Number(target.slideLevel.replace(/^L/i, '')) - 1;
      const matrixSlide = (matrixBlock.slides ?? [])[matrixSlideIndex];
      if (!matrixSlide) {
        return { outcome: 'rejected', reason: `${displayId} couldn't be located in its own case record.` };
      }
      record = {
        disposedAt: matrixSlide.disposedAt,
        locationHistory: matrixSlide.locationHistory,
        specimenLabels: labels,
        specimenDictionaryEntryIds: dictionaryEntryIds,
      };
    }
  }

  if (record.disposedAt) {
    return { outcome: 'rejected', reason: `${displayId} was already disposed on ${new Date(record.disposedAt).toLocaleDateString()}.` };
  }

  if (!caseData.finalizedAt) {
    return { outcome: 'rejected', reason: `${displayId}'s case hasn't been signed out yet — no real retention clock has started.` };
  }
  const activeHold = (caseData.retentionHolds ?? []).find(h => h.active);
  if (activeHold) {
    return { outcome: 'rejected', reason: `${displayId} cannot be disposed — this case has an active retention hold: ${activeHold.note}` };
  }

  const jurisdiction = getCurrentJurisdiction();
  const eligibleDate = await resolveMostConservativeEligibleDate(materialType, jurisdiction, caseData.finalizedAt, record.specimenDictionaryEntryIds);
  if (!eligibleDate || eligibleDate.getTime() > Date.now()) {
    return { outcome: 'rejected', reason: `${displayId} isn't retention-eligible for disposal until ${eligibleDate?.toLocaleDateString() ?? 'an unknown date'}.` };
  }

  if (facilityId) {
    const lastLocation = record.locationHistory && record.locationHistory.length > 0 ? record.locationHistory[record.locationHistory.length - 1] : undefined;
    const itemFacilityId = await resolveFacilityIdForLocation(lastLocation?.location);
    if (itemFacilityId !== facilityId) {
      return { outcome: 'rejected', reason: `${displayId}'s last known location isn't at this facility — expected here, not scanned here before.` };
    }
  }

  const nowIso = new Date().toISOString();

  // Real, immutable update — only the one matching real record
  // changes; everything else in the case's own tree is passed through
  // unchanged.
  const updates: Partial<Case> = {};
  if (target.level === 'specimen') {
    updates.specimens = caseData.specimens?.map(s => {
      if (s.label !== specimenLetter) return s;
      return { ...s, disposedAt: nowIso, disposedBy: byUserId };
    });
  } else if (target.level === 'decant' || target.level === 'decant_slide') {
    updates.specimens = caseData.specimens?.map(s => {
      if (s.label !== specimenLetter) return s;
      return {
        ...s,
        decants: s.decants?.map((d): Decant => {
          if (d.label !== decant!.label) return d;
          if (target.level === 'decant') {
            return { ...d, disposedAt: nowIso, disposedBy: byUserId };
          }
          return {
            ...d,
            stains: d.stains?.map((st, i): StainOrder => {
              if (`L${i + 1}` !== target.slideLevel) return st;
              return { ...st, disposedAt: nowIso, disposedBy: byUserId };
            }),
          };
        }),
      };
    });
  } else if (target.level === 'block' || target.level === 'slide') {
    updates.specimens = caseData.specimens?.map(s => {
      if (s.label !== specimenLetter) return s;
      return {
        ...s,
        blocks: s.blocks?.map((b): HistologyBlock => {
          if (b.label !== target.blockNumber) return b;
          if (target.level === 'block') {
            return { ...b, disposedAt: nowIso, disposedBy: byUserId };
          }
          return {
            ...b,
            stains: b.stains?.map((st, i): StainOrder => {
              if (`L${i + 1}` !== target.slideLevel) return st;
              return { ...st, disposedAt: nowIso, disposedBy: byUserId };
            }),
          };
        }),
      };
    });
  } else {
    updates.matrixBlocks = caseData.matrixBlocks?.map((m): MatrixBlock => {
      if (m.id !== matrixBlock!.id) return m;
      if (target.level === 'matrix_block') {
        return { ...m, disposedAt: nowIso, disposedBy: byUserId };
      }
      return {
        ...m,
        slides: (m.slides ?? []).map((s, i): StainOrder => {
          if (i !== matrixSlideIndex) return s;
          return { ...s, disposedAt: nowIso, disposedBy: byUserId };
        }),
      };
    });
  }

  await caseRouter.updateCase(caseData.id, updates);

  mockAuditService.logEvent({
    type: 'system', event: 'Specimen Material Disposed',
    detail: `${displayId} disposed — retention-eligible since ${eligibleDate.toLocaleDateString()}, no active hold, verified at scan.`,
    user: byUserName, caseId: fullAccession, confidence: null,
  }).catch(() => {});

  return { outcome: 'disposed', displayId };
}
