// src/utils/blockExceptionStates.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up building a full exception-states
// matrix for the grossing bench (STAT/urgent, 0 slides, Consumed/
// Entirely Submitted, Damaged, Lost). One, single, shared source of
// truth for how each state is computed — used by both
// ManageReprintsModal.tsx and MaterialTreePanel.tsx, so the two
// surfaces can never quietly disagree about whether a given block or
// specimen is in one of these states.
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { HistologyBlock, Specimen } from '@/types/case/Specimen';

/** A block's own priority override wins if set; otherwise it inherits
 *  the case's own order.priority — the same real resolution
 *  HeaderBar.tsx's own priority badge already uses. */
export function isUrgent(block: { priority?: string }, caseData: Case): boolean {
  return (block.priority ?? caseData.order.priority) === 'STAT';
}

export function isExhausted(block: Pick<HistologyBlock, 'status'>): boolean {
  return block.status === 'Exhausted';
}

export function isLost(block: Pick<HistologyBlock, 'status'>): boolean {
  return block.status === 'Lost';
}

export function isDamaged(block: Pick<HistologyBlock, 'status'>): boolean {
  return block.status === 'Damaged';
}

/**
 * Real feature, per direct follow-up: "Add a clear badge... directly
 * on the Specimen B tile" for a specimen that's been "entirely
 * submitted" — every real bit of its tissue used up during grossing,
 * nothing left. Deliberately derived from the specimen's own real
 * blocks (every block Exhausted) rather than a new, separate field —
 * Specimen has no field for this at all today, and a derived state
 * can never drift out of sync with the blocks it's actually
 * describing the way a second, independently-set field could.
 * Requires at least one real block — an empty specimen (no blocks
 * grossed yet) is not "entirely submitted," it just hasn't started.
 */
export function isEntirelySubmitted(specimen: Pick<Specimen, 'blocks'>): boolean {
  const blocks = specimen.blocks ?? [];
  return blocks.length > 0 && blocks.every(b => b.status === 'Exhausted');
}

/** "Entirely submitted in blocks B1–B2" — real block labels, not a
 *  generic "all blocks" phrase, so a tech can see at a glance exactly
 *  which cassettes accounted for all the tissue. */
export function entirelySubmittedBlockRangeText(specimen: Pick<Specimen, 'label' | 'blocks'>): string {
  const labels = (specimen.blocks ?? []).map(b => `${specimen.label}${b.label}`);
  if (labels.length === 0) return '';
  if (labels.length === 1) return `Entirely submitted in block ${labels[0]}`;
  return `Entirely submitted in blocks ${labels[0]}–${labels[labels.length - 1]}`;
}
