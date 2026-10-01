// src/services/stains/mockStainTypeService.test.ts
import { describe, it, expect } from 'vitest';
import { mockStainTypeService } from './mockStainTypeService';

describe('mockStainTypeService seed data — real, demo-labeled CPT assignments (per direct request)', () => {
  it('special stains carry the real SPECIAL-STAIN billingCode key (resolves to CPT 88312), not the raw CPT number directly', async () => {
    // Real fix, found via direct live testing: these previously held
    // the raw CPT string ('88312') as defaultBillingCode, but
    // recordChargeTransaction resolves defaultBillingCode as a
    // billingCode dictionary KEY (mockBillingRuleService.ts), not a
    // CPT code directly - '88312' was never a real billingCode there
    // (the real key is 'SPECIAL-STAIN'), so approving these stains'
    // suggestions always silently failed to produce a real charge.
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const pas = res.data.find(s => s.id === 'st-pas');
    const gms = res.data.find(s => s.id === 'st-gms');
    expect(pas?.defaultBillingCode).toBe('SPECIAL-STAIN');
    expect(gms?.defaultBillingCode).toBe('SPECIAL-STAIN');
  });

  it('the p63/CK5/6 dual stain carries its own, honestly-named billingCode key (P63-CK56-DUAL, resolves to CPT 88344), not PIN4-PANEL\u2019s name or the raw CPT number', async () => {
    // Real fix, same root cause as above - '88344' was never a real
    // billingCode key either. Deliberately its own real dictionary
    // entry rather than reusing PIN4-PANEL (a clinically different,
    // prostate-specific cocktail that only happens to share the same
    // real CPT) - a shared CPT doesn't mean a shared billingCode.
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const dualStain = res.data.find(s => s.id === 'st-p63-ck56');
    expect(dualStain?.defaultBillingCode).toBe('P63-CK56-DUAL');
  });

  it('the p63/CK5/6 dual stain is flagged excludeFromIhcSequenceCounting — a genuine standalone multiplex panel, never a countable individual IHC stain', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const dualStain = res.data.find(s => s.id === 'st-p63-ck56');
    expect(dualStain?.excludeFromIhcSequenceCounting).toBe(true);
  });

  it('a plain, single-antibody defaultBillingCode entry (no multiplex reason) does not set excludeFromIhcSequenceCounting by default', async () => {
    const res = await mockStainTypeService.getAll();
    if (!res.ok) throw new Error('setup failed');
    const pas = res.data.find(s => s.id === 'st-pas');
    expect(pas?.excludeFromIhcSequenceCounting).toBeUndefined();
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

  it('real regression check: every real, assigned defaultBillingCode genuinely resolves against the live billing rule dictionary - the exact class of bug found via direct live testing (PAS/GMS/Trichrome/p63-CK5-6 previously pointed at raw CPT numbers that were never real billingCode keys, so approving them always silently failed to produce a charge)', async () => {
    const { mockBillingRuleService } = await import('@/services/billing/mockBillingRuleService');
    const stainsRes = await mockStainTypeService.getAll();
    const rulesRes = await mockBillingRuleService.getAll();
    if (!stainsRes.ok || !rulesRes.ok) throw new Error('setup failed');
    const realBillingCodes = new Set(rulesRes.data.map(r => r.billingCode));
    const stainsWithDefaultCode = stainsRes.data.filter(s => s.defaultBillingCode);
    expect(stainsWithDefaultCode.length).toBeGreaterThan(0); // real seed data exists to check
    for (const stain of stainsWithDefaultCode) {
      expect(realBillingCodes.has(stain.defaultBillingCode!)).toBe(true);
    }
  });
});
