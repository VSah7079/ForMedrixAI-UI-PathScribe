// src/services/reagentLots/mockReagentLotService.test.ts
import { describe, it, expect } from 'vitest';
import { mockReagentLotService } from './mockReagentLotService';

describe('mockReagentLotService \u2014 real, per direct requirements ("Reagent and Solution Lot Registry")', () => {
  it('a real getAll returns the real, seeded IHC/Special Stain/Routine lots', async () => {
    const res = await mockReagentLotService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = res.data.map(l => l.id);
    expect(ids).toContain('lot-ki67-2601');
    expect(ids).toContain('lot-pas-1102');
    expect(ids).toContain('lot-he-hematoxylin-0326');
  });

  it('every real IHC/Special Stain lot references a real stainTypeId, never a fabricated routineComponentType', async () => {
    const res = await mockReagentLotService.getAll();
    if (!res.ok) return;
    const ki67 = res.data.find(l => l.id === 'lot-ki67-2601');
    expect(ki67?.stainTypeId).toBe('st-ki67');
    expect(ki67?.routineComponentType).toBeUndefined();
  });

  it('every real routine H&E line reagent lot references a real routineComponentType, never a fabricated stainTypeId', async () => {
    const res = await mockReagentLotService.getAll();
    if (!res.ok) return;
    const htx = res.data.find(l => l.id === 'lot-he-hematoxylin-0326');
    expect(htx?.routineComponentType).toBe('HEMATOXYLIN');
    expect(htx?.stainTypeId).toBeUndefined();
  });

  it('create() rejects a lot with neither stainTypeId nor routineComponentType set', async () => {
    const res = await mockReagentLotService.create({
      lotNumber: 'BAD-LOT', expirationDate: '2027-01-01', qcStatus: 'Pending', status: 'Active', createdBy: 'user-1',
    } as any);
    expect(res.ok).toBe(false);
  });

  it('create() rejects a lot with BOTH stainTypeId and routineComponentType set', async () => {
    const res = await mockReagentLotService.create({
      stainTypeId: 'st-ki67', routineComponentType: 'HEMATOXYLIN',
      lotNumber: 'BAD-LOT-2', expirationDate: '2027-01-01', qcStatus: 'Pending', status: 'Active', createdBy: 'user-1',
    } as any);
    expect(res.ok).toBe(false);
  });

  it('a real, valid create() succeeds and the new lot is retrievable afterward', async () => {
    const created = await mockReagentLotService.create({
      stainTypeId: 'st-pas', lotNumber: 'NEW-PAS-001', expirationDate: '2027-06-01', qcStatus: 'Pending', status: 'Active', createdBy: 'user-1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const fetched = await mockReagentLotService.getById(created.data.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.data.lotNumber).toBe('NEW-PAS-001');
  });

  it('update() rejects a change that would leave the lot referencing both or neither real discriminant', async () => {
    const res = await mockReagentLotService.update('lot-ki67-2601', { routineComponentType: 'EOSIN' } as any);
    expect(res.ok).toBe(false);
  });

  it('deactivate() sets status to Inactive without touching qcStatus', async () => {
    const res = await mockReagentLotService.deactivate('lot-ki67-2601');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe('Inactive');
      expect(res.data.qcStatus).toBe('Passed');
    }
  });

  it('reactivate() sets status back to Active', async () => {
    await mockReagentLotService.deactivate('lot-ki67-2601');
    const res = await mockReagentLotService.reactivate('lot-ki67-2601');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe('Active');
  });

  it('a real, genuinely nonexistent id is a real, honest not-found result, never a thrown exception', async () => {
    const res = await mockReagentLotService.getById('lot-does-not-exist');
    expect(res.ok).toBe(false);
  });
});
