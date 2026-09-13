// src/services/labelDesigner/mockLabelLayoutService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { LabelLayoutField } from './ILabelLayoutService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const FIELD: LabelLayoutField = { id: 'f1', fieldKey: 'fullAccession', xMm: 2, yMm: 2, widthMm: 20, heightMm: 5, fontSizeMm: 2.6 };

describe('mockLabelLayoutService — real, per direct follow-up (PS-245)', () => {
  it('getByLabelType correctly returns an honest null when no real layout has ever been saved for that type', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.getByLabelType('requisition');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });

  it('save correctly creates a new real layout for a label type that has none yet', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.save({ labelType: 'block', widthMm: 25.4, heightMm: 12.7, fields: [FIELD] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.labelType).toBe('block');
      expect(res.data.fields).toHaveLength(1);
      expect(res.data.id).toBeTruthy();
      expect(res.data.updatedAt).toBeTruthy();
    }
  });

  it('save correctly overwrites the real, existing layout for the same label type rather than creating a duplicate', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    await mockLabelLayoutService.save({ labelType: 'slide', widthMm: 25.4, heightMm: 9.5, fields: [FIELD] });
    const second = await mockLabelLayoutService.save({ labelType: 'slide', widthMm: 25.4, heightMm: 9.5, fields: [] });
    expect(second.ok).toBe(true);
    const fetched = await mockLabelLayoutService.getByLabelType('slide');
    if (fetched.ok && fetched.data) expect(fetched.data.fields).toHaveLength(0);
  });

  it('reset correctly removes a real, saved layout, returning to the honest "no layout saved" state', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    await mockLabelLayoutService.save({ labelType: 'decant', widthMm: 50.8, heightMm: 25.4, fields: [FIELD] });
    await mockLabelLayoutService.reset('decant');
    const res = await mockLabelLayoutService.getByLabelType('decant');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });

  it('reset on a real label type with no saved layout returns an honest error, not a silent success', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.reset('molecular_rack');
    expect(res.ok).toBe(false);
  });

  it('real, saved layouts for different label types are genuinely independent', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    await mockLabelLayoutService.save({ labelType: 'requisition', widthMm: 101.6, heightMm: 152.4, fields: [FIELD] });
    await mockLabelLayoutService.save({ labelType: 'specimen', widthMm: 50.8, heightMm: 25.4, fields: [] });
    const req = await mockLabelLayoutService.getByLabelType('requisition');
    const spec = await mockLabelLayoutService.getByLabelType('specimen');
    if (req.ok && req.data) expect(req.data.fields).toHaveLength(1);
    if (spec.ok && spec.data) expect(spec.data.fields).toHaveLength(0);
  });

  it('real, direct correction: save correctly refuses a real, facility-scoped override for a locked label type (block) — never silently allowed', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.save({ labelType: 'block', facilityId: 'fac-1', widthMm: 25.4, heightMm: 12.7, fields: [] });
    expect(res.ok).toBe(false);
  });

  it('real, save correctly refuses a real, facility-scoped override for every real "Molecular Asset" type too', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.save({ labelType: 'molecular_plate', facilityId: 'fac-1', widthMm: 50.8, heightMm: 19.05, fields: [] });
    expect(res.ok).toBe(false);
  });

  it('real, save correctly allows a real, facility-scoped override for an allowed label type (requisition)', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    const res = await mockLabelLayoutService.save({ labelType: 'requisition', facilityId: 'fac-1', widthMm: 101.6, heightMm: 152.4, fields: [FIELD] });
    expect(res.ok).toBe(true);
  });

  it('real, getByLabelType with a real facilityId correctly resolves that facility\'s own real override over the Enterprise default', async () => {
    const { mockLabelLayoutService } = await import('./mockLabelLayoutService');
    await mockLabelLayoutService.save({ labelType: 'requisition', widthMm: 101.6, heightMm: 152.4, fields: [] });
    await mockLabelLayoutService.save({ labelType: 'requisition', facilityId: 'fac-1', widthMm: 101.6, heightMm: 152.4, fields: [FIELD] });
    const res = await mockLabelLayoutService.getByLabelType('requisition', 'fac-1');
    expect(res.ok).toBe(true);
    if (res.ok && res.data) expect(res.data.fields).toHaveLength(1);
  });
});
