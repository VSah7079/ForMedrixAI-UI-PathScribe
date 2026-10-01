// src/services/spellcheck/spellMenuModel.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-342 (Batch 338): what the right-click menu offers for a flagged word
// (AC5). Pure; the menu component only renders this.
//   • Suggestions, best first (a regional variant's own-convention form
//     leads, from suggestWord).
//   • Ignore — for this session only; nothing is saved.
//   • Add to my dictionary — always.
//   • Add to the facility dictionary — only for the admin-tier roles and
//     only when the case's performing lab is known.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpellIssue } from './spellCascade';
import { canManageFacilityDictionary } from './customDictionaryRules';

export interface SpellMenuModel {
  word: string;
  reason: SpellIssue['reason'];
  /** For a regional variant: this convention's form. */
  preferred?: string;
  suggestions: string[];
  canIgnore: true;
  canAddPersonal: true;
  canAddFacility: boolean;
  facilityLabel?: string;
}

export const MENU_SUGGESTION_LIMIT = 5;

export function buildSpellMenuModel(
  issue: Pick<SpellIssue, 'word' | 'reason' | 'preferred'>,
  suggestions: readonly string[],
  ctx: { role?: string; facilityDictionaryId?: string; facilityDictionaryLabel?: string },
): SpellMenuModel {
  const ordered = [...(issue.preferred ? [issue.preferred] : []), ...suggestions]
    .filter((s, i, all) => s && s !== issue.word && all.indexOf(s) === i)
    .slice(0, MENU_SUGGESTION_LIMIT);
  const canAddFacility = !!ctx.facilityDictionaryId && canManageFacilityDictionary(ctx.role);
  return {
    word: issue.word,
    reason: issue.reason,
    ...(issue.preferred ? { preferred: issue.preferred } : {}),
    suggestions: ordered,
    canIgnore: true,
    canAddPersonal: true,
    canAddFacility,
    ...(canAddFacility && ctx.facilityDictionaryLabel ? { facilityLabel: ctx.facilityDictionaryLabel } : {}),
  };
}
