// @vitest-environment happy-dom
// Batch 359: printer profiles name their physical printer in the equipment register.
import { beforeEach, describe, expect, it } from 'vitest';
import { mockPrinterProfileService } from './mockPrinterProfileService';
import { mockGrossingHardwareProfileService } from '../grossingHardware/mockGrossingHardwareProfileService';
import { printerProfilesForFacility, printerSupportLabelKey } from './printerProfileList';
import { duplicatePrinterProfile } from '../duplication/duplicateEntities';
import { EQUIPMENT_LINK_INVALID } from '../equipment/IEquipmentService';

describe('printer profile ↔ equipment register', () => {
  beforeEach(() => localStorage.clear());

  it('the seeded Zebra profile points at the seeded register printer', async () => {
    const res = await mockPrinterProfileService.getById('printer-zt411-example');
    expect(res.ok && res.data?.equipmentId).toBe('eq-zebra-zt411-01');
  });

  it('a browser that stored the profile before the link gets it; a stored link is kept', async () => {
    localStorage.setItem('pathscribe_mock_pathscribe_printer_profiles', JSON.stringify([
      { id: 'printer-zt411-example', printerId: 'ZEBRA-192.168.12.85', model: 'ZT411', dpi: 300, supportsDataMatrix: true, supportsGS1: true, zplVersion: '7.0', maxPrintDensity: 300, moduleSize: 4, vendor: 'ZEBRA_ZPL', bridgeType: 'qz_tray', active: true, createdAt: '', updatedAt: '' },
    ]));
    const res = await mockPrinterProfileService.getById('printer-zt411-example');
    expect(res.ok && res.data?.equipmentId).toBe('eq-zebra-zt411-01');
  });

  it('refuses a link to a device that isn\'t a label printer', async () => {
    const res = await mockPrinterProfileService.update('printer-zt411-example', { equipmentId: 'inst-panther-01' });
    expect(res).toEqual({ ok: false, error: EQUIPMENT_LINK_INVALID });
    const cleared = await mockPrinterProfileService.update('printer-zt411-example', { equipmentId: undefined });
    expect(cleared.ok).toBe(true);
  });

  it('grossing hardware refuses a device of the wrong kind', async () => {
    const res = await mockGrossingHardwareProfileService.update('grossing-hw-camera-default', { equipmentId: 'eq-zebra-zt411-01' });
    expect(res).toEqual({ ok: false, error: EQUIPMENT_LINK_INVALID });
  });

  it('a duplicated printer profile doesn\'t copy the physical device', async () => {
    const res = await mockPrinterProfileService.getById('printer-zt411-example');
    expect(duplicatePrinterProfile(res.ok ? res.data! : ({} as never)).equipmentId).toBeUndefined();
  });

  it('list helpers', () => {
    const ps = [{ id: '1', facilityId: 'a' }, { id: '2' }, { id: '3', facilityId: 'b' }] as never[];
    expect(printerProfilesForFacility(ps, 'a').map((p: { id: string }) => p.id)).toEqual(['1', '2']);
    expect(printerSupportLabelKey({ supportsGS1: true, supportsDataMatrix: false })).toBe('printerProfilesSection.supportGs1Only');
  });
});
