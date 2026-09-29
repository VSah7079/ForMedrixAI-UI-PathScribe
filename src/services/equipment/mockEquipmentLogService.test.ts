// @vitest-environment happy-dom
// Batch 360: the demo equipment log.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockEquipmentLogService } from './mockEquipmentLogService';
import { mockEquipmentService } from './mockEquipmentService';
import { mockAuditService } from '../auditlog/mockAuditService';
import { equipmentServiceState } from './equipmentLogRules';

const today = () => new Date().toISOString().slice(0, 10);

describe('mockEquipmentLogService', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('seeds a history that shows each state on the Panthers', async () => {
    const all = await mockEquipmentService.getAll();
    const byId = new Map((all.ok ? all.data : []).map(e => [e.id, e]));
    const state = async (id: string) => {
      const log = await mockEquipmentLogService.list(id);
      return equipmentServiceState(byId.get(id)!, log.ok ? log.data : [], today()).state;
    };
    expect(await state('inst-panther-01')).toBe('ok');
    expect(await state('inst-panther-02')).toBe('overdue');
    expect(await state('inst-panther-03')).toBe('malfunction');
    expect(await state('eq-zebra-zt411-01')).toBe('notScheduled');
  });

  it('appends an entry, audits it, and lists it first; it resolves the malfunction', async () => {
    const audit = vi.spyOn(mockAuditService, 'logEvent');
    const res = await mockEquipmentLogService.add(
      { equipmentId: 'inst-panther-03', type: 'repair', performedOn: today(), performedBy: ' Hologic field service ', outcome: 'pass', notes: ' Pipettor replaced ', recordedByUserId: 'PATH-001' },
      today(),
    );
    expect(res.ok && [res.data.performedBy, res.data.notes]).toEqual(['Hologic field service', 'Pipettor replaced']);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'equipment.log_entry_added', detail: expect.stringContaining('PANTHER_03') }));
    const log = await mockEquipmentLogService.list('inst-panther-03');
    expect(log.ok && log.data[0].type).toBe('repair');
    const eq = await mockEquipmentService.getById('inst-panther-03');
    expect(equipmentServiceState(eq.ok ? eq.data : ({} as never), log.ok ? log.data : [], today()).state).not.toBe('malfunction');
  });

  it('refuses an unknown device or an invalid entry', async () => {
    const base = { type: 'maintenance' as const, performedOn: today(), performedBy: 'A', outcome: 'pass' as const, recordedByUserId: 'u' };
    expect(await mockEquipmentLogService.add({ ...base, equipmentId: 'nope' }, today())).toEqual({ ok: false, error: 'equipmentNotFound' });
    expect(await mockEquipmentLogService.add({ ...base, equipmentId: 'inst-panther-01', outcome: 'fail' }, today())).toEqual({ ok: false, error: 'invalid' });
  });
});
