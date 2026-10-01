// src/services/participationTypes/participationTypeJurisdiction.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real coverage for jurisdiction-bound signing authority (per Pete's own
// per-country role data, Sep 2026): the three-tier resolution order
// (lab override → jurisdiction profile → platform default), the
// jurisdiction-aware label, country-scoped regional roles, the real
// seeded per-country content, and the non-destructive upgrade of an
// already-persisted type list.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  resolveParticipationTypeAuthority,
  resolveParticipationTypeLabel,
  isParticipationTypeOfferedIn,
  resolveCaseTeamParticipationTypes,
  type ParticipationTypeRecord,
} from './IParticipationTypeService';
import { mockParticipationTypeService, mergeSeedJurisdictionData } from './mockParticipationTypeService';
import type { Jurisdiction } from '../../types/systemConfig';

const base: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident / Fellow', description: '', color: '#000',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
};

describe('resolveParticipationTypeAuthority — lab override → jurisdiction profile → platform default', () => {
  it('no lab and no jurisdiction resolves to the platform default, unchanged from before either mechanism existed', () => {
    expect(resolveParticipationTypeAuthority(base)).toEqual({ canFinalize: false, requiresCountersign: true, canViewWholeCase: true });
  });

  it('a jurisdiction profile applies when there is no lab override', () => {
    const t = { ...base, jurisdictionProfiles: { AU: { canFinalize: true } } };
    expect(resolveParticipationTypeAuthority(t, undefined, 'AU').canFinalize).toBe(true);
  });

  it('a jurisdiction profile applies ONLY to its own jurisdiction', () => {
    const t = { ...base, jurisdictionProfiles: { AU: { canFinalize: true } } };
    expect(resolveParticipationTypeAuthority(t, undefined, 'NZ').canFinalize).toBe(false);
    expect(resolveParticipationTypeAuthority(t).canFinalize).toBe(false);
  });

  it('resolves field-by-field — a profile overriding one flag leaves the others at the platform default', () => {
    const t = { ...base, jurisdictionProfiles: { AU: { canFinalize: true } } };
    expect(resolveParticipationTypeAuthority(t, undefined, 'AU')).toEqual({ canFinalize: true, requiresCountersign: true, canViewWholeCase: true });
  });

  it('a facility-level override beats its own country\'s profile — a genuine lab-level exception wins', () => {
    const t = {
      ...base,
      jurisdictionProfiles: { GB_EW: { canFinalize: false, requiresCountersign: true } },
      authorityOverrides: { 'fac-uk-lab': { canFinalize: true } },
    };
    const r = resolveParticipationTypeAuthority(t, 'fac-uk-lab', 'GB_EW');
    expect(r.canFinalize).toBe(true);               // lab exception wins
    expect(r.requiresCountersign).toBe(true);       // falls through to the country profile
  });

  it('a different lab in the same country still gets the country profile, not another lab\'s exception', () => {
    const t = {
      ...base,
      jurisdictionProfiles: { GB_EW: { canFinalize: false } },
      authorityOverrides: { 'fac-uk-lab': { canFinalize: true } },
    };
    expect(resolveParticipationTypeAuthority(t, 'fac-other-uk-lab', 'GB_EW').canFinalize).toBe(false);
  });

  it('a lab override field left unset falls through to the jurisdiction profile, not straight to the platform default', () => {
    const t = {
      ...base,
      jurisdictionProfiles: { CA: { requiresCountersign: false } },
      authorityOverrides: { 'fac-ca-lab': { canViewWholeCase: false } },
    };
    const r = resolveParticipationTypeAuthority(t, 'fac-ca-lab', 'CA');
    expect(r.requiresCountersign).toBe(false);
    expect(r.canViewWholeCase).toBe(false);
  });
});

describe('resolveParticipationTypeLabel', () => {
  it('uses the jurisdiction\'s real local title where recorded', () => {
    const t = { ...base, jurisdictionProfiles: { KR: { label: 'Resident (Jeon-gong-ui)' } } };
    expect(resolveParticipationTypeLabel(t, 'KR')).toBe('Resident (Jeon-gong-ui)');
  });

  it('falls back to the platform label with no jurisdiction, or one with no recorded title', () => {
    const t = { ...base, jurisdictionProfiles: { KR: { canFinalize: false } } };
    expect(resolveParticipationTypeLabel(t)).toBe('Resident / Fellow');
    expect(resolveParticipationTypeLabel(t, 'KR')).toBe('Resident / Fellow');
    expect(resolveParticipationTypeLabel(t, 'US')).toBe('Resident / Fellow');
  });
});

describe('isParticipationTypeOfferedIn — country-scoped regional roles', () => {
  it('a global baseline type (no scopedJurisdictions) is offered everywhere, including with no known jurisdiction', () => {
    expect(isParticipationTypeOfferedIn(base, 'US')).toBe(true);
    expect(isParticipationTypeOfferedIn(base, 'KR')).toBe(true);
    expect(isParticipationTypeOfferedIn(base)).toBe(true);
  });

  it('a scoped type is offered only in its own jurisdictions', () => {
    const bms = { ...base, id: 'bms_advanced_practitioner', scopedJurisdictions: ['GB_EW', 'GB_SCT', 'GB_NIR'] as Jurisdiction[] };
    expect(isParticipationTypeOfferedIn(bms, 'GB_EW')).toBe(true);
    expect(isParticipationTypeOfferedIn(bms, 'CA')).toBe(false);
    expect(isParticipationTypeOfferedIn(bms, 'KR')).toBe(false);
  });

  it('a scoped type is NOT offered when the jurisdiction is unknown — never guessed into a context it may not legally belong in', () => {
    const bms = { ...base, scopedJurisdictions: ['GB_EW'] as Jurisdiction[] };
    expect(isParticipationTypeOfferedIn(bms)).toBe(false);
  });
});

describe('seeded per-country data (Pete\'s own AU/NZ/EU/UK/IE/CA/KR role hierarchy)', () => {
  const PETE_JURISDICTIONS: Jurisdiction[] = ['AU', 'NZ', 'BE', 'NL', 'DE', 'FR', 'GB_EW', 'GB_SCT', 'GB_NIR', 'IE', 'CA', 'KR'];

  it('every tier type carries an explicit profile, with a regulatory note, for every one of his jurisdictions', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    for (const id of ['resident', 'consultant', 'primary', 'attending']) {
      const t = res.data.find(x => x.id === id)!;
      for (const j of PETE_JURISDICTIONS) {
        expect(t.jurisdictionProfiles?.[j]?.label, `${id} / ${j} label`).toBeTruthy();
        expect(t.jurisdictionProfiles?.[j]?.regulatoryNote, `${id} / ${j} regulatory note`).toBeTruthy();
      }
    }
  });

  it('the US (not in his data) carries no profile at all — resolves exactly as before', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    const resident = res.data.find(x => x.id === 'resident')!;
    expect(resident.jurisdictionProfiles?.US).toBeUndefined();
    expect(resolveParticipationTypeAuthority(resident, undefined, 'US')).toEqual(resolveParticipationTypeAuthority(resident));
  });

  it('Screener cannot finalize and requires countersign; Supervisor can finalize — in every one of his jurisdictions', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    const resident = res.data.find(x => x.id === 'resident')!;
    const primary  = res.data.find(x => x.id === 'primary')!;
    for (const j of PETE_JURISDICTIONS) {
      expect(resolveParticipationTypeAuthority(resident, undefined, j)).toMatchObject({ canFinalize: false, requiresCountersign: true });
      expect(resolveParticipationTypeAuthority(primary,  undefined, j)).toMatchObject({ canFinalize: true });
    }
  });

  it('real local titles land where his data puts them', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    const find = (id: string) => res.data.find(x => x.id === id)!;
    expect(resolveParticipationTypeLabel(find('resident'), 'KR')).toBe('Resident (Jeon-gong-ui)');
    expect(resolveParticipationTypeLabel(find('primary'), 'AU')).toBe('Specialist Pathologist (FRCPA)');
    expect(resolveParticipationTypeLabel(find('primary'), 'IE')).toBe('Consultant Histopathologist (RCPI)');
    expect(resolveParticipationTypeLabel(find('primary'), 'CA')).toBe('Attending Pathologist (FRCPC)');
    // 'Fellow' is a Screener in Canada but a Second Reviewer in South Korea
    // — exactly the "same title, different legal scope" case he called out.
    expect(resolveParticipationTypeLabel(find('resident'), 'CA')).toContain('Fellow');
    expect(resolveParticipationTypeLabel(find('consultant'), 'KR')).toContain('Fellow');
  });

  it('primary and attending never show identical labels in the same jurisdiction', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    const primary   = res.data.find(x => x.id === 'primary')!;
    const attending = res.data.find(x => x.id === 'attending')!;
    for (const j of PETE_JURISDICTIONS) {
      expect(resolveParticipationTypeLabel(primary, j)).not.toBe(resolveParticipationTypeLabel(attending, j));
    }
  });

  it('the Advanced Practitioner BMS is UK-only; the Biomedical Scientist is UK + EU; neither is offered in CA/KR/US', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    const ap  = res.data.find(x => x.id === 'bms_advanced_practitioner')!;
    const bms = res.data.find(x => x.id === 'biomedical_scientist')!;
    expect(ap.scopedJurisdictions?.sort()).toEqual(['GB_EW', 'GB_NIR', 'GB_SCT']);
    expect(isParticipationTypeOfferedIn(bms, 'DE')).toBe(true);
    expect(isParticipationTypeOfferedIn(ap, 'DE')).toBe(false);
    for (const j of ['CA', 'KR', 'US', 'AU'] as Jurisdiction[]) {
      expect(isParticipationTypeOfferedIn(ap, j)).toBe(false);
      expect(isParticipationTypeOfferedIn(bms, j)).toBe(false);
    }
  });

  it('both BMS types default to "cannot finalize, countersign required" (RCPath: BMS primary reporting requires credentialing and supervision)', async () => {
    const res = await mockParticipationTypeService.getAll();
    if (!res.ok) throw new Error('seed load failed');
    for (const id of ['biomedical_scientist', 'bms_advanced_practitioner']) {
      const t = res.data.find(x => x.id === id)!;
      expect(resolveParticipationTypeAuthority(t, undefined, 'GB_EW')).toMatchObject({ canFinalize: false, requiresCountersign: true });
    }
  });
});

describe('resolveCaseTeamParticipationTypes — what the case-team editor offers', () => {
  const bms = { ...base, id: 'bms', scopedJurisdictions: ['GB_EW'] as Jurisdiction[] };
  const withProfile = { ...base, jurisdictionProfiles: { AU: { label: 'Registrar / Trainee', canFinalize: true } } };

  it('offers only jurisdiction-valid types, with local titles and effective flags', () => {
    const out = resolveCaseTeamParticipationTypes([withProfile, bms], { jurisdiction: 'AU' }, new Set());
    expect(out.map(t => t.id)).toEqual(['resident']);
    expect(out[0]).toMatchObject({ label: 'Registrar / Trainee', canFinalize: true });
  });

  it('keeps an out-of-scope type an active participant already holds — never silently hidden', () => {
    const out = resolveCaseTeamParticipationTypes([withProfile, bms], { jurisdiction: 'AU' }, new Set(['bms']));
    expect(out.map(t => t.id)).toEqual(['resident', 'bms']);
  });

  it('never mutates the stored records it was given', () => {
    resolveCaseTeamParticipationTypes([withProfile], { jurisdiction: 'AU' }, new Set());
    expect(withProfile.label).toBe('Resident / Fellow');
  });
});

describe('admin edits never silently wipe country data', () => {
  it('saving a TypeModal-shaped draft (which carries no jurisdiction fields) preserves the type\'s jurisdictionProfiles and scopedJurisdictions', async () => {
    const before = await mockParticipationTypeService.getById('bms_advanced_practitioner');
    if (!before.ok) throw new Error('seed load failed');
    const res = await mockParticipationTypeService.update('bms_advanced_practitioner', { label: 'AP-BMS (renamed by admin)', canFinalize: false });
    if (!res.ok) throw new Error('update failed');
    expect(res.data.label).toBe('AP-BMS (renamed by admin)');
    expect(res.data.scopedJurisdictions).toEqual(before.data.scopedJurisdictions);
    expect(res.data.jurisdictionProfiles).toEqual(before.data.jurisdictionProfiles);
  });
});

describe('mergeSeedJurisdictionData — non-destructive upgrade of an already-persisted list', () => {
  const seed: ParticipationTypeRecord[] = [
    { ...base, jurisdictionProfiles: { AU: { label: 'Registrar' } } },
    { ...base, id: 'bms', scopedJurisdictions: ['GB_EW'] },
  ];

  it('backfills profiles onto a stored system type that predates them', () => {
    const merged = mergeSeedJurisdictionData([{ ...base }], seed);
    expect(merged.find(t => t.id === 'resident')!.jurisdictionProfiles?.AU?.label).toBe('Registrar');
  });

  it('appends a system seed type missing from storage entirely', () => {
    const merged = mergeSeedJurisdictionData([{ ...base }], seed);
    expect(merged.find(t => t.id === 'bms')?.scopedJurisdictions).toEqual(['GB_EW']);
  });

  it('never overwrites an admin\'s own edits — including a deliberately-cleared profile map', () => {
    const edited = { ...base, label: 'Admin-renamed', jurisdictionProfiles: {} };
    const merged = mergeSeedJurisdictionData([edited], seed);
    const r = merged.find(t => t.id === 'resident')!;
    expect(r.label).toBe('Admin-renamed');
    expect(r.jurisdictionProfiles).toEqual({});
  });

  it('leaves admin-created custom (non-system) types untouched', () => {
    const custom = { ...base, id: 'CUSTOM_1', isSystem: false };
    const merged = mergeSeedJurisdictionData([custom], seed);
    expect(merged.find(t => t.id === 'CUSTOM_1')).toEqual(custom);
  });
});
