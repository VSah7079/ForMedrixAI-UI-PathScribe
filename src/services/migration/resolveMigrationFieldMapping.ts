// src/services/migration/resolveMigrationFieldMapping.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, pure function applying a real set of MigrationFieldMapping
// entries to one raw legacy record (a flat string→string bag — the
// real, honest shape a legacy LIS export actually arrives in), to
// build a real MigrationCaseDraft. No lookups, no side effects — a
// fully deterministic, fully testable transform.
// ─────────────────────────────────────────────────────────────────────────────

import type { MigrationFieldMapping } from './IMigrationFieldMappingService';
import type { MigrationCaseDraft } from '@/types/migration/MigrationCaseDraft';

const ARRAY_FIELDS = new Set<keyof MigrationCaseDraft>(['snomedCodes', 'icdOCodes', 'blockIds', 'slideIds']);

export interface MigrationFieldMappingResult {
  draft: MigrationCaseDraft;
  /** Real source fields present in the raw record that no active
   *  mapping covers — surfaced so a real admin can see what's being
   *  silently dropped, rather than data quietly vanishing with no
   *  visible trace. */
  unmappedSourceFields: string[];
}

export function resolveMigrationFieldMapping(
  rawRecord: Record<string, string>,
  mappings: MigrationFieldMapping[],
): MigrationFieldMappingResult {
  const draft: MigrationCaseDraft = {};
  const mappedSourceFields = new Set<string>();

  for (const mapping of mappings) {
    if (!mapping.active) continue;
    const rawValue = rawRecord[mapping.sourceFieldName];
    if (rawValue === undefined || rawValue === '') continue;
    mappedSourceFields.add(mapping.sourceFieldName);

    if (mapping.category === 'synoptic_field') {
      draft.synopticFields = { ...draft.synopticFields, [mapping.targetField]: rawValue };
      continue;
    }

    const key = mapping.targetField as keyof MigrationCaseDraft;
    if (ARRAY_FIELDS.has(key)) {
      const existing = (draft[key] as string[] | undefined) ?? [];
      (draft as any)[key] = [...existing, rawValue];
    } else {
      (draft as any)[key] = rawValue;
    }
  }

  const unmappedSourceFields = Object.keys(rawRecord).filter(k => rawRecord[k] !== '' && !mappedSourceFields.has(k));

  return { draft, unmappedSourceFields };
}
