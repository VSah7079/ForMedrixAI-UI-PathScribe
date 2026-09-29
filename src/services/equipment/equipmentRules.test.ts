// Batch 358: the equipment register rules (from Batch 356's instrument rules).
import { describe, expect, it } from 'vitest';
import {
  checkBatchInstrument, checkEquipmentStation, equipmentForPicker, filterEquipment, stationsForEquipment, validateEquipmentDraft,
} from './equipmentRules';
import type { Equipment } from './IEquipmentService';

const inst = (over: Partial<Equipment>): Equipment => ({ id: 'i1', code: 'PANTHER_01', name: 'Panther 1', kind: 'analyser', facilityId: 'lab-a', status: 'Active', ...over });
const stations = [{ id: 's-a', facilityId: 'lab-a', status: 'Active' }, { id: 's-b', facilityId: 'lab-b', status: 'Active' }, { id: 's-a-off', facilityId: 'lab-a', status: 'Inactive' }];

describe('validateEquipmentDraft', () => {
  const ctx = { existing: [inst({})], stations };
  it('needs a name, a code, a lab; the code is unique and barcode-safe', () => {
    expect(validateEquipmentDraft({ name: ' ', kind: 'analyser', code: '', facilityId: '' }, ctx)).toEqual({ name: 'nameRequired', code: 'codeRequired', facilityId: 'facilityRequired' });
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'panther_01', facilityId: 'lab-a' }, ctx).code).toBe('codeTaken');
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'PANTHER 9', facilityId: 'lab-a' }, ctx).code).toBe('codeFormat');
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'PANTHER_09', facilityId: 'lab-a' }, ctx)).toEqual({});
  });
  it('needs a known kind', () => {
    expect(validateEquipmentDraft({ name: 'X', code: 'P9', kind: 'toaster' as never, facilityId: 'lab-a' }, ctx).kind).toBe('kindRequired');
  });
  it('its own code is not taken when editing', () => {
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'PANTHER_01', facilityId: 'lab-a' }, { ...ctx, editingId: 'i1' })).toEqual({});
  });
  it('the scan station must be in the same lab', () => {
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'P9', facilityId: 'lab-a', scanStationId: 's-b' }, ctx).scanStationId).toBe('stationOtherFacility');
    expect(validateEquipmentDraft({ name: 'X', kind: 'analyser', code: 'P9', facilityId: 'lab-a', scanStationId: 's-a' }, ctx)).toEqual({});
  });
});

describe('checkBatchInstrument', () => {
  const list = [inst({}), inst({ id: 'i2', code: 'OLD_1', status: 'Inactive' }), inst({ id: 'i3', code: 'CAM_1', kind: 'camera' })];
  it('accepts an active analyser (any case) and refuses unknown, inactive or non-analyser codes', () => {
    expect(checkBatchInstrument('panther_01', list)).toMatchObject({ ok: true, equipment: { code: 'PANTHER_01' } });
    expect(checkBatchInstrument('CAM_1', list)).toEqual({ ok: false, reason: 'notAnalyser' });
    expect(checkBatchInstrument('PANTHR_01', list)).toEqual({ ok: false, reason: 'unknown' });
    expect(checkBatchInstrument('OLD_1', list)).toEqual({ ok: false, reason: 'inactive' });
  });
});

describe('checkEquipmentStation', () => {
  it('true or false when both are known; null when there is nothing to check', () => {
    expect(checkEquipmentStation({ scanStationId: 's-a' }, 's-a')).toBe(true);
    expect(checkEquipmentStation({ scanStationId: 's-a' }, 's-b')).toBe(false);
    expect(checkEquipmentStation({}, 's-b')).toBeNull();
    expect(checkEquipmentStation({ scanStationId: 's-a' }, null)).toBeNull();
    expect(checkEquipmentStation(undefined, 's-a')).toBeNull();
  });
});

describe('lists', () => {
  const list = [
    inst({ id: '1', name: 'Zeta', facilityId: 'lab-b' }),
    inst({ id: '2', name: 'Beta', code: 'B', make: 'Roche', model: 'Cobas', serialNumber: 'SN-77' }),
    inst({ id: '3', name: 'Alpha', code: 'A', status: 'Inactive' }),
    inst({ id: '4', name: 'Macro cam', code: 'CAM', kind: 'camera' }),
  ];
  it('equipmentForPicker: active only, of the kind asked, this lab first, by name', () => {
    expect(equipmentForPicker(list, { kind: 'analyser', preferredFacilityId: 'lab-b' }).map(i => i.id)).toEqual(['1', '2']);
    expect(equipmentForPicker(list, { kind: 'analyser' }).map(i => i.id)).toEqual(['2', '1']);
    expect(equipmentForPicker(list).map(i => i.id)).toEqual(['2', '4', '1']);
  });
  it('filterEquipment: text over name, code, make, model and serial; kind; status; lab', () => {
    expect(filterEquipment(list, { search: 'roche', status: 'All', kind: 'All' }).map(i => i.id)).toEqual(['2']);
    expect(filterEquipment(list, { search: 'sn-77', status: 'All', kind: 'All' }).map(i => i.id)).toEqual(['2']);
    expect(filterEquipment(list, { search: '', status: 'All', kind: 'camera' }).map(i => i.id)).toEqual(['4']);
    expect(filterEquipment(list, { search: '', status: 'Inactive', kind: 'All' }).map(i => i.id)).toEqual(['3']);
    expect(filterEquipment(list, { search: '', status: 'All', kind: 'All', facilityId: 'lab-b' }).map(i => i.id)).toEqual(['1']);
  });
  it('stationsForEquipment: that lab\'s active stations; none without a lab', () => {
    expect(stationsForEquipment(stations, 'lab-a').map(s => s.id)).toEqual(['s-a']);
    expect(stationsForEquipment(stations, '')).toEqual([]);
  });
});

// ── Batch 359: settings records that point at a register device ─────────────
import { checkEquipmentLink, equipmentLinkOptions, settingsLinksByEquipment } from './equipmentRules';

describe('equipment links (Batch 359)', () => {
  const reg = [
    inst({ id: 'p1', code: 'ZT', name: 'Zebra', kind: 'label_printer' }),
    inst({ id: 'p2', code: 'OLDP', name: 'Old printer', kind: 'label_printer', status: 'Inactive' }),
    inst({ id: 'c1', code: 'CAM', name: 'Camera', kind: 'camera' }),
  ];
  it('checkEquipmentLink: no link is fine; unknown or wrong kind is refused', () => {
    expect(checkEquipmentLink(undefined, reg, 'label_printer')).toBeNull();
    expect(checkEquipmentLink('p1', reg, 'label_printer')).toBeNull();
    expect(checkEquipmentLink('c1', reg, 'label_printer')).toBe('wrongKind');
    expect(checkEquipmentLink('zz', reg, 'label_printer')).toBe('notFound');
  });
  it('equipmentLinkOptions: active devices of the kind, plus the current link even if inactive', () => {
    expect(equipmentLinkOptions(reg, 'label_printer').map(e => e.id)).toEqual(['p1']);
    expect(equipmentLinkOptions(reg, 'label_printer', 'p2').map(e => e.id)).toEqual(['p2', 'p1']);
  });
  it('settingsLinksByEquipment: which printer and grossing profiles point at each device', () => {
    const links = settingsLinksByEquipment([{ equipmentId: 'p1', printerId: 'ZEBRA-1' }, { printerId: 'UNLINKED' }], [{ equipmentId: 'c1', label: 'Bench cam' }]);
    expect(links.get('p1')).toEqual([{ type: 'printerProfile', label: 'ZEBRA-1' }]);
    expect(links.get('c1')).toEqual([{ type: 'grossingHardware', label: 'Bench cam' }]);
    expect(links.size).toBe(2);
  });
});

describe('schedules (Batch 360)', () => {
  it('an interval must be whole days, 1 to 3650; empty is fine', () => {
    const base = { name: 'X', code: 'X1', kind: 'analyser' as const, facilityId: 'lab-a' };
    const ctx = { existing: [], stations: [] };
    expect(validateEquipmentDraft({ ...base, maintenanceIntervalDays: 30 }, ctx)).toEqual({});
    expect(validateEquipmentDraft({ ...base, maintenanceIntervalDays: 0 }, ctx).maintenanceIntervalDays).toBe('intervalInvalid');
    expect(validateEquipmentDraft({ ...base, calibrationIntervalDays: 4000 }, ctx).calibrationIntervalDays).toBe('intervalInvalid');
  });
});
