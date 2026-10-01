// Batch 360: maintenance and calibration rules.
import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, earliestDue, equipmentServiceState, groupLogByEquipment, hasOpenMalfunction, isServiceAlert, isValidInterval, nextDue,
  serviceStatesById, sortLogNewestFirst, validateEquipmentLogEntry,
} from './equipmentLogRules';
import type { EquipmentLogEntry } from './IEquipmentLogService';

const TODAY = '2026-09-27';
let n = 0;
const entry = (type: EquipmentLogEntry['type'], performedOn: string, outcome: EquipmentLogEntry['outcome'] = 'pass', equipmentId = 'e1'): EquipmentLogEntry =>
  ({ id: `x${n++}`, equipmentId, type, performedOn, performedBy: 'A', outcome, recordedAt: `${performedOn}T10:00:00Z`, recordedByUserId: 'u' });
const sched = { maintenanceIntervalDays: 30, calibrationIntervalDays: 180 };

describe('dates', () => {
  it('addDays and daysBetween work on calendar dates across months and years', () => {
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04');
    expect(daysBetween('2026-09-27', '2026-10-27')).toBe(30);
  });
});

describe('validateEquipmentLogEntry', () => {
  const ok = { type: 'maintenance' as const, performedOn: '2026-09-20', performedBy: 'M. Alvarez', outcome: 'pass' as const };
  it('a complete entry passes', () => expect(validateEquipmentLogEntry(ok, TODAY)).toEqual({}));
  it('no future dates; who did it is required', () => {
    expect(validateEquipmentLogEntry({ ...ok, performedOn: '2026-09-28' }, TODAY).performedOn).toBe('dateInFuture');
    expect(validateEquipmentLogEntry({ ...ok, performedOn: '' }, TODAY).performedOn).toBe('dateRequired');
    expect(validateEquipmentLogEntry({ ...ok, performedBy: ' ' }, TODAY).performedBy).toBe('performedByRequired');
  });
  it('a failure or a malfunction needs notes', () => {
    expect(validateEquipmentLogEntry({ ...ok, outcome: 'fail' }, TODAY).notes).toBe('notesRequired');
    expect(validateEquipmentLogEntry({ ...ok, type: 'malfunction', outcome: 'fail', notes: 'Pipettor error' }, TODAY)).toEqual({});
  });
});

describe('nextDue', () => {
  it('not scheduled → null; scheduled but never done → neverDone', () => {
    expect(nextDue('maintenance', {}, [], TODAY)).toBeNull();
    expect(nextDue('maintenance', sched, [], TODAY)).toEqual({ state: 'neverDone' });
  });
  it('counts from the last passing entry: ok, due soon, overdue', () => {
    expect(nextDue('maintenance', sched, [entry('maintenance', '2026-09-20')], TODAY)).toEqual({ lastDone: '2026-09-20', dueOn: '2026-10-20', state: 'ok' });
    expect(nextDue('maintenance', sched, [entry('maintenance', '2026-09-02')], TODAY)?.state).toBe('dueSoon');
    expect(nextDue('calibration', sched, [entry('calibration', '2026-03-01')], TODAY)?.state).toBe('overdue');
  });
  it('a failed calibration does not reset the clock; not-applicable counts for maintenance only', () => {
    const entries = [entry('calibration', '2026-03-01'), entry('calibration', '2026-09-20', 'fail')];
    expect(nextDue('calibration', sched, entries, TODAY)?.lastDone).toBe('2026-03-01');
    expect(nextDue('maintenance', sched, [entry('maintenance', '2026-09-20', 'not_applicable')], TODAY)?.state).toBe('ok');
    expect(nextDue('calibration', sched, [entry('calibration', '2026-09-20', 'not_applicable')], TODAY)?.state).toBe('neverDone');
  });
});

describe('malfunctions and the overall state', () => {
  it('a malfunction stays open until a passing repair or function check on or after it', () => {
    expect(hasOpenMalfunction([entry('malfunction', '2026-09-24', 'fail')])).toBe(true);
    expect(hasOpenMalfunction([entry('malfunction', '2026-09-24', 'fail'), entry('repair', '2026-09-24', 'fail')])).toBe(true);
    expect(hasOpenMalfunction([entry('malfunction', '2026-09-24', 'fail'), entry('function_check', '2026-09-25')])).toBe(false);
  });
  it('worst state wins: malfunction, overdue, not yet done, due soon, up to date, not scheduled', () => {
    const upToDate = [entry('maintenance', '2026-09-20'), entry('calibration', '2026-09-01')];
    expect(equipmentServiceState(sched, upToDate, TODAY).state).toBe('ok');
    expect(equipmentServiceState(sched, [...upToDate, entry('malfunction', '2026-09-26', 'fail')], TODAY).state).toBe('malfunction');
    expect(equipmentServiceState(sched, [entry('maintenance', '2026-09-02'), entry('calibration', '2026-03-01')], TODAY).state).toBe('overdue');
    expect(equipmentServiceState(sched, [entry('maintenance', '2026-09-20')], TODAY).state).toBe('neverDone');
    expect(equipmentServiceState(sched, [entry('maintenance', '2026-09-02'), entry('calibration', '2026-09-01')], TODAY).state).toBe('dueSoon');
    expect(equipmentServiceState({}, [], TODAY).state).toBe('notScheduled');
  });
});

describe('list helpers', () => {
  it('sorts newest first, groups by device, finds the earliest due date', () => {
    const a = entry('maintenance', '2026-09-01', 'pass', 'e1'); const b = entry('repair', '2026-09-10', 'pass', 'e2');
    expect(sortLogNewestFirst([a, b]).map(e => e.id)).toEqual([b.id, a.id]);
    expect(groupLogByEquipment([a, b]).get('e2')).toEqual([b]);
    expect(earliestDue(TODAY, { state: 'ok', dueOn: '2026-10-01' }, null, { state: 'overdue', dueOn: '2026-09-01' })).toEqual({ date: '2026-09-01', overdue: true });
    expect(earliestDue(TODAY, { state: 'ok', dueOn: '2026-10-01' })).toEqual({ date: '2026-10-01', overdue: false });
    expect(earliestDue(TODAY, null, { state: 'neverDone' })).toBeUndefined();
  });
  it('isValidInterval', () => {
    expect([undefined, 1, 3650].every(isValidInterval)).toBe(true);
    expect([0, -5, 1.5, 3651, NaN].some(isValidInterval)).toBe(false);
  });
});

describe('shown in red (Batch 361)', () => {
  it('only an open malfunction or something past due is an alert', () => {
    expect(isServiceAlert('malfunction')).toBe(true);
    expect(isServiceAlert('overdue')).toBe(true);
    for (const s of ['neverDone', 'dueSoon', 'ok', 'notScheduled'] as const) expect(isServiceAlert(s)).toBe(false);
  });
  it('serviceStatesById gives each device its own state', () => {
    const states = serviceStatesById(
      [{ id: 'a', ...sched }, { id: 'b', ...sched }, { id: 'c' }],
      [entry('maintenance', '2026-09-20', 'pass', 'a'), entry('calibration', '2026-09-01', 'pass', 'a'), entry('malfunction', '2026-09-25', 'not_applicable', 'b')],
      TODAY,
    );
    expect(states.get('a')).toBe('ok');
    expect(states.get('b')).toBe('malfunction');
    expect(states.get('c')).toBe('notScheduled');
  });
});
