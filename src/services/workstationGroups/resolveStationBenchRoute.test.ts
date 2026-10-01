// src/services/workstationGroups/resolveStationBenchRoute.test.ts
// Same real, minimal-setup convention as computeDisposalReport.test.ts —
// an in-memory localStorage polyfill installed on globalThis before the
// mock services are ever imported (their storage helpers read/write it
// directly, and mockWorkstationGroupService.ts's own version-gate check
// runs at module load time), so the mock services' real persistence
// layer actually works under vitest's default (non-DOM) environment.
import { describe, it, expect } from 'vitest';
import type { WorkstationGroup } from './IWorkstationGroupService';
import type { ServiceResult } from '../types';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { resolveBenchRouteForGroup, resolveStationBenchRoute } = await import('./resolveStationBenchRoute');
const { mockWorkstationGroupService } = await import('./mockWorkstationGroupService');
const { mockScanStationService } = await import('../scanStations/mockScanStationService');

describe('resolveBenchRouteForGroup — the shared Active-gated route rule', () => {
  const baseGroup: WorkstationGroup = {
    id: 'wg-1', name: 'Embedding Group', discipline: 'HISTOLOGY', functionalArea: 'Embedding',
    performingLabFacilityId: 'c-fenwick-general', status: 'Active', createdAt: new Date().toISOString(),
    createdBy: 'user-1', dedicatedPageRoute: '/workstations/embedding',
  };
  const activeGroupWithRoute: ServiceResult<WorkstationGroup> = { ok: true, data: baseGroup };

  it('returns the route for a real, Active group with a real route', () => {
    expect(resolveBenchRouteForGroup(activeGroupWithRoute)).toBe('/workstations/embedding');
  });

  it('returns undefined for an Inactive group, even with a real route configured', () => {
    const inactive: ServiceResult<WorkstationGroup> = { ok: true, data: { ...baseGroup, status: 'Inactive' } };
    expect(resolveBenchRouteForGroup(inactive)).toBeUndefined();
  });

  it('returns undefined for an Active group with no route configured', () => {
    const noRoute: ServiceResult<WorkstationGroup> = { ok: true, data: { ...baseGroup, dedicatedPageRoute: undefined } };
    expect(resolveBenchRouteForGroup(noRoute)).toBeUndefined();
  });

  it('returns undefined when the group fetch itself failed', () => {
    expect(resolveBenchRouteForGroup({ ok: false, error: 'not found' })).toBeUndefined();
  });

  it('returns undefined when no group result is available at all', () => {
    expect(resolveBenchRouteForGroup(undefined)).toBeUndefined();
  });
});

describe('resolveStationBenchRoute — full station → group → route chain', () => {
  it('resolves a real route for a station assigned to a real, Active group with a route', async () => {
    const group = await mockWorkstationGroupService.create({
      name: 'Microtomy Bench Group', discipline: 'HISTOLOGY', functionalArea: 'Microtomy / Sectioning',
      performingLabFacilityId: 'c-fenwick-general', createdBy: 'user-1', dedicatedPageRoute: '/workstations/microtomy',
    });
    if (!group.ok) throw new Error('setup failed');

    const stationRes = await mockScanStationService.update('station-micro-1', { workstationGroupId: group.data.id });
    expect(stationRes.ok).toBe(true);

    const route = await resolveStationBenchRoute('station-micro-1');
    expect(route).toBe('/workstations/microtomy');
  });

  it('resolves to undefined once the group is deactivated, even though the station assignment is unchanged', async () => {
    const group = await mockWorkstationGroupService.create({
      name: 'Staining Bench Group', discipline: 'HISTOLOGY', functionalArea: 'Staining',
      performingLabFacilityId: 'c-fenwick-general', createdBy: 'user-1', dedicatedPageRoute: '/workstations/staining',
    });
    if (!group.ok) throw new Error('setup failed');

    await mockScanStationService.update('station-stain-1', { workstationGroupId: group.data.id });
    await mockWorkstationGroupService.deactivate(group.data.id);

    const route = await resolveStationBenchRoute('station-stain-1');
    expect(route).toBeUndefined();
  });

  it('resolves to undefined for a station with no workstationGroupId at all', async () => {
    const route = await resolveStationBenchRoute('station-archive-1');
    expect(route).toBeUndefined();
  });

  it('resolves to undefined for a genuinely nonexistent station id', async () => {
    const route = await resolveStationBenchRoute('station-does-not-exist');
    expect(route).toBeUndefined();
  });
});
