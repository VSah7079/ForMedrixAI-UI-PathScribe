// src/services/participationTypes/countryProfileEditor.test.ts — PS-341 (Batch 335).
import { describe, it, expect, vi } from 'vitest';
import type { ParticipationTypeRecord } from './IParticipationTypeService';
import { JURISDICTION_LABELS } from '../../types/systemConfig';
import { resolveParticipationTypeAuthority, resolveParticipationTypeLabel, isParticipationTypeOfferedIn } from './IParticipationTypeService';
import {
  buildCountryProfileRows, canEditCountrySigningRules, COUNTRY_RULE_JURISDICTIONS, changedCountryRowIds, isCountryRowEditable,
  planCountryProfileSave, toggleCountryOffered, buildCountryProfileAuditEntry,
} from './countryProfileEditor';
import { saveCountryProfilesWithAudit } from './saveCountryProfiles';

const base = (over: Partial<ParticipationTypeRecord>): ParticipationTypeRecord => ({
  id: 'resident', label: 'Resident / Fellow', description: '', color: '#60a5fa', allowsMultiple: true, requiresNote: false,
  active: true, isSystem: true, sortOrder: 2, canFinalize: false, requiresCountersign: true, canViewWholeCase: true, ...over,
});
const resident = base({ jurisdictionProfiles: { GB_EW: { label: 'Trainee Pathologist', regulatoryNote: 'RCPath', canFinalize: false, requiresCountersign: true } } });
const bms = base({ id: 'bms', label: 'Biomedical Scientist (BMS)', sortOrder: 10, scopedJurisdictions: ['GB_EW', 'NL'] });
const ukOnly = base({ id: 'ap_bms', label: 'Advanced Practitioner BMS', sortOrder: 11, scopedJurisdictions: ['GB_EW'] });
const TYPES = [ukOnly, bms, resident];
const admin = { userId: 'u1', userName: 'Platform Admin', role: 'superadmin' };
const NOW = '2026-09-26T12:00:00.000Z';

describe('countryProfileEditor', () => {
  it('the country picker lists every supported jurisdiction once', () => {
    expect([...COUNTRY_RULE_JURISDICTIONS].sort()).toEqual(Object.keys(JURISDICTION_LABELS).sort());
  });

  it('only a platform administrator may edit national rules', () => {
    expect(['superadmin', 'admin', 'pathologist-admin', 'pathologist', undefined].map(canEditCountrySigningRules)).toEqual([true, false, false, false, false]);
  });

  it('builds one row per type for a country, in sort order, with scope and inherited flags', () => {
    const rows = buildCountryProfileRows(TYPES, 'GB_EW');
    expect(rows.map(r => [r.typeId, r.scope, r.localTitle])).toEqual([
      ['resident', 'global', 'Trainee Pathologist'], ['bms', 'offered', ''], ['ap_bms', 'offered', ''],
    ]);
    expect(rows[0].flags).toEqual({ canFinalize: 'no', requiresCountersign: 'yes', canViewWholeCase: 'inherit' });
    expect(rows[0].platformDefaults).toEqual({ canFinalize: false, requiresCountersign: true, canViewWholeCase: true });
    const us = buildCountryProfileRows(TYPES, 'US');
    expect(us.map(r => r.scope)).toEqual(['global', 'notOffered', 'notOffered']);
    expect(isCountryRowEditable(us[1])).toBe(false);
    expect(toggleCountryOffered(us[0])).toBe(us[0]); // a global role can't be toggled here
    expect(toggleCountryOffered(us[1]).scope).toBe('offered');
  });

  it('refuses without permission, without changes, or without a reason', () => {
    const original = buildCountryProfileRows(TYPES, 'GB_EW');
    const edited = original.map(r => r.typeId === 'resident' ? { ...r, localTitle: 'Specialty Registrar (StR)' } : r);
    const plan = (o: object) => planCountryProfileSave({ types: TYPES, jurisdiction: 'GB_EW', original, edited, actor: admin, reason: 'RCPath 2027', nowIso: NOW, ...o });
    expect(plan({ actor: { ...admin, role: 'admin' } })).toEqual({ ok: false, code: 'NOT_PERMITTED' });
    expect(plan({ edited: original })).toEqual({ ok: false, code: 'NO_CHANGES' });
    expect(plan({ reason: '  ' })).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(changedCountryRowIds(original, edited)).toEqual(['resident']);
  });

  it('saves a changed profile with provenance, and the sign-out resolution uses it', () => {
    const original = buildCountryProfileRows(TYPES, 'GB_EW');
    const edited = original.map(r => r.typeId === 'resident'
      ? { ...r, localTitle: 'Specialty Registrar (StR)', flags: { ...r.flags, canFinalize: 'yes' as const, requiresCountersign: 'inherit' as const } }
      : r);
    const plan = planCountryProfileSave({ types: TYPES, jurisdiction: 'GB_EW', original, edited, actor: admin, reason: 'RCPath 2027', nowIso: NOW });
    if (plan.ok === false) throw new Error(plan.code);
    const saved = { ...resident, ...plan.updates[0].changes };
    expect(saved.jurisdictionProfiles!.GB_EW).toEqual({
      label: 'Specialty Registrar (StR)', regulatoryNote: 'RCPath', canFinalize: true,
      updatedBy: { userId: 'u1', userName: 'Platform Admin' }, updatedAt: NOW, changeReason: 'RCPath 2027',
    });
    expect(resolveParticipationTypeAuthority(saved, undefined, 'GB_EW')).toEqual({ canFinalize: true, requiresCountersign: true, canViewWholeCase: true });
    expect(resolveParticipationTypeLabel(saved, 'GB_EW')).toBe('Specialty Registrar (StR)');
    expect(plan.changes[0].fields.map(f => `${f.field}: ${f.from} → ${f.to}`)).toEqual([
      'localTitle: "Trainee Pathologist" → "Specialty Registrar (StR)"', 'canFinalize: no → yes', 'requiresCountersign: yes → platform default',
    ]);
    // Reloaded, the row shows who changed it.
    expect(buildCountryProfileRows([saved], 'GB_EW')[0].lastChange).toEqual({ userName: 'Platform Admin', at: NOW, reason: 'RCPath 2027' });
  });

  it('clearing every field removes the country profile but keeps an empty map, so seed data is not re-applied', () => {
    const original = buildCountryProfileRows([resident], 'GB_EW');
    const edited = original.map(r => ({ ...r, localTitle: '', regulatoryNote: '', flags: { canFinalize: 'inherit' as const, requiresCountersign: 'inherit' as const, canViewWholeCase: 'inherit' as const } }));
    const plan = planCountryProfileSave({ types: [resident], jurisdiction: 'GB_EW', original, edited, actor: admin, reason: 'use platform default', nowIso: NOW });
    if (plan.ok === false) throw new Error(plan.code);
    expect(plan.updates[0].changes.jurisdictionProfiles).toEqual({});
  });

  it('turns a country-scoped role on or off here, but never removes its last country', () => {
    const nl = buildCountryProfileRows(TYPES, 'NL');
    const offBms = nl.map(r => r.typeId === 'bms' ? toggleCountryOffered(r) : r);
    const off = planCountryProfileSave({ types: TYPES, jurisdiction: 'NL', original: nl, edited: offBms, actor: admin, reason: 'not recognised in NL', nowIso: NOW });
    if (off.ok === false) throw new Error(off.code);
    expect(off.updates[0].changes.scopedJurisdictions).toEqual(['GB_EW']);
    expect(isParticipationTypeOfferedIn({ ...bms, ...off.updates[0].changes }, 'NL')).toBe(false);

    const onUs = buildCountryProfileRows(TYPES, 'US').map(r => r.typeId === 'ap_bms' ? toggleCountryOffered(r) : r);
    const on = planCountryProfileSave({ types: TYPES, jurisdiction: 'US', original: buildCountryProfileRows(TYPES, 'US'), edited: onUs, actor: admin, reason: 'pilot', nowIso: NOW });
    if (on.ok === false) throw new Error(on.code);
    expect(on.updates[0].changes.scopedJurisdictions).toEqual(['GB_EW', 'US']);

    const gb = buildCountryProfileRows(TYPES, 'GB_EW');
    const offLast = gb.map(r => r.typeId === 'ap_bms' ? toggleCountryOffered(r) : r);
    expect(planCountryProfileSave({ types: TYPES, jurisdiction: 'GB_EW', original: gb, edited: offLast, actor: admin, reason: 'x', nowIso: NOW }))
      .toEqual({ ok: false, code: 'LAST_COUNTRY', typeIds: ['ap_bms'] });
  });

  it('writes a literal-English audit entry', () => {
    expect(buildCountryProfileAuditEntry(
      { typeId: 'bms', typeLabel: 'Biomedical Scientist (BMS)', fields: [{ field: 'offered', from: 'yes', to: 'no' }] }, 'NL', 'Platform Admin', ' not recognised ',
    )).toEqual({
      type: 'user', event: 'Signing-authority country profile changed', user: 'Platform Admin', caseId: null, confidence: null,
      detail: 'Participation type "Biomedical Scientist (BMS)" in NL — offered in this country: yes → no. Reason: "not recognised"',
    });
  });
});

describe('saveCountryProfilesWithAudit', () => {
  it('saves each changed type, then audits each one; refusals save and audit nothing', async () => {
    const update = vi.fn(async (id: string, changes: Partial<ParticipationTypeRecord>) => ({ ok: true as const, data: { ...resident, id, ...changes } }));
    const logEvent = vi.fn(async () => ({ ok: true as const, data: {} as any }));
    const original = buildCountryProfileRows(TYPES, 'GB_EW');
    const edited = original.map(r => r.typeId === 'resident' ? { ...r, regulatoryNote: 'RCPath 2027 guidance' } : r);
    const deps = { typeService: { update }, auditService: { logEvent } };

    expect(await saveCountryProfilesWithAudit({ types: TYPES, jurisdiction: 'GB_EW', original, edited, actor: { ...admin, role: 'admin' }, reason: 'x' }, deps))
      .toEqual({ ok: false, code: 'NOT_PERMITTED' });
    expect(update).not.toHaveBeenCalled();

    const res = await saveCountryProfilesWithAudit({ types: TYPES, jurisdiction: 'GB_EW', original, edited, actor: admin, reason: 'new guidance', now: () => NOW }, deps);
    expect(res).toEqual({ ok: true, savedTypeIds: ['resident'] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect((logEvent.mock.calls[0] as any)[0].detail).toContain('regulatory basis: "RCPath" → "RCPath 2027 guidance"');
  });

  it('audits only what was saved when a save fails part-way', async () => {
    const update = vi.fn(async (id: string) => (id === 'bms' ? { ok: false as const, error: 'boom' } : { ok: true as const, data: resident }));
    const logEvent = vi.fn(async () => ({ ok: true as const, data: {} as any }));
    const original = buildCountryProfileRows(TYPES, 'GB_EW');
    const edited = original.map(r => r.typeId === 'resident' || r.typeId === 'bms' ? { ...r, localTitle: 'X' } : r);
    const res = await saveCountryProfilesWithAudit({ types: TYPES, jurisdiction: 'GB_EW', original, edited, actor: admin, reason: 'r' }, { typeService: { update }, auditService: { logEvent } });
    expect(res).toMatchObject({ ok: false, code: 'SAVE_FAILED', typeIds: ['bms'] });
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});
