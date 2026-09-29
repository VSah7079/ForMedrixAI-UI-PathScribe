// src/services/participationTypes/countryProfileEditor.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-341 (Batch 335): the rules behind System → Clinical Lookups →
// Country Signing Rules, the platform-level editor for each participation
// type's per-country profile (`jurisdictionProfiles`) and its country
// scope (`scopedJurisdictions`).
//
// Why platform-level: these profiles encode national regulation (NATA,
// RCPath, RCPI, CPSO/RCPSC, MHW, EU member-state acts), so only a platform
// administrator (role 'superadmin', the same role caseAccessControl.ts
// treats as the platform admin) may change them. A single lab's exception
// is the facility override in Participation Types → Edit, which a hospital
// administrator manages (authorityProvenance.ts).
//
// Pure. The save and audit sequencing is in saveCountryProfiles.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '../../types/systemConfig';
import { AUTHORITY_FLAGS, type AuthorityFlag, type ParticipationTypeRecord } from './IParticipationTypeService';

type Profile = NonNullable<NonNullable<ParticipationTypeRecord['jurisdictionProfiles']>[Jurisdiction]>;

/** 'inherit' = no country value; the platform default applies. */
export type FlagChoice = 'inherit' | 'yes' | 'no';

/** 'global' = offered in every country (no scope list); 'offered' /
 *  'notOffered' = a country-scoped role, in or out of this country. */
export type CountryScope = 'global' | 'offered' | 'notOffered';

export interface CountryProfileRow {
  typeId: string;
  /** The platform label: data, shown as stored. */
  typeLabel: string;
  color: string;
  active: boolean;
  scope: CountryScope;
  localTitle: string;
  regulatoryNote: string;
  flags: Record<AuthorityFlag, FlagChoice>;
  /** The platform default each 'inherit' falls back to. */
  platformDefaults: Record<AuthorityFlag, boolean>;
  lastChange?: { userName: string; at: string; reason?: string };
}

export type CountryProfileRefusal = 'NOT_PERMITTED' | 'REASON_REQUIRED' | 'NO_CHANGES' | 'LAST_COUNTRY';

/** Only a platform administrator may change national signing rules. */
export function canEditCountrySigningRules(role: string | undefined): boolean {
  return role === 'superadmin';
}

const toChoice = (v: boolean | undefined): FlagChoice => (v === undefined ? 'inherit' : v ? 'yes' : 'no');
const fromChoice = (c: FlagChoice): boolean | undefined => (c === 'inherit' ? undefined : c === 'yes');

function scopeOf(type: ParticipationTypeRecord, jurisdiction: Jurisdiction): CountryScope {
  if (!type.scopedJurisdictions || type.scopedJurisdictions.length === 0) return 'global';
  return type.scopedJurisdictions.includes(jurisdiction) ? 'offered' : 'notOffered';
}

/** One editable row per participation type, for one country. */
export function buildCountryProfileRows(types: readonly ParticipationTypeRecord[], jurisdiction: Jurisdiction): CountryProfileRow[] {
  return [...types]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(type => {
      const p = type.jurisdictionProfiles?.[jurisdiction];
      return {
        typeId: type.id,
        typeLabel: type.label,
        color: type.color,
        active: type.active,
        scope: scopeOf(type, jurisdiction),
        localTitle: p?.label ?? '',
        regulatoryNote: p?.regulatoryNote ?? '',
        flags: Object.fromEntries(AUTHORITY_FLAGS.map(f => [f, toChoice(p?.[f])])) as Record<AuthorityFlag, FlagChoice>,
        platformDefaults: Object.fromEntries(AUTHORITY_FLAGS.map(f => [f, !!type[f]])) as Record<AuthorityFlag, boolean>,
        ...(p?.updatedBy && p.updatedAt ? { lastChange: { userName: p.updatedBy.userName, at: p.updatedAt, ...(p.changeReason ? { reason: p.changeReason } : {}) } } : {}),
      };
    });
}

/** A country-scoped role that isn't offered here has nothing to edit
 *  until it is offered. Global roles and offered roles are editable. */
export function isCountryRowEditable(row: CountryProfileRow): boolean {
  return row.scope !== 'notOffered';
}

/** Turns a country-scoped role on or off for this country. Global roles
 *  can't be toggled here: making a role country-specific changes every
 *  other country too, so it isn't done from a one-country screen. */
export function toggleCountryOffered(row: CountryProfileRow): CountryProfileRow {
  if (row.scope === 'global') return row;
  return { ...row, scope: row.scope === 'offered' ? 'notOffered' : 'offered' };
}

const sameRow = (a: CountryProfileRow, b: CountryProfileRow) =>
  a.scope === b.scope
  && a.localTitle.trim() === b.localTitle.trim()
  && a.regulatoryNote.trim() === b.regulatoryNote.trim()
  && AUTHORITY_FLAGS.every(f => a.flags[f] === b.flags[f]);

/** Type ids whose row differs from what's stored. */
export function changedCountryRowIds(original: readonly CountryProfileRow[], edited: readonly CountryProfileRow[]): string[] {
  return edited.filter(e => {
    const o = original.find(r => r.typeId === e.typeId);
    return !o || !sameRow(o, e);
  }).map(e => e.typeId);
}

export interface CountryProfileFieldChange {
  field: 'localTitle' | 'regulatoryNote' | 'offered' | AuthorityFlag;
  from: string;
  to: string;
}

export interface CountryProfileChange {
  typeId: string;
  typeLabel: string;
  fields: CountryProfileFieldChange[];
}

export interface CountryProfileUpdate {
  typeId: string;
  changes: Pick<ParticipationTypeRecord, 'jurisdictionProfiles' | 'scopedJurisdictions'>;
}

export type CountryProfilePlan =
  | { ok: true; updates: CountryProfileUpdate[]; changes: CountryProfileChange[] }
  | { ok: false; code: CountryProfileRefusal; typeIds?: string[] };

const flagText = (c: FlagChoice) => (c === 'inherit' ? 'platform default' : c === 'yes' ? 'yes' : 'no');
const quoted = (s: string) => (s.trim() ? `"${s.trim()}"` : '(none)');

/**
 * Turns the edited rows for one country into the record updates to save,
 * plus a change list for the audit log. Refuses:
 *   • NOT_PERMITTED — the actor isn't a platform administrator;
 *   • NO_CHANGES — nothing differs from what's stored;
 *   • REASON_REQUIRED — national rules change only with a stated reason;
 *   • LAST_COUNTRY — removing a country-scoped role's last country would
 *     make it global (an empty scope list means "offered everywhere");
 *     deactivate the role instead.
 * A row left with no title, no note and every flag on the platform default
 * removes that country's profile; the type keeps an (empty) profile map so
 * the seed data is never re-applied over the removal.
 */
export function planCountryProfileSave(input: {
  types: readonly ParticipationTypeRecord[];
  jurisdiction: Jurisdiction;
  original: readonly CountryProfileRow[];
  edited: readonly CountryProfileRow[];
  actor: { userId: string; userName: string; role?: string };
  reason: string;
  nowIso: string;
}): CountryProfilePlan {
  const { types, jurisdiction, original, edited, actor, nowIso } = input;
  if (!canEditCountrySigningRules(actor.role)) return { ok: false, code: 'NOT_PERMITTED' };
  const changedIds = changedCountryRowIds(original, edited);
  if (!changedIds.length) return { ok: false, code: 'NO_CHANGES' };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, code: 'REASON_REQUIRED' };

  const updates: CountryProfileUpdate[] = [];
  const changes: CountryProfileChange[] = [];
  const lastCountry: string[] = [];

  for (const id of changedIds) {
    const type = types.find(t => t.id === id);
    const row = edited.find(r => r.typeId === id)!;
    const before = original.find(r => r.typeId === id);
    if (!type || !before) continue;

    // Scope.
    let scoped = type.scopedJurisdictions;
    if (row.scope !== before.scope && row.scope !== 'global') {
      const rest = (type.scopedJurisdictions ?? []).filter(j => j !== jurisdiction);
      scoped = row.scope === 'offered' ? [...rest, jurisdiction] : rest;
      if (!scoped.length) { lastCountry.push(id); continue; }
    }

    // Profile.
    const profiles = { ...(type.jurisdictionProfiles ?? {}) };
    const empty = !row.localTitle.trim() && !row.regulatoryNote.trim() && AUTHORITY_FLAGS.every(f => row.flags[f] === 'inherit');
    const profileChanged = row.localTitle.trim() !== before.localTitle.trim()
      || row.regulatoryNote.trim() !== before.regulatoryNote.trim()
      || AUTHORITY_FLAGS.some(f => row.flags[f] !== before.flags[f]);
    if (profileChanged) {
      if (empty) {
        delete profiles[jurisdiction];
      } else {
        const next: Profile = {
          ...(row.localTitle.trim() ? { label: row.localTitle.trim() } : {}),
          ...(row.regulatoryNote.trim() ? { regulatoryNote: row.regulatoryNote.trim() } : {}),
          updatedBy: { userId: actor.userId, userName: actor.userName },
          updatedAt: nowIso,
          changeReason: reason,
        };
        for (const f of AUTHORITY_FLAGS) {
          const v = fromChoice(row.flags[f]);
          if (v !== undefined) next[f] = v;
        }
        profiles[jurisdiction] = next;
      }
    }

    const fields: CountryProfileFieldChange[] = [];
    if (row.scope !== before.scope) fields.push({ field: 'offered', from: before.scope === 'offered' ? 'yes' : 'no', to: row.scope === 'offered' ? 'yes' : 'no' });
    if (row.localTitle.trim() !== before.localTitle.trim()) fields.push({ field: 'localTitle', from: quoted(before.localTitle), to: quoted(row.localTitle) });
    for (const f of AUTHORITY_FLAGS) {
      if (row.flags[f] !== before.flags[f]) fields.push({ field: f, from: flagText(before.flags[f]), to: flagText(row.flags[f]) });
    }
    if (row.regulatoryNote.trim() !== before.regulatoryNote.trim()) fields.push({ field: 'regulatoryNote', from: quoted(before.regulatoryNote), to: quoted(row.regulatoryNote) });

    updates.push({ typeId: id, changes: { jurisdictionProfiles: profiles, scopedJurisdictions: scoped } });
    changes.push({ typeId: id, typeLabel: type.label, fields });
  }

  if (lastCountry.length) return { ok: false, code: 'LAST_COUNTRY', typeIds: lastCountry };
  return { ok: true, updates, changes };
}

const FIELD_NAME: Record<CountryProfileFieldChange['field'], string> = {
  offered: 'offered in this country',
  localTitle: 'local title',
  regulatoryNote: 'regulatory basis',
  canFinalize: 'canFinalize',
  requiresCountersign: 'requiresCountersign',
  canViewWholeCase: 'canViewWholeCase',
};

/** Audit-log entry for one type's change in one country. Literal English
 *  (audit records are compliance artifacts); configuration only, no PHI. */
export function buildCountryProfileAuditEntry(change: CountryProfileChange, jurisdiction: Jurisdiction, actorName: string, reason: string) {
  const what = change.fields.map(f => `${FIELD_NAME[f.field]}: ${f.from} → ${f.to}`).join('; ');
  return {
    type: 'user' as const,
    event: 'Signing-authority country profile changed',
    detail: `Participation type "${change.typeLabel}" in ${jurisdiction} — ${what}. Reason: "${reason.trim()}"`,
    user: actorName,
    caseId: null,
    confidence: null,
  };
}

/** Every jurisdiction PathScribe supports, in the order the country
 *  picker shows them (names come from `jurisdictionNames.*`). */
export const COUNTRY_RULE_JURISDICTIONS: readonly Jurisdiction[] = ['US', 'CA', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'AU', 'NZ', 'KR', 'BE', 'NL', 'DE', 'FR'];
