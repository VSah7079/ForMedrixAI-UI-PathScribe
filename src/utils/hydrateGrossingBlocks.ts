// src/utils/hydrateGrossingBlocks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up describing the real grossing-
// station workflow: "Scanning the container at grossing means
// resolving and releasing those pre-created default blocks into
// physical assets... generateDefaultMaterial at Accessioning creates
// the placeholder block records... without resolving color or
// triggering print jobs — the container scan on the SynopticReportPage
// acts as the resolution and execution bridge."
//
// Real, deliberate split from the actual print/engrave dispatch
// (Execution Release, per the same follow-up's own numbered steps) —
// this function ONLY resolves and persists cassette color onto each
// real, still-'Pending' block; it never prints anything itself. Per
// direct confirmation, printing happens only on the PA's own real
// confirm action (or a real, separate auto-release setting), never
// silently as a side effect of hydration alone.
//
// A block only ever gets hydrated once — already-resolved
// (cassetteColorId set) or already-grossed (status !== 'Pending')
// blocks are left untouched, so re-scanning the same container twice
// is always a safe no-op for blocks already handled.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { resolveBlockCassetteColor } from './resolveBlockCassetteColor';
import { resolveProtocolIdForSpecimen } from './resolveProtocolIdForSpecimen';
import type { HistologyBlock } from '@/types/case/Specimen';

export interface HydratedGrossingBlock {
  blockId: string;
  blockLabel: string;
  cassetteColorId?: string;
}

/**
 * Real, top-level entry point — the "Material Hydration & Color
 * Resolution" step. Finds every real, still-'Pending' (placeholder)
 * block on the given specimen, resolves a real cassette color for
 * each via resolveBlockCassetteColor, and persists it onto the real
 * block record. Returns the real, hydrated blocks so a caller (the
 * scan consumer, or the Grossing UI's own "recheck" action) can
 * display them immediately without a second, separate fetch.
 *
 * Returns an empty array — never throws — when the case/specimen
 * can't be found or there's genuinely nothing pending to hydrate.
 */
export async function hydrateGrossingBlocks(caseId: string, specimenId: string): Promise<HydratedGrossingBlock[]> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return [];
  const specimen = caseData.specimens?.find(s => s.id === specimenId);
  if (!specimen) return [];

  const pendingBlocks = (specimen.blocks ?? []).filter(b => b.status === 'Pending' && !b.cassetteColorId);
  if (pendingBlocks.length === 0) return [];

  const specimenProtocolId = await resolveProtocolIdForSpecimen(specimen.specimenDictionaryEntryId);
  const cassetteColorId = await resolveBlockCassetteColor({ protocolId: specimenProtocolId, priority: caseData.order?.priority });

  const pendingBlockIds = new Set(pendingBlocks.map(b => b.id));
  const updatedSpecimens = caseData.specimens?.map(s => s.id !== specimen.id ? s : {
    ...s,
    blocks: (s.blocks ?? []).map((b): HistologyBlock => pendingBlockIds.has(b.id) ? { ...b, cassetteColorId } : b),
  });
  await caseRouter.updateCase(caseId, { specimens: updatedSpecimens });

  return pendingBlocks.map(b => ({ blockId: b.id, blockLabel: b.label, cassetteColorId }));
}
