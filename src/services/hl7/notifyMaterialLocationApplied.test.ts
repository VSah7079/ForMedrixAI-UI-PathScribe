import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastInfo, getCase } = vi.hoisted(() => ({ toastInfo: vi.fn(), getCase: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { info: toastInfo, warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase } }));

import { notifyMaterialLocationApplied } from './notifyMaterialLocationApplied';

describe('notifyMaterialLocationApplied', () => {
  beforeEach(() => {
    toastInfo.mockClear();
    getCase.mockReset();
  });

  it('shows a real toast with the accession, target, location, and action', async () => {
    getCase.mockResolvedValue({ accession: { fullAccession: 'S26-4403' } });
    await notifyMaterialLocationApplied({ messageId: 'msg-1', caseId: 'CASE-1', targetDescription: 'A1-L2', location: 'Staining', action: 'Coverslipped' });
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const message = toastInfo.mock.calls[0][0];
    expect(message).toContain('S26-4403');
    expect(message).toContain('A1-L2');
    expect(message).toContain('Staining');
    expect(message).toContain('Coverslipped');
  });

  it('never shows a second toast for a redelivered messageId', async () => {
    getCase.mockResolvedValue({ accession: { fullAccession: 'S26-4403' } });
    const payload = { messageId: 'msg-2', caseId: 'CASE-1', targetDescription: 'Specimen A', location: 'Grossing' };
    await notifyMaterialLocationApplied(payload);
    await notifyMaterialLocationApplied(payload);
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });
});
