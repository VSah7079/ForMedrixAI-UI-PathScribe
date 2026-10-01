// src/services/specimenDictionary/buildSpecimenEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turns the Specimen Dictionary editor's draft into the SpecimenEntry that
// gets saved (add or update). Moved out of SpecimenDictionarySection.tsx in
// PS-73 (Batch 317), which also fixed a data-loss bug in it.
//
// The bug: the component rebuilt the entry from a hand-picked field list, and
// updateEntries() REPLACES the stored record. So every save silently dropped
// every field the list left out. Two of those, protocolId and
// specimenCategory, are edited in this very form (the Protocol and Specimen
// Category selects), so changing them in the form did nothing. The others
// (defaultComplexity, microUpgradeBaseCptCode, organSite, isSelfCollected,
// defaultSynopticTemplateId, autoCreated*) were wiped from any entry that
// was edited here. A Duplicate would have lost them all too.
//
// The rule now: start from the stored record (edit) and the draft (every
// field it carries, including ones this form doesn't display), then
// normalize the fields the form edits. A field is only ever dropped when the
// admin clears it.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpecimenEntry } from './specimenTypes';

/** The editor's working copy: the entry's fields plus the two comma-separated text inputs. */
export type SpecimenEntryDraft = Omit<SpecimenEntry, 'id' | 'normalizedLabel' | 'version' | 'updatedBy' | 'updatedAt'> & {
  id?: string;
  normalizedLabel?: string;
  version?: number;
  updatedBy?: string;
  updatedAt?: string;
  synonymsText: string;
  defaultStainsText: string;
};

export interface BuildSpecimenEntryOptions {
  /** ISO timestamp for updatedAt. */
  now: string;
  /** Id for a new entry (add). Ignored when `existing` is given. */
  newId: () => string;
  updatedBy: string;
}

const trimOrUndefined = (v: string | undefined) => v?.trim() || undefined;

export function buildSpecimenEntry(
  draft: SpecimenEntryDraft,
  existing: SpecimenEntry | undefined,
  { now, newId, updatedBy }: BuildSpecimenEntryOptions,
): SpecimenEntry {
  const { synonymsText: _synonymsText, defaultStainsText: _defaultStainsText, ...fields } = draft;
  const name = draft.name.trim();
  return {
    ...existing,
    ...fields,
    id: existing?.id ?? newId(),
    name,
    normalizedLabel: name,
    description: trimOrUndefined(draft.description),
    subspecialty: trimOrUndefined(draft.subspecialty),
    subspecialtyId: draft.subspecialtyId || undefined,
    type: draft.type.trim(),
    procedure: draft.procedure.trim(),
    site: trimOrUndefined(draft.site),
    laterality: draft.laterality || undefined,
    synonyms: draft.synonyms ?? [],
    departmentId: draft.departmentId || undefined,
    protocolId: draft.protocolId || undefined,
    specimenCategory: draft.specimenCategory || undefined,
    requireFixativeTimeBeforeSignout: draft.requireFixativeTimeBeforeSignout || undefined,
    specimenCode: trimOrUndefined(draft.specimenCode),
    defaultStains: draft.defaultStains?.length ? draft.defaultStains : undefined,
    processingNotes: trimOrUndefined(draft.processingNotes),
    defaultBaseCptCode: trimOrUndefined(draft.defaultBaseCptCode),
    version: (existing?.version ?? 0) + 1,
    updatedBy,
    updatedAt: now,
  };
}
