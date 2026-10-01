// src/services/hl7/blockExceptionMutation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, extracted pure logic — the exact mutation
// processBlockExceptionEvent.ts already applied inline, pulled out so
// it has zero dependency on HOW the result gets written. No
// caseRouter, no firebase-admin, no IO of any kind — just Case in,
// updated Specimen[] (or null) out. This is what lets the exact same
// business rule run from two genuinely different write paths without
// ever risking the two drifting apart:
//   - processBlockExceptionEvent.ts (frontend, caseRouter.updateCase —
//     still what the Dev Tools "Sim Block Exception" button calls,
//     unchanged from a user's perspective)
//   - api/webhooks/engine/block-exception.ts (backend, Admin SDK via
//     applyEngineCaseUpdate — the real, external Engine's own path)
// ─────────────────────────────────────────────────────────────────────────────

import type { Specimen, HistologyBlock } from '../../types/case/Specimen';
import type { BlockExceptionStatus } from '../../types/events/BlockExceptionEventPayload';

export interface BlockExceptionMutationInput {
  specimenLetter: string;
  blockNumber: string;
  status: BlockExceptionStatus;
  note?: string;
  reportedAt?: string;
  timestamp: string;
}

export interface BlockExceptionMutationResult {
  specimens: Specimen[];
  specimenId: string;
  blockId: string;
}

function findBlock(specimens: Specimen[], specimenLetter: string, blockNumber: string): { specimen: Specimen; block: HistologyBlock } | undefined {
  for (const specimen of specimens) {
    if (specimen.label !== specimenLetter) continue;
    const block = (specimen.blocks ?? []).find(b => b.label === blockNumber);
    if (block) return { specimen, block };
  }
  return undefined;
}

/** Returns the new, full specimens array with the one matching block
 *  updated, or null if no specimen/block matches — same real
 *  distinction processBlockExceptionEvent.ts's own 'block-not-found'
 *  outcome already depended on, now available to any caller. */
export function applyBlockException(specimens: Specimen[], input: BlockExceptionMutationInput): BlockExceptionMutationResult | null {
  const found = findBlock(specimens, input.specimenLetter, input.blockNumber);
  if (!found) return null;

  const { specimen, block } = found;
  const updatedSpecimens = specimens.map(sp =>
    sp.id !== specimen.id ? sp : {
      ...sp,
      blocks: (sp.blocks ?? []).map(b => b.id !== block.id ? b : {
        ...b,
        status: input.status,
        exceptionNote: input.note ?? b.exceptionNote,
        exceptionReportedAt: input.reportedAt ?? input.timestamp,
      }),
    }
  );

  return { specimens: updatedSpecimens, specimenId: specimen.id, blockId: block.id };
}
