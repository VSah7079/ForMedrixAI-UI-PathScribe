import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastWarn, getCase } = vi.hoisted(() => ({ toastWarn: vi.fn(), getCase: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { warn: toastWarn, info: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase } }));

import { notifyBlockExceptionApplied } from './notifyBlockExceptionApplied';
import { phiToastText } from '../phi/phiToast';

describe('notifyBlockExceptionApplied', () => {
  beforeEach(() => {
    toastWarn.mockClear();
    getCase.mockReset();
  });

  it('shows a real toast with the accession, block, and status', async () => {
    getCase.mockResolvedValue({ accession: { fullAccession: 'S26-4403' } });
    await notifyBlockExceptionApplied({ messageId: 'msg-1', caseId: 'CASE-1', specimenLetter: 'A', blockNumber: '1', status: 'Lost', note: 'Dropped at bench' });
    expect(toastWarn).toHaveBeenCalledTimes(1);
    const message = phiToastText(toastWarn.mock.calls[0][0]);
    expect(message).toContain('S26-4403');
    expect(message).toContain('A1');
    expect(message).toContain('lost');
    expect(message).toContain('Dropped at bench');
    // Batch 363 (PS-72): it names the case, so screenshots redact it.
    expect(toastWarn.mock.calls[0][0].props['data-phi']).toBe('true');
  });

  it('falls back to caseId when the case has no fullAccession available', async () => {
    getCase.mockResolvedValue(null);
    await notifyBlockExceptionApplied({ messageId: 'msg-2', caseId: 'CASE-2', specimenLetter: 'B', blockNumber: '3', status: 'Damaged' });
    expect(phiToastText(toastWarn.mock.calls[0][0])).toContain('CASE-2');
  });

  it('never shows a second toast for a redelivered messageId', async () => {
    getCase.mockResolvedValue({ accession: { fullAccession: 'S26-4403' } });
    const payload = { messageId: 'msg-3', caseId: 'CASE-1', specimenLetter: 'A', blockNumber: '1', status: 'Lost' as const };
    await notifyBlockExceptionApplied(payload);
    await notifyBlockExceptionApplied(payload);
    expect(toastWarn).toHaveBeenCalledTimes(1);
  });
});
