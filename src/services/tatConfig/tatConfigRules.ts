// src/services/tatConfig/tatConfigRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Decision logic for the TAT / escalation target editor
// (components/Config/System/TATConfigSection.tsx), moved out of the component
// in Batch 317 (PS-73) when Duplicate was added there.
//
// Two bugs fixed in the move:
//   1. Add vs edit was decided by whether an entry was passed in
//      (`isEdit = !!entry`). A duplicate passes one for an ADD, so saving a
//      copy would have overwritten the source. Now keyed off an explicit mode.
//   2. Save always wrote `roleId: null` because the form has no role picker.
//      Editing a seeded per-role target (e.g. Resident sign-out) silently
//      widened it to every role. The draft's roleId is now kept.
// ─────────────────────────────────────────────────────────────────────────────

import type { TATEntry } from '@/types/quality/TatConfigEntry';

export type TatEditorMode = 'add' | 'edit';

/** An active entry with exactly the same scope as `draft` (the six scoping
 *  dimensions + type + urgency). Pass the edited entry's id as `excludeId` in
 *  EDIT mode only; an unsaved entry (add or duplicate) is checked against all. */
export function findTatConflict(entries: TATEntry[], draft: Partial<TATEntry>, excludeId?: string): TATEntry | null {
  return entries.find(e =>
    e.active &&
    e.id !== excludeId &&
    e.type                    === draft.type &&
    e.urgency                 === (draft.urgency ?? null) &&
    e.facilityId              === (draft.facilityId ?? null) &&
    e.performingLabFacilityId === (draft.performingLabFacilityId ?? null) &&
    e.specimenId              === (draft.specimenId ?? null) &&
    e.subspecialtyId          === (draft.subspecialtyId ?? null) &&
    e.roleId                  === (draft.roleId ?? null)
  ) ?? null;
}

export type TatDraftError = 'typeRequired' | 'hoursRequired' | 'conflict';

export type BuildTatEntryResult =
  | { ok: true; entry: TATEntry }
  | { ok: false; error: TatDraftError; conflict?: TATEntry };

/** Validates the draft and builds the entry to save. `existing` is the stored
 *  entry being edited (edit mode only). */
export function buildTatEntry(
  draft: Partial<TATEntry>,
  mode: TatEditorMode,
  existing: TATEntry | undefined,
  entries: TATEntry[],
  { now, newId }: { now: string; newId: () => string },
): BuildTatEntryResult {
  if (!draft.type) return { ok: false, error: 'typeRequired' };
  if (!draft.targetHours || draft.targetHours <= 0) return { ok: false, error: 'hoursRequired' };
  const isEdit = mode === 'edit' && !!existing;
  const conflict = findTatConflict(entries, draft, isEdit ? existing!.id : undefined);
  if (conflict) return { ok: false, error: 'conflict', conflict };
  return {
    ok: true,
    entry: {
      id:                      isEdit ? existing!.id : newId(),
      type:                    draft.type,
      targetHours:             draft.targetHours,
      urgency:                 draft.urgency ?? null,
      facilityId:              draft.facilityId ?? null,
      performingLabFacilityId: draft.performingLabFacilityId ?? null,
      specimenId:              draft.specimenId ?? null,
      subspecialtyId:          draft.subspecialtyId ?? null,
      roleId:                  draft.roleId ?? null,
      active:                  draft.active ?? true,
      notes:                   draft.notes ?? '',
      createdAt:               isEdit ? existing!.createdAt : now,
    },
  };
}
