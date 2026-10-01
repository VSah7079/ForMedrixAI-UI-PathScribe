// src/services/workstationGroups/mockWorkstationGroupService.test.ts
import { describe, it, expect } from 'vitest';
import { mockWorkstationGroupService } from './mockWorkstationGroupService';

describe('mockWorkstationGroupService \u2014 real, per PS-289', () => {
  it('create() accepts a real functionalArea that is valid for its discipline', async () => {
    const res = await mockWorkstationGroupService.create({
      name: 'Embedding Bay A', discipline: 'HISTOLOGY', functionalArea: 'Embedding',
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('Active');
  });

  it('create() rejects a functionalArea that does not belong to the given discipline', async () => {
    const res = await mockWorkstationGroupService.create({
      name: 'Bad Group', discipline: 'HISTOLOGY', functionalArea: 'Extraction', // real Molecular area, not Histology's
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    expect(res.ok).toBe(false);
  });

  it('create() honestly rejects every AUTOPSY group, since that discipline has no real, populated functional areas yet', async () => {
    const res = await mockWorkstationGroupService.create({
      name: 'Morgue Intake', discipline: 'AUTOPSY', functionalArea: 'Morgue Intake',
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    expect(res.ok).toBe(false);
  });

  it('create() accepts a real Molecular functional area, confirming that discipline is genuinely populated', async () => {
    const res = await mockWorkstationGroupService.create({
      name: 'PCR Bench 1', discipline: 'MOLECULAR', functionalArea: 'PCR Setup',
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    expect(res.ok).toBe(true);
  });

  it('getByFacility() returns only groups scoped to the real, given facility', async () => {
    await mockWorkstationGroupService.create({
      name: 'Screening Bench B', discipline: 'CYTOLOGY', functionalArea: 'Screening',
      performingLabFacilityId: 'fac-2', createdBy: 'user-1',
    });
    const res = await mockWorkstationGroupService.getByFacility('fac-2');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.every(g => g.performingLabFacilityId === 'fac-2')).toBe(true);
      expect(res.data.some(g => g.performingLabFacilityId === 'fac-1')).toBe(false);
    }
  });

  it('update() re-validates functionalArea against discipline, even if discipline itself is unchanged', async () => {
    const created = await mockWorkstationGroupService.create({
      name: 'Staining Line 2', discipline: 'HISTOLOGY', functionalArea: 'Staining',
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockWorkstationGroupService.update(created.data.id, { functionalArea: 'Not A Real Area' });
    expect(res.ok).toBe(false);
  });

  it('deactivate() sets status to Inactive; reactivate() sets it back', async () => {
    const created = await mockWorkstationGroupService.create({
      name: 'Grossing Bench 9', discipline: 'HISTOLOGY', functionalArea: 'Grossing',
      performingLabFacilityId: 'fac-1', createdBy: 'user-1',
    });
    if (!created.ok) throw new Error('setup failed');
    const deactivated = await mockWorkstationGroupService.deactivate(created.data.id);
    expect(deactivated.ok && deactivated.data.status).toBe('Inactive');
    const reactivated = await mockWorkstationGroupService.reactivate(created.data.id);
    expect(reactivated.ok && reactivated.data.status).toBe('Active');
  });

  it('a real, genuinely nonexistent id is a real, honest not-found result', async () => {
    const res = await mockWorkstationGroupService.getById('wg-does-not-exist');
    expect(res.ok).toBe(false);
  });
});
