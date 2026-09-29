// @vitest-environment happy-dom
// Batch 358: the demo equipment register.
import { beforeEach, describe, expect, it } from 'vitest';
import { mockEquipmentService } from './mockEquipmentService';

describe('mockEquipmentService', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the three Panther analysers the demo batches use, and (Batch 359) the Zebra printer', async () => {
    const res = await mockEquipmentService.getAll();
    expect(res.ok && res.data.map(i => `${i.code}:${i.kind}`)).toEqual(['PANTHER_01:analyser', 'PANTHER_02:analyser', 'PANTHER_03:analyser', 'ZEBRA_ZT411_01:label_printer']);
    const byCode = await mockEquipmentService.getByCode('panther_02');
    expect(byCode.ok && byCode.data.scanStationId).toBe('station-molecular-1');
  });

  it('brings a Batch 356 instrument list across once, as analysers, keeping admin-added ones', async () => {
    localStorage.setItem('pathscribe_mock_instruments', JSON.stringify([
      { id: 'inst-panther-01', code: 'PANTHER_01', name: 'Panther 1 (renamed)', model: 'Hologic Panther', facilityId: 'c-fenwick-general', status: 'Active' },
      { id: 'inst-123', code: 'COBAS_1', name: 'Cobas 1', facilityId: 'c-fenwick-general', status: 'Active' },
    ]));
    const res = await mockEquipmentService.getAll();
    const byId = new Map((res.ok ? res.data : []).map(e => [e.id, e]));
    expect(byId.get('inst-panther-01')?.name).toBe('Panther 1 (renamed)');
    expect(byId.get('inst-123')).toMatchObject({ code: 'COBAS_1', kind: 'analyser' });
    expect(byId.has('inst-panther-02')).toBe(true); // missing seed records added
    expect(localStorage.getItem('pathscribe_mock_equipment')).not.toBeNull();
  });

  it('creates with a normalised code and a kind; refuses a duplicate or an invalid draft', async () => {
    const created = await mockEquipmentService.create({ code: ' cam_1 ', name: 'Macro camera', kind: 'camera', facilityId: 'c-fenwick-general', serialNumber: ' SN1 ', status: 'Active' });
    expect(created.ok && [created.data.code, created.data.serialNumber]).toEqual(['CAM_1', 'SN1']);
    expect(await mockEquipmentService.create({ code: 'CAM_1', name: 'Again', kind: 'camera', facilityId: 'c-fenwick-general', status: 'Active' })).toEqual({ ok: false, error: 'duplicateCode' });
    expect(await mockEquipmentService.create({ code: 'X', name: '', kind: 'camera', facilityId: 'c-fenwick-general', status: 'Active' })).toEqual({ ok: false, error: 'invalid' });
    const analysers = await mockEquipmentService.getActive('analyser');
    expect(analysers.ok && analysers.data.map(e => e.code)).toEqual(['PANTHER_01', 'PANTHER_02', 'PANTHER_03']);
  });

  it('update keeps the code; deactivate hides it from getActive; a station in another lab is refused', async () => {
    const res = await mockEquipmentService.update('inst-panther-03', { name: 'Panther 3 (bay 2)', code: 'CHANGED' } as never);
    expect(res.ok && [res.data.name, res.data.code]).toEqual(['Panther 3 (bay 2)', 'PANTHER_03']);
    await mockEquipmentService.deactivate('inst-panther-03');
    const active = await mockEquipmentService.getActive('analyser');
    expect(active.ok && active.data.map(i => i.code)).toEqual(['PANTHER_01', 'PANTHER_02']);
    expect(await mockEquipmentService.update('inst-panther-01', { facilityId: 'c-ent-mpa' })).toEqual({ ok: false, error: 'invalid' });
    expect(await mockEquipmentService.update('nope', { name: 'x' })).toEqual({ ok: false, error: 'notFound' });
  });
});
