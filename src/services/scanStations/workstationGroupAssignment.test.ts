// src/services/scanStations/workstationGroupAssignment.test.ts
import { describe, it, expect } from 'vitest';
import { mockScanStationService } from './mockScanStationService';
import { mockWorkstationGroupService } from '../workstationGroups/mockWorkstationGroupService';

describe('mockScanStationService.update() \u2014 real facility-match validation when assigning a WorkstationGroup, per PS-289', () => {
  it('a real station is assigned to a real group at the SAME real facility \u2014 succeeds', async () => {
    const group = await mockWorkstationGroupService.create({
      name: 'Grossing Group', discipline: 'HISTOLOGY', functionalArea: 'Grossing',
      performingLabFacilityId: 'c-fenwick-general', createdBy: 'user-1',
    });
    if (!group.ok) throw new Error('setup failed');

    const res = await mockScanStationService.update('station-gross-1', { workstationGroupId: group.data.id });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.workstationGroupId).toBe(group.data.id);
  });

  it('a real station is honestly rejected from a real group at a DIFFERENT real facility', async () => {
    const group = await mockWorkstationGroupService.create({
      name: 'Wrong-Site Group', discipline: 'HISTOLOGY', functionalArea: 'Grossing',
      performingLabFacilityId: 'c-some-other-site', createdBy: 'user-1',
    });
    if (!group.ok) throw new Error('setup failed');

    const res = await mockScanStationService.update('station-gross-2', { workstationGroupId: group.data.id });
    expect(res.ok).toBe(false);
  });

  it('assigning a real, genuinely nonexistent group id is honestly rejected, never silently applied', async () => {
    const res = await mockScanStationService.update('station-gross-3', { workstationGroupId: 'wg-does-not-exist' });
    expect(res.ok).toBe(false);
  });

  it('other real field updates on a station are unaffected \u2014 this validation only fires when workstationGroupId is actually part of the change', async () => {
    const res = await mockScanStationService.update('station-embed-1', { name: 'Histology — Embedding (renamed)' });
    expect(res.ok).toBe(true);
  });
});
