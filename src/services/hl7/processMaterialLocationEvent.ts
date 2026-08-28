// src/services/hl7/processMaterialLocationEvent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, working ingestion for MaterialLocationEventPayload
// (types/events/MaterialLocationEventPayload.ts) — the direct sibling
// of processBlockExceptionEvent.ts, built per direct follow-up: "Is
// there any reason to block Material location and tracking on PS-49?
// I thought we would just let the engine handle the particular
// translation." Confirmed there wasn't — same real pattern, same real
// write path (caseRouter.updateCase()), same deliberate absence of
// any actual vendor HL7 parsing (that's still real interface-engine/
// thin-adapter territory once a field-verified vendor guide exists —
// PS-49 remains the track for that, and for the still-open unique-ID
// question, not a gate on this file existing).
//
// Same real, honest posture as processBlockExceptionEvent.ts:
// idempotent on messageId, every outcome is a distinct, honest
// result, and a concurrency conflict is forced through rather than
// discarded (the real, physical location this event describes already
// happened regardless of a local version conflict).
//
// Real refactor, this session: the actual per-target-level mutation
// logic (all 8 real levels, plus the matrix_block/matrix_slide
// case-level special cases) has been extracted into
// materialLocationMutation.ts — a pure function with zero dependency
// on caseRouter — so the exact same, already-proven business rule can
// also run from a real, external-Engine-facing backend webhook
// (api/webhooks/engine/material-location.ts) without duplicating this
// logic a second time and risking the two drifting apart. This file's
// own real job, unchanged: look up the case, call the pure mutation,
// write the result via caseRouter.updateCase() (still what the Dev
// Tools "Sim Material Location" button calls), and log the audit
// entry — identical behavior to before this refactor.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { ConcurrencyConflictError } from '../cases/ConcurrencyConflictError';
import { mockAuditService } from '../auditlog/mockAuditService';
import { applyMaterialLocation } from './materialLocationMutation';
import type { MaterialLocationEventPayload } from '@/types/events/MaterialLocationEventPayload';

export interface ProcessMaterialLocationEventResult {
  messageId: string;
  outcome: 'applied' | 'already-applied' | 'case-not-found' | 'target-not-found' | 'invalid-payload';
  caseId?: string;
  /** Human-readable description of exactly what was updated, e.g.
   *  "A1-L2" or "Specimen A" — set only when outcome === 'applied'. */
  targetDescription?: string;
  reason?: string;
}

// Same real, minimal in-memory idempotency ledger as
// processBlockExceptionEvent.ts — see that file's own comment for the
// full reasoning.
const processedMessageIds = new Set<string>();

export async function processMaterialLocationEvent(payload: MaterialLocationEventPayload): Promise<ProcessMaterialLocationEventResult> {
  if (processedMessageIds.has(payload.messageId)) {
    return { messageId: payload.messageId, outcome: 'already-applied', reason: 'This messageId was already processed — redelivery treated as a no-op, not a duplicate write.' };
  }

  if (!payload.accessionNumber || !payload.location || !payload.target) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing one or more required fields: accessionNumber, location, target.' };
  }
  // Real, architectural fix, per direct follow-up: specimenLetter is
  // only required for target levels that genuinely belong to one
  // specimen — neither matrix_block nor matrix_slide has such a
  // specimen (see MaterialLocationEventPayload.specimenLetter's own
  // doc comment). Real bug caught via live testing: this check
  // originally only exempted 'matrix_block', silently rejecting every
  // real matrix_slide event as invalid-payload — the resolution side
  // (resolveMaterialFromScan.ts) correctly never returns a
  // specimenLetter for either real, case-level target, but this
  // validation hadn't caught up when matrix_slide was added.
  if (payload.target.level !== 'matrix_block' && payload.target.level !== 'matrix_slide' && !payload.specimenLetter) {
    return { messageId: payload.messageId, outcome: 'invalid-payload', reason: 'Missing required field: specimenLetter.' };
  }

  const lookupId = payload.internalCaseId ?? payload.accessionNumber;
  const caseData = await caseRouter.getCase(lookupId);
  if (!caseData) {
    return { messageId: payload.messageId, outcome: 'case-not-found', reason: `No case found for '${lookupId}'.` };
  }

  const mutation = applyMaterialLocation(caseData.specimens ?? [], caseData.matrixBlocks ?? [], {
    specimenLetter: payload.specimenLetter,
    target: payload.target,
    location: payload.location,
    workflowStage: payload.workflowStage,
    action: payload.action,
    observedAt: payload.observedAt,
    timestamp: payload.timestamp,
    sourceSystem: payload.sourceSystem,
    performedByName: payload.performedByName,
  });

  if (mutation.outcome === 'target-not-found') {
    return { messageId: payload.messageId, outcome: 'target-not-found', reason: `Case ${caseData.id}: ${mutation.reason}` };
  }

  const { result } = mutation;
  const updates = result.level === 'matrix' ? { matrixBlocks: result.matrixBlocks } : { specimens: result.specimens };

  try {
    await caseRouter.updateCase(caseData.id, updates);
  } catch (e) {
    // Real, deliberate "force through" posture — same reasoning as
    // processBlockExceptionEvent.ts's own identical block.
    if (e instanceof ConcurrencyConflictError) {
      await caseRouter.updateCase(caseData.id, updates);
    } else {
      throw e;
    }
  }

  processedMessageIds.add(payload.messageId);

  // Real feature, per direct follow-up: "Are we storing just the last
  // entry, or all the entries?" Real fix, now storing every entry
  // (locationHistory[] — see materialLocationMutation.ts) — but this
  // case-wide audit trail write stays too, per the earlier direct
  // decision to also surface these as part of the existing, shared
  // Audit Log. Same real, single choke point every other audit trail
  // in this app already funnels through (mockAuditService.logEvent()).
  mockAuditService.logEvent({
    type: 'system',
    event: 'Material Location Update',
    detail: `${result.targetDescription} now at "${payload.location}"${payload.action ? ` — ${payload.action}` : ''}${payload.workflowStage ? ` (${payload.workflowStage})` : ''}`,
    user: payload.performedByName ?? payload.sourceSystem,
    caseId: caseData.id,
    confidence: null,
  }).catch(() => {});

  return { messageId: payload.messageId, outcome: 'applied', caseId: caseData.id, targetDescription: result.targetDescription };
}

/** Test-only reset — see processBlockExceptionEvent.ts's own
 *  identical helper for the full reasoning. */
export function _resetMaterialLocationMessageIdsForTests(): void {
  processedMessageIds.clear();
}
