// src/services/retentionPolicy/computeDisposalReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature — Stain QC Module §2.5 (waste tracking/reporting), the last
// remaining piece of the original module spec (§2.1 Reagent & Solution Lot
// Registry, the Gating Strategy, §2.2/2.3 batch-manifest scanning + automatic
// control-slide appending, the admin qcEnforcementMode override screen, and
// Immunofluorescence control requirements were already built — see this
// folder's own README and services/batches/README.md for that history).
//
// Real, honest scope note, confirmed directly before building anything: the
// original §2.5 spec text ("Disposal Batching & Workflow Execution," "Dynamic
// Regulatory Rules Engine," "Single-Asset Chain-of-Custody Tracking") turned
// out to already be substantially built here in services/retentionPolicy/ —
// just under a different name and via a deliberately different mechanism
// than the spec's own "disposal batches" language:
//   - "Disposal Batching & Workflow Execution" -> computeDisposalQueue.ts
//     (the real, computed eligible-for-disposal worklist) + disposeItemByScan.ts
//     (the real scan-to-verify-and-dispose action) — see IBatchService.ts's own
//     header for why disposal deliberately never uses a manually-created
//     batch/container the way every other processing node does.
//   - "Dynamic Regulatory Rules Engine" -> RetentionPolicy.ts +
//     resolveRetentionEligibility.ts, already resolving retention windows
//     from live, Firestore-backed GoverningBody.retentionDefaults records
//     (not hardcoded) plus per-Department overrides — a rule change is
//     already a data change, not a code release, which is what the spec's
//     own "policy versioning flags" language was actually asking for.
//   - "Single-Asset Chain-of-Custody Tracking" -> disposedAt/disposedBy are
//     already real, immutable, per-item stamps (disposeItemByScan.ts rejects
//     any second scan against an already-disposed item), and
//     mockAuditService already logs a "Specimen Material Disposed" entry per
//     action.
//
// What was genuinely missing — the actual gap this file closes — is the
// "/reporting" half of §2.5: nothing anywhere aggregated those completed
// disposal actions into a browsable, filterable, exportable log for a CAP/
// CLIA/ISO 15189 audit. This is that aggregation, built the same real,
// "derive fresh every time, never a separately stored, driftable copy" way
// as computeDisposalQueue.ts itself — a mirror image of it (disposedAt SET
// instead of unset), not a new, parallel record-keeping store. The
// disposedAt/disposedBy stamp already IS the immutable destruction
// confirmation the spec asks for; this file just makes it reportable.
//
// Known, honest scope limitation, same as computeDisposalQueue.ts's own:
// "eligible since" is recomputed against the CURRENT jurisdiction's live
// retention rules, not whatever rules were actually in force at the moment
// a given item was disposed. Nothing in this app captures a historical
// snapshot of retention policy versions, so a rule that changed after an
// item was disposed will show today's figure on a historical row. Flagged
// here rather than silently guessed at.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { userService } from '@/services';
import { getCurrentJurisdiction } from './RetentionPolicy';
import type { RetainableMaterialType } from './RetentionPolicy';
import { resolveMostConservativeEligibleDate, resolveFacilityIdForLocation } from './resolveRetentionEligibility';
import { cassetteIdentifier, slideIdentifier, matrixBlockIdentifier, matrixSlideIdentifier, specimenIdentifier, decantIdentifier, decantSlideIdentifier } from '@/types/labels/LabelData';
import type { Case } from '@/types/case/Case';
import type { MaterialLocation } from '@/types/case/Material';

export interface DisposalReportRow {
  /** Composite, real key — same shape computeDisposalQueue.ts and
   *  disposeItemByScan.ts already use, unique across the whole report. */
  key: string;
  displayId: string;
  materialType: RetainableMaterialType;
  caseId: string;
  caseAccession: string;
  /** Real, honest plural shape — see computeDisposalQueue.ts's own
   *  identical field for why (a matrix block can span specimens). */
  specimenLabel: string;
  disposedAt: string;
  disposedByUserId: string | undefined;
  /** Resolved once per report run via userService.getAll(), not a
   *  per-row lookup — see the loop below. Falls back to the raw ID
   *  (never a blank cell) when the user record can't be resolved,
   *  e.g. a deactivated/deleted account. */
  disposedByName: string;
  /** Best-effort — the item's own last-known MaterialLocation at the
   *  time of this report run, same real resolution
   *  computeDisposalQueue.ts already uses pre-disposal. Disposal is
   *  terminal, so this is expected to match where the item actually
   *  was disposed. */
  lastKnownLocation?: string;
  /** Recomputed against the CURRENT jurisdiction's live retention
   *  rules — see this file's own header for the honest limitation. */
  eligibleSince?: string;
}

export interface DisposalReportFilters {
  /** Facility to scope the report to. Undefined = every location — a
   *  deliberate, explicit choice for a central compliance report, same
   *  convention as computeDisposalQueue.ts's own facilityId parameter. */
  facilityId?: string;
  materialType?: RetainableMaterialType;
  /** Inclusive, 'YYYY-MM-DD', compared against disposedAt. */
  dateFrom?: string;
  /** Inclusive, 'YYYY-MM-DD', compared against disposedAt. */
  dateTo?: string;
}

/** Real fix, found by this app's own inline-CSS/business-logic sweep:
 *  this used to assume append-order and take the last array element,
 *  the same bug class MaterialTreePanel.tsx's own mostRecentLocation()
 *  header comment already documented and fixed for the tree view — a
 *  late-arriving or backfilled location event should never silently
 *  look current just because it happened to append last. This
 *  compliance-facing disposal report needs the exact same real
 *  "current location" answer the tree view already shows, so it now
 *  sorts by `at` instead of trusting array order. */
function mostRecentLocation(history: MaterialLocation[] | undefined): MaterialLocation | undefined {
  if (!history || history.length === 0) return undefined;
  return [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

function inDateRange(disposedAt: string, dateFrom: string | undefined, dateTo: string | undefined): boolean {
  const disposedDay = disposedAt.slice(0, 10);
  if (dateFrom && disposedDay < dateFrom) return false;
  if (dateTo && disposedDay > dateTo) return false;
  return true;
}

async function evaluateDisposedItem(
  c: Case,
  specimenLabels: string[],
  specimenDictionaryEntryIds: (string | undefined)[],
  materialType: RetainableMaterialType,
  displayId: string,
  id: string,
  locationHistory: MaterialLocation[] | undefined,
  disposedAt: string | undefined,
  disposedBy: string | undefined,
  filters: DisposalReportFilters,
  nameById: Map<string, string>,
): Promise<DisposalReportRow | null> {
  if (!disposedAt) return null;
  if (filters.materialType && filters.materialType !== materialType) return null;
  if (!inDateRange(disposedAt, filters.dateFrom, filters.dateTo)) return null;

  const lastLocation = mostRecentLocation(locationHistory);
  if (filters.facilityId) {
    const itemFacilityId = await resolveFacilityIdForLocation(lastLocation?.location);
    if (itemFacilityId !== filters.facilityId) return null;
  }

  // Best-effort, recomputed against today's live rules — see this
  // file's own header note on why this can drift from the rules
  // actually in force at the moment of disposal.
  let eligibleSince: string | undefined;
  if (c.finalizedAt) {
    const jurisdiction = getCurrentJurisdiction();
    const eligibleDate = await resolveMostConservativeEligibleDate(materialType, jurisdiction, c.finalizedAt, specimenDictionaryEntryIds);
    eligibleSince = eligibleDate?.toISOString();
  }

  const fullAccession = c.accession?.fullAccession ?? c.id;
  return {
    key: `${c.id}-${id}`,
    displayId,
    materialType,
    caseId: c.id,
    caseAccession: fullAccession,
    specimenLabel: specimenLabels.join(', '),
    disposedAt,
    disposedByUserId: disposedBy,
    disposedByName: (disposedBy && nameById.get(disposedBy)) || disposedBy || '—',
    lastKnownLocation: lastLocation?.location,
    eligibleSince,
  };
}

/**
 * Real, computed disposal/waste-tracking report — every block, slide, wet
 * tissue specimen, decant, decant slide, and matrix block/slide that has
 * genuinely been disposed (disposedAt set), across every case, filtered by
 * facility/material type/disposal date range. A mirror image of
 * computeDisposalQueue.ts (which shows the opposite: not-yet-disposed items
 * currently eligible) — see this file's own header for why this is built
 * this way rather than as a separately stored, driftable log.
 */
export async function computeDisposalReport(filters: DisposalReportFilters): Promise<DisposalReportRow[]> {
  // Real, deliberate choice, same posture as computeDisposalQueue.ts's own
  // identical call: a facility-level compliance/operations report, not a
  // per-user clinical-content access decision.
  const casesRes = await caseRouter.getAll(undefined, { bypassAccessControl: true, includeOrchestration: true });
  if (!casesRes.ok) return [];

  const usersRes = await userService.getAll();
  const nameById = new Map<string, string>();
  if (usersRes.ok) {
    for (const u of usersRes.data) {
      nameById.set(u.id, `${u.firstName} ${u.lastName}`.trim());
    }
  }

  const rows: DisposalReportRow[] = [];
  for (const c of casesRes.data) {
    const fullAccession = c.accession?.fullAccession ?? c.id;
    for (const specimen of c.specimens ?? []) {
      const specimenDisplayId = specimenIdentifier(fullAccession, specimen.label);
      const specimenRow = await evaluateDisposedItem(
        c, [specimen.label], [specimen.specimenDictionaryEntryId], 'wet_tissue',
        specimenDisplayId, specimen.id, specimen.locationHistory, specimen.disposedAt, specimen.disposedBy, filters, nameById,
      );
      if (specimenRow) rows.push(specimenRow);

      for (const block of specimen.blocks ?? []) {
        const blockDisplayId = cassetteIdentifier(fullAccession, specimen.label, block.label);
        const blockRow = await evaluateDisposedItem(
          c, [specimen.label], [specimen.specimenDictionaryEntryId], 'block',
          blockDisplayId, block.id, block.locationHistory, block.disposedAt, block.disposedBy, filters, nameById,
        );
        if (blockRow) rows.push(blockRow);

        for (let i = 0; i < (block.stains ?? []).length; i++) {
          const slide = block.stains![i];
          const level = `L${i + 1}`;
          const slideDisplayId = slideIdentifier(fullAccession, specimen.label, block.label, level);
          const slideRow = await evaluateDisposedItem(
            c, [specimen.label], [specimen.specimenDictionaryEntryId], 'slide',
            slideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, slide.disposedBy, filters, nameById,
          );
          if (slideRow) rows.push(slideRow);
        }
      }

      for (const decant of specimen.decants ?? []) {
        const decantDisplayId = decantIdentifier(fullAccession, specimen.label, decant.label);
        const decantRow = await evaluateDisposedItem(
          c, [specimen.label], [specimen.specimenDictionaryEntryId], 'wet_tissue',
          decantDisplayId, decant.id, decant.locationHistory, decant.disposedAt, decant.disposedBy, filters, nameById,
        );
        if (decantRow) rows.push(decantRow);

        for (let i = 0; i < (decant.stains ?? []).length; i++) {
          const slide = decant.stains![i];
          const level = `L${i + 1}`;
          const decantSlideDisplayId = decantSlideIdentifier(fullAccession, specimen.label, decant.label, level);
          const decantSlideRow = await evaluateDisposedItem(
            c, [specimen.label], [specimen.specimenDictionaryEntryId], 'slide',
            decantSlideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, slide.disposedBy, filters, nameById,
          );
          if (decantSlideRow) rows.push(decantSlideRow);
        }
      }
    }

    for (const matrixBlock of c.matrixBlocks ?? []) {
      const participantLabels: string[] = [];
      const participantCategoryIds: (string | undefined)[] = [];
      for (const p of matrixBlock.participants) {
        const sp = (c.specimens ?? []).find(s => s.id === p.specimenId);
        participantLabels.push(sp?.label ?? '?');
        participantCategoryIds.push(sp?.specimenDictionaryEntryId);
      }

      const matrixBlockDisplayId = matrixBlockIdentifier(fullAccession, matrixBlock.label);
      const matrixBlockRow = await evaluateDisposedItem(
        c, participantLabels, participantCategoryIds, 'block',
        matrixBlockDisplayId, matrixBlock.id, matrixBlock.locationHistory, matrixBlock.disposedAt, matrixBlock.disposedBy, filters, nameById,
      );
      if (matrixBlockRow) rows.push(matrixBlockRow);

      for (let i = 0; i < (matrixBlock.slides ?? []).length; i++) {
        const slide = matrixBlock.slides[i];
        const level = `L${i + 1}`;
        const matrixSlideDisplayId = matrixSlideIdentifier(fullAccession, matrixBlock.label, level);
        const matrixSlideRow = await evaluateDisposedItem(
          c, participantLabels, participantCategoryIds, 'slide',
          matrixSlideDisplayId, slide.id, slide.locationHistory, slide.disposedAt, slide.disposedBy, filters, nameById,
        );
        if (matrixSlideRow) rows.push(matrixSlideRow);
      }
    }
  }

  // Most recently disposed first — the natural reading order for a
  // compliance report someone is reviewing today.
  rows.sort((a, b) => b.disposedAt.localeCompare(a.disposedAt));
  return rows;
}
