// src/services/stains/mockStainTypeService.test.ts
import { describe, it, expect } from 'vitest';
import { mockStainTypeService } from './mockStainTypeService';

describe('mockStainTypeService seed data — real, demo-labeled CPT assignments (per direct request)', () => {
  it('special stains carry the real, verified 88312 code', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const pas = res.data.find(s => s.id === 'st-pas');
    const gms = res.data.find(s => s.id === 'st-gms');
    expect(pas?.defaultBillingCode).toBe('88312');
    expect(gms?.defaultBillingCode).toBe('88312');
  });

  it('the p63/CK5/6 dual stain carries the real, researched 88344 multiplex code, not the generic single-antibody rule', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const dualStain = res.data.find(s => s.id === 'st-p63-ck56');
    expect(dualStain?.defaultBillingCode).toBe('88344');
  });

  it('standard, single-antibody IHC stains (ER/PR/HER2/Ki-67/PD-L1) are left unassigned - the generic first/additional rule genuinely applies to them', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    for (const id of ['st-er', 'st-pr', 'st-her2', 'st-ki67', 'st-pdl1']) {
      const stain = res.data.find(s => s.id === id);
      expect(stain?.defaultBillingCode).toBeUndefined();
    }
  });

  it('immunofluorescence and other non-CPT-verified categories are never assigned a fabricated code', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const ifStains = res.data.filter(s => s.category === 'Immunofluorescence' || s.category === 'Other');
    expect(ifStains.length).toBeGreaterThan(0); // real seed data exists to check
    ifStains.forEach(s => expect(s.defaultBillingCode).toBeUndefined());
  });
});
