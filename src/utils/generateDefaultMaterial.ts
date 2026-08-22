// src/utils/generateDefaultMaterial.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, architectural fix, per direct follow-up's own Hybrid Model:
// "ProtocolPathway drives execution: The pathway definition always
// dictates whether a block or decant entity is instantiated." Extracted
// out of AccessionPage.tsx (where it lived as generateDefaultBlocks,
// then generateDefaultMaterial, a module-private function) into its own,
// standalone module — same real reasoning as resolveMaterialFromScan.ts/
// foreignIdCollision.ts already living here rather than inside a page
// component: a real, pure, testable function shouldn't be trapped inside
// a 2,800-line React component file whose own top-level imports (down
// through services/index.ts) execute browser-only side effects at
// module-load time, making it genuinely untestable in isolation. Found
// directly, via a real, failed test run — not a hypothetical concern.
//
// Real, genuine gap this closes: this function previously ALWAYS
// produced a real HistologyBlock for every pathway, regardless of
// materialKind — completely bypassing Decant even for a real, configured
// fluid/cytology protocol. Now returns both real arrays so the caller
// can assign each to the right field on the new specimen.
// ─────────────────────────────────────────────────────────────────────────────

import { cassetteIdentifier, slideIdentifier, decantIdentifier, decantSlideIdentifier } from '@/types/labels/LabelData';
import { getBlockLabel } from '@/utils/specimenLabeling';
import type { HistologyBlock } from '@/types/case/Specimen';
import type { Decant } from '@/types/case/Material';
import type { Protocol } from '@/services/protocols/IProtocolService';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';
import type { StainType } from '@/services/stains/IStainService';
import type { CasePriority } from '@/services/cases/ICaseService';
import { resolveBlockCassetteColor } from '@/utils/resolveBlockCassetteColor';
import { resolveDecantCassetteColor } from '@/utils/resolveDecantCassetteColor';

// Real fix, per direct follow-up: "Blocks created at Accession time
// don't get a cassette color resolved immediately... the grossing-
// scan hydration step bridges this gap, but it means a block's color
// is only actually correct once it's been scanned at grossing." Now
// resolved right here, at the real moment of creation — the same
// real routing engine (evaluateCassetteRouting.ts) grossing-scan
// hydration already calls, just moved earlier so a newly-accessioned
// block/decant carries its real color from the start. This function
// necessarily became async to do this — its own single real call
// site (AccessionPage.tsx) was already inside an async handler, so
// this cost nothing there beyond one extra await.
export async function generateDefaultMaterial(
  entry: SpecimenEntry | undefined,
  specimenId: string,
  specimenLabelStyle?: 'alpha-specimen' | 'numeric-specimen',
  stainTypes: StainType[] = [],
  protocols: Protocol[] = [],
  // Real feature, per direct follow-up on unique material
  // identification: threaded through so every block/stain generated
  // here can get a real, stored displayId (HistologyBlock.displayId/
  // StainOrder.displayId) at the exact moment Specimen.displayId
  // itself already gets set two lines above this function's own call
  // site — the same real moment, the same real accession context,
  // not a second, later pass.
  fullAccession?: string,
  specimenLabel?: string,
  // Real, deliberate trailing-optional addition (not inserted earlier
  // in the signature) — every existing caller/test keeps compiling
  // unchanged; only the one real call site that actually has a real
  // priority to offer needs to pass it.
  priority?: CasePriority,
): Promise<{ blocks: HistologyBlock[]; decants: Decant[] }> {
  const stainName = (stainTypeId: string) => stainTypes.find(s => s.id === stainTypeId)?.name ?? stainTypeId;
  const blockDisplayId = (blockLabel: string) => fullAccession && specimenLabel ? cassetteIdentifier(fullAccession, specimenLabel, blockLabel) : undefined;
  const stainDisplayId = (blockLabel: string, level: string) => fullAccession && specimenLabel ? slideIdentifier(fullAccession, specimenLabel, blockLabel, level) : undefined;
  // Real, parallel "D1"/"D2" numbering, matching handleAddDecant's
  // own manual-creation convention exactly
  // (SynopticReportPage/hooks/useSpecimenBlockManagement.ts) — a real
  // decant's own label sequence, genuinely independent of the block
  // sequence a mixed protocol might also be generating alongside it.
  const decantLabelFor = (n: number) => `D${n}`;
  const decantDisplayId = (decantLabel: string) => fullAccession && specimenLabel ? decantIdentifier(fullAccession, specimenLabel, decantLabel) : undefined;
  const decantStainDisplayId = (decantLabel: string, level: string) => fullAccession && specimenLabel ? decantSlideIdentifier(fullAccession, specimenLabel, decantLabel, level) : undefined;
  // Resolved from the standalone Protocol dictionary via protocolId —
  // no longer an embedded object on the specimen entry itself. See
  // that field's own doc comment (services/specimenDictionary/specimenTypes.ts) for
  // why: the same protocol record can be mapped from multiple
  // unrelated specimen types, updated once, cascading to all of them.
  const protocol = entry?.protocolId ? protocols.find(p => p.id === entry.protocolId) : undefined;

  // Real, deliberate single resolution — see this function's own,
  // updated header comment. Neither call varies per-pathway (the
  // routing engine's own CassetteRoutingContext has no pathway-level
  // dimension — see resolveBlockCassetteColor.ts's own header), so
  // one resolution up front correctly covers every block/decant this
  // call produces below, rather than re-resolving identically inside
  // the loop. Both real, deliberate no-ops (undefined) when nothing
  // matches — never a fabricated default; a block/decant with no
  // resolved color today still behaves exactly as it always has.
  const cassetteColorId = await resolveBlockCassetteColor({ protocolId: entry?.protocolId, priority });
  const decantCassetteColorId = await resolveDecantCassetteColor('cell_block', { protocolId: entry?.protocolId, priority });

  if (protocol?.pathways?.length) {
    const blocks: HistologyBlock[] = [];
    const decants: Decant[] = [];
    // Real, independent counters — a real, mixed protocol (per direct
    // follow-up's own cited example: a cell-block track alongside a
    // direct-smear/cytospin track) genuinely produces both real
    // kinds from the same specimen at once; each gets its own real,
    // separate numbering, matching how handleAddBlock/handleAddDecant
    // already number them independently everywhere else in this app.
    let blockPathwayIndex = 0;
    let decantCounter = 0;

    protocol.pathways.forEach(pathway => {
      const sortedTasks = [...pathway.tasks].sort((a, b) => a.stepOrder - b.stepOrder);

      if (pathway.materialKind === 'decant') {
        decantCounter += 1;
        const decantLabel = decantLabelFor(decantCounter);
        const stains: Decant['stains'] = [];
        sortedTasks.forEach((task, taskIdx) => {
          task.stainTypeIds.forEach((stainTypeId, stainIdx) => {
            stains.push({
              id: `${specimenId}-DECANT-${decantLabel}-STAIN-${taskIdx}-${stainIdx}`,
              stainName: stainName(stainTypeId),
              status: 'Pending Cut',
              displayId: decantStainDisplayId(decantLabel, `L${stains.length + 1}`),
            });
          });
        });
        decants.push({
          id: `${specimenId}-DECANT-${decantLabel}`,
          label: decantLabel,
          // Real, deliberate mapping — DecantType has no generic
          // "protocol-driven" value; 'cell_block' is the real,
          // closer match for a task/stain-bearing pathway (embedded,
          // processed, sectioned, the same real lifecycle a block
          // has) than 'residual_fluid' (the leftover, not-further-
          // processed portion) would be.
          decantType: 'cell_block',
          stains,
          createdAt: new Date().toISOString(),
          displayId: decantDisplayId(decantLabel),
          cassetteColorId: decantCassetteColorId,
        });
        return;
      }

      const blockLabel = getBlockLabel(blockPathwayIndex, specimenLabelStyle);
      blockPathwayIndex += 1;
      const stains: HistologyBlock['stains'] = [];
      sortedTasks.forEach((task, taskIdx) => {
        task.stainTypeIds.forEach((stainTypeId, stainIdx) => {
          stains.push({
            id: `${specimenId}-BLOCK-${blockLabel}-STAIN-${taskIdx}-${stainIdx}`,
            stainName: stainName(stainTypeId),
            status: 'Pending Cut',
            displayId: stainDisplayId(blockLabel, `L${stains.length + 1}`),
          });
        });
      });
      blocks.push({
        id: `${specimenId}-BLOCK-${blockLabel}`,
        label: blockLabel,
        status: 'Pending',
        stains,
        sourcePathwayName: pathway.pathwayName,
        fixativeType: pathway.fixativeType,
        processingFormat: pathway.processingFormat,
        requiresDecal: pathway.requiresDecal,
        displayId: blockDisplayId(blockLabel),
        cassetteColorId,
      });
    });

    return { blocks, decants };
  }

  const stainNames = entry?.defaultStains?.length ? entry.defaultStains : ['H&E'];
  const blockLabel = getBlockLabel(0, specimenLabelStyle);
  return {
    blocks: [{
      id: `${specimenId}-BLOCK-${blockLabel}`,
      label: blockLabel,
      status: 'Pending',
      stains: stainNames.map((name, i) => ({
        id: `${specimenId}-BLOCK-${blockLabel}-STAIN-${i}`,
        stainName: name,
        status: 'Pending Cut',
        displayId: stainDisplayId(blockLabel, `L${i + 1}`),
      })),
      displayId: blockDisplayId(blockLabel),
      cassetteColorId,
    }],
    decants: [],
  };
}
