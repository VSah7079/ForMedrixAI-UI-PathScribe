// src/services/participationTypes/authorityProvenance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Sep 2026) — the human-in-the-loop half of
// jurisdiction-bound signing authority. The three-tier resolution
// (facility override → jurisdiction default → platform default) gives
// legally accurate defaults out of the box; this file is what keeps an
// administrator in full, visible control of the facility tier:
//
//   1. Transparent inheritance — resolveAuthorityWithSource() returns,
//      per flag, not just the active value but WHERE it came from
//      (a facility override with its admin/date/justification, a
//      jurisdiction default with its regulatory citation, or the
//      platform default). No black boxes.
//   2. Break-glass customization — resolveInheritedAuthority() is what
//      an "Override default for this facility" control seeds a new
//      override from, so turning an override ON never itself changes
//      behavior; only the admin's subsequent, deliberate edits do.
//   3. Compliance audit trail — stampFacilityOverrideChanges() diffs the
//      before/after override maps, stamps who/when/why onto every
//      added or changed override, and returns the change list the
//      caller writes to the audit log.
//
// Pure and synchronous throughout — no service calls — so the resolution
// rules are testable directly and can't drift between the admin screen
// and any other surface that shows them.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '../../types/systemConfig';
import type { NewAuditLog } from '../auditlog/IAuditService';
import {
  AUTHORITY_FLAGS,
  resolveParticipationTypeAuthority,
  type AuthorityFlag,
  type FacilityAuthorityOverride,
  type ParticipationTypeRecord,
} from './IParticipationTypeService';

export type AuthoritySource = 'facility' | 'jurisdiction' | 'platform';

export interface ResolvedAuthorityFlag {
  value: boolean | undefined;
  source: AuthoritySource;
  /** source === 'jurisdiction' — the jurisdiction the default came from. */
  jurisdiction?: Jurisdiction;
  /** source === 'jurisdiction' — that jurisdiction's regulatory citation. */
  regulatoryNote?: string;
  /** source === 'facility' — the override's own provenance. */
  overriddenBy?: FacilityAuthorityOverride['overriddenBy'];
  overriddenAt?: string;
  justification?: string;
}

type AuthorityInput = Pick<ParticipationTypeRecord, AuthorityFlag | 'authorityOverrides' | 'jurisdictionProfiles'>;

/**
 * Per flag: the active value AND its source of truth. Same precedence as
 * resolveParticipationTypeAuthority() — kept separate rather than making
 * that (already-shipped, enforcement-critical) function return a richer
 * shape, and tested to agree with it for every combination, so the
 * value an admin sees here is always the value the sign-out gate applies.
 */
export function resolveAuthorityWithSource(
  type: AuthorityInput,
  performingLabFacilityId?: string,
  jurisdiction?: Jurisdiction,
): Record<AuthorityFlag, ResolvedAuthorityFlag> {
  const lab = performingLabFacilityId ? type.authorityOverrides?.[performingLabFacilityId] : undefined;
  const profile = jurisdiction ? type.jurisdictionProfiles?.[jurisdiction] : undefined;
  const out = {} as Record<AuthorityFlag, ResolvedAuthorityFlag>;
  for (const flag of AUTHORITY_FLAGS) {
    if (lab && lab[flag] !== undefined) {
      out[flag] = { value: lab[flag], source: 'facility', overriddenBy: lab.overriddenBy, overriddenAt: lab.overriddenAt, justification: lab.justification };
    } else if (profile && profile[flag] !== undefined) {
      out[flag] = { value: profile[flag], source: 'jurisdiction', jurisdiction, regulatoryNote: profile.regulatoryNote };
    } else {
      out[flag] = { value: type[flag], source: 'platform' };
    }
  }
  return out;
}

/**
 * The value a facility would inherit with NO facility override — its
 * jurisdiction's default, else the platform default. This is what a
 * newly-enabled facility override is seeded from, so switching the
 * override on changes nothing until the admin actually edits a flag.
 *
 * Real bug this replaces: TypeModal.tsx used to seed a new lab override
 * from the type's raw PLATFORM default. Once jurisdiction profiles
 * existed, merely enabling an override at, say, a UK lab would have
 * silently replaced its RCPath-derived values with platform values —
 * changing real sign-out behavior without the admin editing anything.
 */
export function resolveInheritedAuthority(type: AuthorityInput, jurisdiction?: Jurisdiction): Pick<FacilityAuthorityOverride, AuthorityFlag> {
  return resolveParticipationTypeAuthority(type as ParticipationTypeRecord, undefined, jurisdiction);
}

export type FacilityOverrideChangeKind = 'added' | 'changed' | 'removed' | 'justification-updated';

export interface FacilityOverrideChange {
  facilityId: string;
  kind: FacilityOverrideChangeKind;
  /** Only the flags whose value actually changed. Empty for a
   *  justification-only update. */
  flagChanges: { flag: AuthorityFlag; from: boolean | undefined; to: boolean | undefined }[];
  justification?: string;
}

const normalize = (s: string | undefined) => (s ?? '').trim() || undefined;

/**
 * Diffs the before/after facility-override maps. Every added, changed,
 * or re-justified override is stamped with the acting admin and time
 * (and the justification typed for it, if any); an untouched override
 * keeps its original provenance exactly — re-saving a type for some
 * unrelated edit never makes it look like someone re-approved every
 * override on it. Removed overrides are reported (with any
 * justification typed for the removal) so the revert is audited too,
 * even though there's no longer an entry to store it on.
 *
 * `justifications` holds what the admin typed per facility in this
 * editing session; a facility absent from it keeps its stored
 * justification.
 */
export function stampFacilityOverrideChanges(
  before: Record<string, FacilityAuthorityOverride> | undefined,
  after: Record<string, FacilityAuthorityOverride> | undefined,
  justifications: Record<string, string>,
  actor: { userId: string; userName: string },
  nowIso: string,
): { overrides: Record<string, FacilityAuthorityOverride> | undefined; changes: FacilityOverrideChange[] } {
  const prev = before ?? {};
  const next = after ?? {};
  const changes: FacilityOverrideChange[] = [];
  const stamped: Record<string, FacilityAuthorityOverride> = {};

  for (const [facilityId, entry] of Object.entries(next)) {
    const old = prev[facilityId];
    const justification = facilityId in justifications ? normalize(justifications[facilityId]) : normalize(old?.justification ?? entry.justification);
    const flagChanges = AUTHORITY_FLAGS
      .filter(flag => entry[flag] !== old?.[flag])
      .map(flag => ({ flag, from: old?.[flag], to: entry[flag] }));

    let kind: FacilityOverrideChangeKind | null = null;
    if (!old) kind = 'added';
    else if (flagChanges.length > 0) kind = 'changed';
    else if (justification !== normalize(old.justification)) kind = 'justification-updated';

    if (kind) {
      stamped[facilityId] = {
        canFinalize: entry.canFinalize,
        requiresCountersign: entry.requiresCountersign,
        canViewWholeCase: entry.canViewWholeCase,
        overriddenBy: actor,
        overriddenAt: nowIso,
        justification,
      };
      changes.push({ facilityId, kind, flagChanges: kind === 'added' ? AUTHORITY_FLAGS.map(flag => ({ flag, from: undefined, to: entry[flag] })) : flagChanges, justification });
    } else {
      // Untouched — original provenance preserved exactly.
      stamped[facilityId] = { ...old, canFinalize: entry.canFinalize, requiresCountersign: entry.requiresCountersign, canViewWholeCase: entry.canViewWholeCase };
    }
  }

  for (const [facilityId, old] of Object.entries(prev)) {
    if (facilityId in next) continue;
    changes.push({
      facilityId,
      kind: 'removed',
      flagChanges: AUTHORITY_FLAGS.map(flag => ({ flag, from: old[flag], to: undefined })),
      justification: normalize(justifications[facilityId]),
    });
  }

  return { overrides: Object.keys(stamped).length > 0 ? stamped : undefined, changes };
}

const AUDIT_EVENT: Record<FacilityOverrideChangeKind, string> = {
  'added':                 'Signing-authority facility override added',
  'changed':               'Signing-authority facility override changed',
  'removed':               'Signing-authority facility override removed (reverted to inherited default)',
  'justification-updated': 'Signing-authority facility override justification updated',
};

const fmt = (v: boolean | undefined) => (v === undefined ? 'inherited' : String(v));

/**
 * The audit-log entry for one facility-override change — who (the
 * acting admin), when (the audit service's own timestamp), what (every
 * flag that changed, from → to), where (facilityId, so the entry is
 * filterable per facility), and why (the justification, or an explicit
 * "none given" so an auditor can tell an omitted reason apart from a
 * logging gap). Literal English, same as every other audit `detail` in
 * this app (audit records are compliance artifacts, not UI chrome), and
 * PHI-free by construction — only configuration identifiers.
 */
export function buildFacilityOverrideAuditEntry(
  change: FacilityOverrideChange,
  typeLabel: string,
  facilityName: string,
  actorName: string,
): NewAuditLog {
  const flags = change.flagChanges.length > 0
    ? change.flagChanges.map(c => `${c.flag}: ${fmt(c.from)} → ${fmt(c.to)}`).join('; ')
    : 'no flag changes';
  const why = change.justification ? `Justification: "${change.justification}"` : 'Justification: none given';
  return {
    type: 'user',
    event: AUDIT_EVENT[change.kind],
    detail: `Participation type "${typeLabel}" at ${facilityName} — ${flags}. ${why}`,
    user: actorName,
    caseId: null,
    confidence: null,
    facilityId: change.facilityId,
  };
}
