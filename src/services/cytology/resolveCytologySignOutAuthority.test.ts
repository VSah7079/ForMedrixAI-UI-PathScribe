// src/services/cytology/resolveCytologySignOutAuthority.test.ts — PS-327 (Batch 332).
import { describe, it, expect } from 'vitest';
import { resolveCytologySignOutAuthority } from './resolveCytologySignOutAuthority';
import type { ParticipationTypeRecord } from '@/services/participationTypes/IParticipationTypeService';

const type = (id: string, canFinalize: boolean, requiresCountersign: boolean, extra: Partial<ParticipationTypeRecord> = {}): ParticipationTypeRecord => ({
  id, label: id, description: '', color: '#888', allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 1,
  canFinalize, requiresCountersign, ...extra,
});
const TYPES = [
  type('primary', true, false), type('attending', true, false), type('resident', false, true),
  type('cytotechnologist', false, true), type('consultant', false, false),
];
const ctx = (participationTypes = TYPES) => ({ participationTypes, performingLabFacilityId: 'lab-1', jurisdiction: 'US' as const });
const part = (staffId: string, ids: string[]) => ({ staffId, status: 'active' as const, participationTypeIds: ids });

describe('resolveCytologySignOutAuthority', () => {
  it('leaves the cytotechnologist track exactly as before', () => {
    const r = resolveCytologySignOutAuthority({
      isPathologistTrack: false, session: { id: 'ct-1', role: 'pathologist' }, participants: [part('ct-1', ['cytotechnologist'])], context: ctx(),
    });
    expect(r).toEqual({ track: 'cytotechnologist', countersignRequiredTypeIds: undefined, finalizeDecision: null });
  });

  it('applies the configured countersign types to the pathologist track, never including cytotechnologist', () => {
    const r = resolveCytologySignOutAuthority({
      isPathologistTrack: true, session: { id: 'p-1', role: 'pathologist' }, participants: [part('p-1', ['primary'])], context: ctx(),
    });
    expect(r.track).toBe('pathologist');
    expect(r.countersignRequiredTypeIds).toEqual(['resident']);
    expect(r.finalizeDecision).toMatchObject({ granted: true });
  });

  it('refuses a consultant unless the lab grants finalize authority', () => {
    const input = { isPathologistTrack: true, session: { id: 'c-1', role: 'pathologist' as const }, participants: [part('c-1', ['consultant'])] };
    expect(resolveCytologySignOutAuthority({ ...input, context: ctx() }).finalizeDecision).toMatchObject({ granted: false });
    const labGrants = TYPES.map(t => (t.id === 'consultant' ? { ...t, authorityOverrides: { 'lab-1': { canFinalize: true } } } : t));
    expect(resolveCytologySignOutAuthority({ ...input, context: ctx(labGrants) }).finalizeDecision).toMatchObject({ granted: true });
  });

  it('keeps the administrator override on the pathologist track', () => {
    const r = resolveCytologySignOutAuthority({ isPathologistTrack: true, session: { id: 'a-1', role: 'superadmin' }, participants: [], context: ctx() });
    expect(r.finalizeDecision).toMatchObject({ granted: true });
  });
});
