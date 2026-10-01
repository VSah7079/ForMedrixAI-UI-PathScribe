// @vitest-environment happy-dom
// Batch 368 (PS-353): every case write lands in the change log, attributed.
import { beforeEach, describe, expect, it } from 'vitest';
import { mockCaseService } from '../cases/mockCaseService';
import { mockReportChangeLogService } from './mockReportChangeLogService';
import { SESSION_PROFILE_STORAGE_KEY } from '../auth/sessionProfile';

describe('recording case saves', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, JSON.stringify({ id: 'PATH-001', name: 'Dr Sarah Chen', role: 'pathologist' }));
  });

  it('writes one entry per save with who, when and what changed', async () => {
    const res = await mockCaseService.getAll();
    const target = (res.ok ? res.data : [])[0] as any;
    expect(target).toBeDefined();
    await mockCaseService.updateCase(target.id, { status: target.status === 'pending-review' ? 'in-progress' : 'pending-review' } as any);
    await new Promise(r => setTimeout(r, 0));
    const log = await mockReportChangeLogService.listForCase(target.id);
    expect(log.ok && log.data.length).toBe(1);
    const [entry] = log.ok ? log.data : [];
    expect(entry).toMatchObject({ caseId: target.id, userId: 'PATH-001', userName: 'Dr Sarah Chen' });
    expect(entry.changes).toEqual([expect.objectContaining({ area: 'case', path: ['status'] })]);
  });

  it('writes nothing when a save changes nothing', async () => {
    const res = await mockCaseService.getAll();
    const target = (res.ok ? res.data : [])[0] as any;
    await mockCaseService.updateCase(target.id, { status: target.status } as any);
    await new Promise(r => setTimeout(r, 0));
    const log = await mockReportChangeLogService.listForCase(target.id);
    expect(log.ok && log.data).toEqual([]);
  });
});
