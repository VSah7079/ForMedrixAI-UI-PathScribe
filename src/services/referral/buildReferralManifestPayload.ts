// src/services/referral/buildReferralManifestPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Inter-
// Laboratory Specimen Referral gap. Assembles a real
// ReferralManifestEventPayload from an existing, real 'External
// Referral' Batch — same real, pure-function shape as this app's own
// other buildXxxPayload.ts files.
// ─────────────────────────────────────────────────────────────────────────────

import type { Batch } from '../batches/IBatchService';
import type { ReferralManifestEventPayload } from '@/types/events/ReferralManifestEventPayload';

export function buildReferralManifestPayload(batch: Batch): ReferralManifestEventPayload {
  if (batch.processingNode !== 'External Referral') {
    throw new Error(`buildReferralManifestPayload called on a non-referral batch (${batch.id}, node: ${batch.processingNode})`);
  }
  if (!batch.referralDestinationFacilityId) {
    throw new Error(`Referral batch ${batch.id} has no referralDestinationFacilityId set`);
  }

  return {
    messageId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    batchId: batch.id,
    masterBarcode: batch.masterBarcode,
    destinationFacilityId: batch.referralDestinationFacilityId,
    testRequested: batch.referralTestRequested,
    priority: batch.priority,
    items: batch.items.map(item => ({
      displayId: item.displayId,
      materialType: item.materialType,
      caseAccession: item.caseAccession,
      specimenLabel: item.specimenLabel,
    })),
  };
}
