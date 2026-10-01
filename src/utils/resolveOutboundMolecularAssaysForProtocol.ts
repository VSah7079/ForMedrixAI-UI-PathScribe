// src/utils/resolveOutboundMolecularAssaysForProtocol.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 2b accession trigger: "on case save, reads PathwayTask.
// sendOutboundOrder for the assigned protocol; enqueues a real
// 'order.molecular' entry for each flagged task." Extracted as its
// own, pure, testable function — same real reasoning as
// generateDefaultMaterial.ts's own extraction: genuinely worth
// verifying in isolation (a mixed protocol with several pathways,
// several flagged and unflagged tasks) without driving the whole
// accessioning form to do it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Protocol } from '@/services/protocols/IProtocolService';

/**
 * Returns the deduplicated list of real StainType.id assay codes that
 * should fire an outbound molecular order for this protocol — every
 * PathwayTask across every pathway with sendOutboundOrder === true,
 * flattened across its own stainTypeIds. Returns an empty array
 * (never throws) for an undefined protocol or one with no flagged
 * tasks — the real, common case, since sendOutboundOrder is additive
 * and most protocols don't use it at all.
 */
export function resolveOutboundMolecularAssaysForProtocol(protocol: Protocol | undefined): string[] {
  if (!protocol?.pathways?.length) return [];
  const assayIds = new Set<string>();
  for (const pathway of protocol.pathways) {
    for (const task of pathway.tasks ?? []) {
      if (!task.sendOutboundOrder) continue;
      for (const stainTypeId of task.stainTypeIds ?? []) {
        assayIds.add(stainTypeId);
      }
    }
  }
  return [...assayIds];
}
