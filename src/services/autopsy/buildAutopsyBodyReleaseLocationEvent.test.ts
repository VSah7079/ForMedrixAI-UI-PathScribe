import { describe, it, expect } from 'vitest';
import { buildAutopsyBodyReleaseLocationEvent } from './buildAutopsyBodyReleaseLocationEvent';

describe('buildAutopsyBodyReleaseLocationEvent', () => {
  it('builds a real MaterialLocation entry with the real destination as location and Released as the real action', () => {
    const result = buildAutopsyBodyReleaseLocationEvent({
      releasedTo: 'Smith Family Funeral Home',
      releasedByName: 'Tech: M. Davis',
      releasedAt: '2026-09-10T09:00:00Z',
    });
    expect(result).toEqual({
      location: 'Smith Family Funeral Home',
      action: 'Released',
      at: '2026-09-10T09:00:00Z',
      source: 'PathScribe',
      performedByName: 'Tech: M. Davis',
    });
  });

  it('a real, omitted releasedAt defaults to real "now", never left unset', () => {
    const before = new Date().toISOString();
    const result = buildAutopsyBodyReleaseLocationEvent({ releasedTo: 'Released directly to next of kin', releasedByName: 'Tech: M. Davis' });
    const after = new Date().toISOString();
    expect(result.at >= before && result.at <= after).toBe(true);
  });

  it('never matched against or dependent on the Asset Location Dictionary \u2014 an arbitrary, external destination string is accepted as-is', () => {
    const result = buildAutopsyBodyReleaseLocationEvent({ releasedTo: 'Some Funeral Home Never Seen Before', releasedByName: 'Tech: M. Davis', releasedAt: '2026-09-10T09:00:00Z' });
    expect(result.location).toBe('Some Funeral Home Never Seen Before');
  });
});
