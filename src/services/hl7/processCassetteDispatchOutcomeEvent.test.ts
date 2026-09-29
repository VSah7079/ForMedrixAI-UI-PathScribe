// Batch 363 (PS-72): cassette dispatch notifications are translated and
// redacted in support-ticket screenshots (they name the case).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { toastWarn, toastError, getCase } = vi.hoisted(() => ({ toastWarn: vi.fn(), toastError: vi.fn(), getCase: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { warn: toastWarn, error: toastError, info: vi.fn() } }));
vi.mock('../cases/CaseRouter', () => ({ caseRouter: { getCase } }));

import { processCassetteDispatchOutcomeEvent, _resetCassetteDispatchOutcomeMessageIdsForTests } from './processCassetteDispatchOutcomeEvent';
import { phiToastText } from '../phi/phiToast';

const base = { caseId: 'CASE-1', requestedColorKey: 'pink', specimenLabel: 'A' };

describe('processCassetteDispatchOutcomeEvent notifications', () => {
  beforeEach(() => {
    toastWarn.mockClear(); toastError.mockClear(); getCase.mockReset();
    _resetCassetteDispatchOutcomeMessageIdsForTests();
    getCase.mockResolvedValue({ id: 'CASE-1', accession: { fullAccession: 'S26-4403' } });
  });

  it('a fallback names the case, the specimen and both colors, and is redacted', async () => {
    await processCassetteDispatchOutcomeEvent({ ...base, messageId: 'm1', outcome: 'fallback_used', actualColorKey: 'white' } as never);
    const msg = toastWarn.mock.calls[0][0];
    expect(msg.props['data-phi']).toBe('true');
    expect(phiToastText(msg)).toBe('🧊 S26-4403 (A): cassette color fell back from pink to white — requested hopper unavailable.');
  });

  it('a prompt and a failure use their own wording, with the Engine message when given', async () => {
    await processCassetteDispatchOutcomeEvent({ ...base, messageId: 'm2', outcome: 'prompted' } as never);
    expect(phiToastText(toastWarn.mock.calls[0][0])).toContain('the pink hopper is unavailable');
    await processCassetteDispatchOutcomeEvent({ ...base, messageId: 'm3', outcome: 'error', message: 'Printer offline' } as never);
    expect(phiToastText(toastError.mock.calls[0][0])).toBe('🧊 S26-4403 (A): cassette dispatch failed — Printer offline');
    expect(toastError.mock.calls[0][0].props['data-phi']).toBe('true');
  });

  it('a routine dispatch shows nothing', async () => {
    await processCassetteDispatchOutcomeEvent({ ...base, messageId: 'm4', outcome: 'dispatched' } as never);
    expect(toastWarn).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
