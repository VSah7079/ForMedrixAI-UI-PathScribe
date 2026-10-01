// src/services/quality/discordanceRecord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 382 (PS-359). The frozen-versus-final reconciliation modal used to
// decide inside the component whether it could save and to build the QA
// activity record itself. This does both:
//   - which fields the record needs comes from the organisation's Field
//     Requirements (reportPageChecks.discordanceMissing), and
//   - the record is built only when none is missing.
//
// A concordant call (final category equals the frozen one) stores only the
// two categories and diagnoses. A discordant one also stores the delta,
// severity, root cause (with its explanation for "Other") and the comment;
// a high severity needs escalation.
//
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

import type { FrozenCategory } from '@/types/intraop/IntraoperativeEntry';
import type { QaActivityRecord, QaDiscordanceDelta, QaDiscordanceRootCause, QaDiscordanceSeverity } from '@/types/quality/QaActivityRecord';
import { FROZEN_FINAL_ACTIVITY_TYPE_ID } from './mockQaActivityTypeService';
import type { ResolvedFieldRequirement } from '../fieldRequirements/fieldRequirementRules';
import { discordanceMissing, discordanceStage, type DiscordanceForm } from '../fieldRequirements/reportPageChecks';

export interface DiscordanceRecordContext {
  caseId: string;
  specimenId: string;
  caseType: string;
  subspecialtyId?: string;
  frozenCategory: FrozenCategory;
  frozenDx: string;
  recordedBy: { userId: string; userName: string };
  /** The resident or fellow whose draft is being reconciled, if any. */
  draftedBy?: { userId: string; userName: string };
}

export interface DiscordanceEntry extends DiscordanceForm {
  /** Feedback for the drafter; only asked for on a teaching case. */
  attendingFeedback: string;
}

/**
 * The record to save, or null while a required field is missing. A teaching
 * case is one drafted by someone other than the person reconciling it.
 */
export function buildDiscordanceRecord(
  context: DiscordanceRecordContext,
  entry: DiscordanceEntry,
  requirements: readonly ResolvedFieldRequirement[],
): Omit<QaActivityRecord, 'id' | 'recordedAt'> | null {
  const stage = discordanceStage(context.frozenCategory, entry.finalCategory);
  if (stage === 'undecided' || discordanceMissing(context.frozenCategory, entry, requirements).length > 0) return null;

  const finalCategory = entry.finalCategory as FrozenCategory;
  const discordant = stage === 'discordant';
  const severity = entry.severity as QaDiscordanceSeverity;
  const isTeachingOnboardingCase = !!context.draftedBy && context.draftedBy.userId !== context.recordedBy.userId;
  return {
    activityTypeId: FROZEN_FINAL_ACTIVITY_TYPE_ID,
    caseId: context.caseId,
    specimenId: context.specimenId,
    caseType: context.caseType,
    subspecialtyId: context.subspecialtyId,
    fieldValues: {
      frozenCategory: context.frozenCategory,
      finalCategory,
      frozenDx: context.frozenDx,
      finalDx: entry.finalDiagnosis.trim(),
    },
    outcome: discordant ? 'discordant' : 'concordant',
    delta: discordant ? (entry.delta as QaDiscordanceDelta) : undefined,
    severity: discordant ? severity : undefined,
    rootCause: discordant ? (entry.rootCause as QaDiscordanceRootCause) : undefined,
    rootCauseNote: discordant ? entry.rootCauseNote.trim() || undefined : undefined,
    escalationRequired: discordant ? severity === 'high' : undefined,
    comments: discordant ? entry.comments.trim() : undefined,
    recordedBy: context.recordedBy,
    draftedBy: context.draftedBy,
    isTeachingOnboardingCase,
    reviewerFeedback: entry.attendingFeedback.trim() || undefined,
  };
}
