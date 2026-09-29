// src/services/participationTypes/saveParticipationType.test.ts
import { describe, it, expect, vi } from 'vitest';
import { saveParticipationTypeWithAudit, resolveAuditActor } from './saveParticipationType';
import type { IParticipationTypeService, ParticipationTypeRecord, NewParticipationType } from './IParticipationTypeService';

const existing: ParticipationTypeRecord = {
  id: 'resident', label: 'Resident', description: '', color: '#000',
  allowsMultiple: true, requiresNote: false, active: true, isSystem: true, sortOrder: 2,
  canFinalize: false, requiresCountersign: true, canViewWholeCase: true,
};
const { id: _id, isSystem: _s, sortOrder: _o, ...draftBase } = existing;
const draft: NewParticipationType = { ...draftBase, authorityOverrides: { 'lab-au': { canFinalize: true } } };
const actor = { userId: 'u1', userName: 'Jane Admin' };
const NOW = '2026-09-24T22:00:00.000Z';

function deps(saveResult: { ok: boolean; data?: ParticipationTypeRecord; error?: string }) {
  const typeService = {
    add: vi.fn().mockResolvedValue(saveResult),
    update: vi.fn().mockResolvedValue(saveResult),
  } as unknown as IParticipationTypeService;
  const auditService = { logEvent: vi.fn().mockResolvedValue({ ok: true }) };
  return { typeService, auditService };
}

describe('saveParticipationTypeWithAudit', () => {
  it('stamps provenance before persisting, then writes one audit entry per change', async () => {
    const d = deps({ ok: true, data: existing });
    const res = await saveParticipationTypeWithAudit(
      { mode: 'edit', existing, draft, justifications: { 'lab-au': 'NATA ref 7' }, facilityNames: { 'lab-au': 'Sydney' }, actor, now: () => NOW }, d,
    );
    expect(res.ok).toBe(true);
    expect(vi.mocked(d.typeService.update).mock.calls[0][1].authorityOverrides!['lab-au']).toEqual({
      canFinalize: true, requiresCountersign: undefined, canViewWholeCase: undefined,
      overriddenBy: actor, overriddenAt: NOW, justification: 'NATA ref 7',
    });
    expect(d.auditService.logEvent).toHaveBeenCalledTimes(1);
    expect(d.auditService.logEvent.mock.calls[0][0]).toMatchObject({ user: 'Jane Admin', facilityId: 'lab-au', event: 'Signing-authority facility override added' });
    expect(d.auditService.logEvent.mock.calls[0][0].detail).toContain('Sydney');
  });

  it('writes NO audit entry when the save fails, and returns the failure', async () => {
    const d = deps({ ok: false, error: 'storage full' });
    const res = await saveParticipationTypeWithAudit({ mode: 'edit', existing, draft, justifications: {}, facilityNames: {}, actor, now: () => NOW }, d);
    expect(res).toEqual({ ok: false, error: 'storage full' });
    expect(d.auditService.logEvent).not.toHaveBeenCalled();
  });

  it('add mode creates through add(), never update()', async () => {
    const d = deps({ ok: true, data: existing });
    await saveParticipationTypeWithAudit({ mode: 'add', draft, justifications: {}, facilityNames: {}, actor, now: () => NOW }, d);
    expect(d.typeService.add).toHaveBeenCalledTimes(1);
    expect(d.typeService.update).not.toHaveBeenCalled();
  });

  it('edit mode with no record refuses rather than guessing', async () => {
    const d = deps({ ok: true, data: existing });
    const res = await saveParticipationTypeWithAudit({ mode: 'edit', draft, justifications: {}, facilityNames: {}, actor, now: () => NOW }, d);
    expect(res.ok).toBe(false);
    expect(d.typeService.update).not.toHaveBeenCalled();
  });

  it('no override changes → no audit entries', async () => {
    const d = deps({ ok: true, data: existing });
    await saveParticipationTypeWithAudit({ mode: 'edit', existing, draft: { ...draftBase }, justifications: {}, facilityNames: {}, actor, now: () => NOW }, d);
    expect(d.auditService.logEvent).not.toHaveBeenCalled();
  });
});

describe('resolveAuditActor', () => {
  it('uses the full name, then the id, then a literal fallback', () => {
    expect(resolveAuditActor({ id: 'u1', firstName: 'Jane', lastName: 'Admin' })).toEqual({ userId: 'u1', userName: 'Jane Admin' });
    expect(resolveAuditActor({ id: 'u1' })).toEqual({ userId: 'u1', userName: 'u1' });
    expect(resolveAuditActor(null)).toEqual({ userId: 'unknown', userName: 'Unknown user' });
  });
});
