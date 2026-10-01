// @vitest-environment happy-dom
// Batch 364 (PS-350): support references are created once per record, random, and resolving one is audited.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn(() => Promise.resolve({ ok: true })) }));
vi.mock('../auditlog/mockAuditService', () => ({ mockAuditService: { logEvent } }));

import { mockSupportReferenceService as svc, SUPPORT_REFERENCE_STORAGE_KEY } from './mockSupportReferenceService';
import { storageClear } from '../mockStorage';

const actor = { id: 'u1', name: 'Dr. Test' };

describe('mockSupportReferenceService', () => {
  beforeEach(() => { storageClear(SUPPORT_REFERENCE_STORAGE_KEY); logEvent.mockClear(); });

  it('gives a record one reference, created on first request', async () => {
    const a = await svc.forRecord('case', 'S26-4403');
    const b = await svc.forRecord('case', 'S26-4403');
    expect(a.ok && b.ok && a.data.ref === b.data.ref).toBe(true);
    const other = await svc.forRecord('case', 'S26-4404');
    expect(other.ok && a.ok && other.data.ref !== a.data.ref).toBe(true);
  });

  it('the reference does not contain the case number', async () => {
    const r = await svc.forRecord('case', 'S26-4403');
    expect(r.ok && r.data.ref).toMatch(/^SR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(r.ok && r.data.ref.includes('4403')).toBe(false);
  });

  it('resolves a reference (as typed) and audits the lookup', async () => {
    const r = await svc.forRecord('auditEntry', 'al-07');
    if (!r.ok) throw new Error('create failed');
    const found = await svc.resolve(r.data.ref.toLowerCase().replace(/-/g, ''), actor);
    expect(found.ok && found.data).toMatchObject({ kind: 'auditEntry', recordId: 'al-07' });
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'support_reference.resolved', user: 'Dr. Test' }));
  });

  it('refuses a malformed or unknown reference, without auditing', async () => {
    expect(await svc.resolve('hello', actor)).toEqual({ ok: false, error: 'supportReferenceInvalid' });
    expect(await svc.resolve('SR-0000-0000', actor)).toEqual({ ok: false, error: 'supportReferenceNotFound' });
    expect(logEvent).not.toHaveBeenCalled();
  });
});
