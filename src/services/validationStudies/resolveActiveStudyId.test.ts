import { describe, it, expect, vi } from 'vitest';
import { resolveActiveStudyId } from './resolveActiveStudyId';

const scope = { clientId: 'fac-1', pathologistId: 'u-1', subspecialtyId: 'breast' };

describe('resolveActiveStudyId', () => {
  it('returns the covering study\'s id and passes the full scope through', async () => {
    const getStudyForCase = vi.fn().mockResolvedValue({ ok: true, data: { id: 'vs-1' } });
    expect(await resolveActiveStudyId(scope, { getStudyForCase })).toBe('vs-1');
    expect(getStudyForCase).toHaveBeenCalledWith('fac-1', 'u-1', 'breast');
  });

  it('returns undefined when no active study covers the case', async () => {
    expect(await resolveActiveStudyId(scope, { getStudyForCase: vi.fn().mockResolvedValue({ ok: true, data: null }) })).toBeUndefined();
    expect(await resolveActiveStudyId(scope, { getStudyForCase: vi.fn().mockResolvedValue({ ok: false, error: 'x' }) })).toBeUndefined();
  });

  it('a failed lookup gives undefined rather than throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolveActiveStudyId(scope, { getStudyForCase: vi.fn().mockRejectedValue(new Error('down')) })).toBeUndefined();
    spy.mockRestore();
  });
});
