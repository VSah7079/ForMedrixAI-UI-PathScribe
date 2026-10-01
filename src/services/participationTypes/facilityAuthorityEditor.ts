// src/services/participationTypes/facilityAuthorityEditor.ts
// ─────────────────────────────────────────────────────────────────────────────
// All decision logic for the Facility-Level Sign-Out Authority editor
// (components/Config/System/TypeModal.tsx), moved out of the component so
// the component only renders and dispatches — standing rule: no business
// logic in components. Pure and synchronous; every rule here is tested
// directly (facilityAuthorityEditor.test.ts) rather than only through
// the UI.
//
// What lives here: which labs a type is shown for, what a newly-enabled
// facility override is seeded from, whether an override has unsaved
// changes or is pending removal, and each flag's resolved value + source.
// ─────────────────────────────────────────────────────────────────────────────

import type { Facility } from '../facilities/IFacilityService';
import type { Jurisdiction } from '../../types/systemConfig';
import {
  AUTHORITY_FLAGS,
  isParticipationTypeOfferedIn,
  type AuthorityFlag,
  type FacilityAuthorityOverride,
  type ParticipationTypeRecord,
} from './IParticipationTypeService';
import { resolveAuthorityWithSource, resolveInheritedAuthority, type ResolvedAuthorityFlag } from './authorityProvenance';

type Overrides = Record<string, FacilityAuthorityOverride> | undefined;

/** The editable slice of a participation type the modal's draft holds. */
export type AuthorityDraft = Pick<ParticipationTypeRecord, AuthorityFlag | 'authorityOverrides' | 'scopedJurisdictions'>;

export interface FacilityAuthorityRow {
  facility: Facility;
  jurisdiction: Jurisdiction | undefined;
  /** A facility override is present in the draft. */
  enabled: boolean;
  /** A stored override exists but the draft has reverted it — removed on save. */
  pendingRemoval: boolean;
  /** The draft's override differs from what's stored (new, or a flag edited). */
  unsaved: boolean;
  resolved: Record<AuthorityFlag, ResolvedAuthorityFlag>;
  /** The jurisdiction's regulatory citation, when its profile has one. */
  regulatoryNote: string | undefined;
}

/**
 * The stored type (which carries jurisdictionProfiles — the draft never
 * does) overlaid with the live, in-progress draft: what resolution must
 * run against so the editor previews exactly what will be enforced.
 */
function overlay(stored: ParticipationTypeRecord | undefined, draft: AuthorityDraft): ParticipationTypeRecord {
  return { ...(stored ?? {}), ...draft } as ParticipationTypeRecord;
}

/**
 * One row per performing lab the editor should show. A country-scoped
 * type lists only labs in its own jurisdictions — plus any lab that
 * already carries an override (stored or in the draft), so existing data
 * is never hidden.
 */
export function buildFacilityAuthorityRows(
  stored: ParticipationTypeRecord | undefined,
  draft: AuthorityDraft,
  facilities: Facility[],
): FacilityAuthorityRow[] {
  const type = overlay(stored, draft);
  return facilities
    .filter(f =>
      isParticipationTypeOfferedIn(type, f.jurisdiction)
      || !!draft.authorityOverrides?.[f.id]
      || !!stored?.authorityOverrides?.[f.id],
    )
    .map(f => {
      const override = draft.authorityOverrides?.[f.id];
      const original = stored?.authorityOverrides?.[f.id];
      return {
        facility: f,
        jurisdiction: f.jurisdiction,
        enabled: !!override,
        pendingRemoval: !override && !!original,
        unsaved: !!override && (!original || AUTHORITY_FLAGS.some(flag => original[flag] !== override[flag])),
        resolved: resolveAuthorityWithSource(type, f.id, f.jurisdiction),
        regulatoryNote: f.jurisdiction ? type.jurisdictionProfiles?.[f.jurisdiction]?.regulatoryNote : undefined,
      };
    });
}

/**
 * The override map after switching a facility's override on or off.
 *
 * On: restoring a just-reverted, still-unsaved override brings back its
 * stored values AND provenance; a brand-new one is seeded from what the
 * facility currently INHERITS (jurisdiction default, else platform
 * default) — so switching it on changes nothing until a flag is
 * deliberately edited. (The old toggle seeded from the raw platform
 * default, which silently dropped a lab's jurisdiction profile.)
 * Off: the entry is removed; an empty map collapses to undefined.
 */
export function toggleFacilityOverride(
  stored: ParticipationTypeRecord | undefined,
  draft: AuthorityDraft,
  facility: Facility,
  enabled: boolean,
): Overrides {
  const next = { ...(draft.authorityOverrides ?? {}) };
  if (enabled) {
    next[facility.id] = stored?.authorityOverrides?.[facility.id]
      ?? resolveInheritedAuthority(overlay(stored, draft), facility.jurisdiction);
  } else {
    delete next[facility.id];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The override map after setting one flag on one facility's override. */
export function setFacilityOverrideFlag(overrides: Overrides, facilityId: string, flag: AuthorityFlag, value: boolean): Overrides {
  return { ...(overrides ?? {}), [facilityId]: { ...(overrides?.[facilityId] ?? {}), [flag]: value } };
}

/** The justification text each stored override starts the editing session with. */
export function initialJustifications(stored: ParticipationTypeRecord | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(stored?.authorityOverrides ?? {}).map(([id, o]) => [id, o.justification ?? '']));
}
