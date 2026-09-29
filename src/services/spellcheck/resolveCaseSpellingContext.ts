// src/services/spellcheck/resolveCaseSpellingContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): everything the report screens need to spell-check one
// case, resolved in one place:
//   • the spelling language (resolveSpellingLocale: the case's own choice →
//     the assigned pathologist's profile preference → the ordering
//     facility's jurisdiction → en-US);
//   • the facility dictionary it uses: the case's performing lab (the lab
//     whose pathologists write the report and own its local shorthand).
// Dependencies are injected so it is tested without module mocks; it never
// rejects (a failed lookup falls back to the next tier).
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';
import { resolveSpellingLocale, type ResolvedSpellingLocale } from './resolveSpellingLocale';
import type { CustomWords } from './spellEngine';
import type { CustomWordEntry } from './customDictionaryRules';

export interface CaseSpellingInput {
  orderingFacilityId?: string | null;
  /** The case's assigned pathologist (order.assignedTo). */
  assignedPathologistId?: string | null;
  /** The per-case choice (Case.spellingLocaleOverride). */
  caseOverride?: string | null;
}

export interface CaseSpellingContext extends ResolvedSpellingLocale {
  /** Performing lab whose facility dictionary applies; undefined when unknown. */
  facilityDictionaryId?: string;
  facilityDictionaryLabel?: string;
}

export interface CaseSpellingDeps {
  getFacility(id: string): Promise<{ id: string; name?: string; jurisdiction?: Jurisdiction } | null>;
  getPerformingLabId(orderingFacilityId: string): Promise<string | undefined>;
  getStaffSpellingPreference(staffId: string): Promise<string | null | undefined>;
}

const quiet = async <T>(p: Promise<T>): Promise<T | undefined> => { try { return await p; } catch { return undefined; } };

export async function resolveCaseSpellingContext(input: CaseSpellingInput, deps: CaseSpellingDeps): Promise<CaseSpellingContext> {
  const ordering = input.orderingFacilityId ? await quiet(deps.getFacility(input.orderingFacilityId)) : undefined;
  const preference = input.assignedPathologistId ? await quiet(deps.getStaffSpellingPreference(input.assignedPathologistId)) : undefined;
  const resolved = resolveSpellingLocale({
    caseOverride: input.caseOverride,
    pathologistPreference: preference,
    facilityJurisdiction: ordering?.jurisdiction,
  });

  const labId = input.orderingFacilityId ? await quiet(deps.getPerformingLabId(input.orderingFacilityId)) : undefined;
  if (!labId) return resolved;
  const lab = labId === ordering?.id ? ordering : await quiet(deps.getFacility(labId));
  return { ...resolved, facilityDictionaryId: labId, facilityDictionaryLabel: lab?.name ?? labId };
}

/** The word lists sent to the checker: personal words plus words ignored
 *  in this session (never saved), and the facility's words. */
export function customWordsFor(personal: readonly CustomWordEntry[], facility: readonly CustomWordEntry[], ignored: Iterable<string>): CustomWords {
  return {
    personal: [...personal.map(e => e.word), ...ignored],
    facility: facility.map(e => e.word),
  };
}
