// src/services/actionGroups/mockActionGroupService.test.ts
import { describe, it, expect } from 'vitest';
import { mockActionGroupService } from './mockActionGroupService';

describe('mockActionGroupService \u2014 real, per PS-289', () => {
  it('create() succeeds with a real, named bundle of action ids', async () => {
    const res = await mockActionGroupService.create({
      name: 'Log Slide/Block', actionIds: ['PRINT_CURRENT_CASSETTE', 'BATCH_PRINT_CASE_LABELS'], createdBy: 'user-1',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('Active');
      expect(res.data.actionIds).toEqual(['PRINT_CURRENT_CASSETTE', 'BATCH_PRINT_CASE_LABELS']);
    }
  });

  it('getById() retrieves a real, previously created group', async () => {
    const created = await mockActionGroupService.create({ name: 'Grossing Bench Actions', actionIds: [], createdBy: 'user-1' });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockActionGroupService.getById(created.data.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe('Grossing Bench Actions');
  });

  it('update() can add real action ids to an already-existing group', async () => {
    const created = await mockActionGroupService.create({ name: 'Embedding Actions', actionIds: ['OPEN_DELEGATE_MODAL'], createdBy: 'user-1' });
    if (!created.ok) throw new Error('setup failed');
    const res = await mockActionGroupService.update(created.data.id, { actionIds: ['OPEN_DELEGATE_MODAL', 'PRINT_CURRENT_CASSETTE'] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.actionIds).toHaveLength(2);
  });

  it('deactivate() and reactivate() toggle real status', async () => {
    const created = await mockActionGroupService.create({ name: 'Screening Actions', actionIds: [], createdBy: 'user-1' });
    if (!created.ok) throw new Error('setup failed');
    const deactivated = await mockActionGroupService.deactivate(created.data.id);
    expect(deactivated.ok && deactivated.data.status).toBe('Inactive');
    const reactivated = await mockActionGroupService.reactivate(created.data.id);
    expect(reactivated.ok && reactivated.data.status).toBe('Active');
  });

  it('a real, genuinely nonexistent id is a real, honest not-found result', async () => {
    const res = await mockActionGroupService.getById('ag-does-not-exist');
    expect(res.ok).toBe(false);
  });
});
