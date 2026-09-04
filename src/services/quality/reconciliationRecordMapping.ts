// src/services/quality/reconciliationRecordMapping.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113, Stage 3. Real, pure, single source of truth for converting a
// real ReconciliationRecord into its generic QaActivityRecord
// equivalent - used by two genuinely different real callers, which is
// exactly why this exists as its own shared function rather than
// inline object-construction duplicated in each:
//   1. DiscordanceReconciliationModal.tsx's real dual-write (a live,
//      just-created record, mapped alongside the still-unchanged real
//      write to the old service).
//   2. The real, historical seed-data migration (mockQaActivityRecordService.ts) -
//      every one of the old service's own real 175 seed records
//      (7 discordant + 130 concordant + 38 teaching-case), mapped
//      through this exact same function, not hand-transcribed - a
//      hand-copy of 175 records risks silent transcription drift a
//      shared, tested function doesn't.
//
// Real, deliberate id/recordedAt preservation: unlike a normal
// create() call (which always generates a fresh id/timestamp), this
// function keeps the SOURCE record's own real id and recordedAt -
// genuinely important for the historical migration, where a stable,
// traceable id between the old and new systems matters during the
// real transition period both are coexisting through. A live dual-
// write from the modal doesn't rely on this - it calls the new
// service's own create(), which generates its own fresh id/
// recordedAt independently, same as any other new record.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReconciliationRecord } from '@/types/quality/ReconciliationRecord';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';

/** Real, stable id of the "Frozen vs Final Correlation" activity type
 *  seeded in mockQaActivityTypeService.ts (Stage 2) - every real
 *  ReconciliationRecord maps onto this same activity type, since that
 *  service currently has exactly one real, live use. */
export const FROZEN_FINAL_ACTIVITY_TYPE_ID = 'qa-activity-frozen-final';

export function mapReconciliationRecordToQaActivityRecord(record: ReconciliationRecord): QaActivityRecord {
  return {
    id: record.id,
    activityTypeId: FROZEN_FINAL_ACTIVITY_TYPE_ID,
    caseId: record.caseId,
    specimenId: record.specimenId,
    caseType: record.caseType,
    subspecialtyId: record.subspecialtyId,

    // Real, activity-specific comparison fields - move from fixed
    // properties on the old type into this activity's own configured
    // fieldValues, matching QaActivityType.ts's own seeded field
    // schema (frozenCategory/finalCategory/frozenDx/finalDx) exactly.
    fieldValues: {
      frozenCategory: record.frozenCategory,
      finalCategory: record.finalCategory,
      frozenDx: record.frozenDx,
      finalDx: record.finalDx,
    },

    // Real, structural archetype fields - carried forward unchanged,
    // present only when the source record actually has them (a
    // concordant record has none of these; TypeScript's own optional-
    // field semantics handle the "absent" case correctly without an
    // explicit undefined assignment).
    outcome: record.outcome,
    delta: record.delta,
    severity: record.severity,
    rootCause: record.rootCause,
    rootCauseNote: record.rootCauseNote,
    escalationRequired: record.escalationRequired,
    comments: record.comments,

    // Real, renamed Teaching & Onboarding fields - see
    // QaActivityRecord.ts's own header for the naming reasoning.
    // draftedBy carried forward unchanged (already neutral).
    draftedBy: record.draftedBy,
    isTeachingOnboardingCase: record.isTeachingCase,
    reviewerFeedback: record.attendingFeedback,

    recordedAt: record.recordedAt,
    recordedBy: record.recordedBy,
  };
}
