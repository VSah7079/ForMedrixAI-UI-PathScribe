import { describe, it, expect } from 'vitest';
import { resolveQcSlaStatus } from './resolveQcSlaStatus';

describe('resolveQcSlaStatus', () => {
  const createdAt = '2026-01-01T00:00:00.000Z';
  const slaDeadline = '2026-01-02T00:00:00.000Z'; // real, 24-hour window

  it('a real case well within its window is on_time', () => {
    expect(resolveQcSlaStatus(createdAt, slaDeadline, '2026-01-01T04:00:00.000Z')).toBe('on_time');
  });

  it('a real case past the real 80% threshold, but not yet at the deadline, is approaching', () => {
    expect(resolveQcSlaStatus(createdAt, slaDeadline, '2026-01-01T20:00:00.000Z')).toBe('approaching');
  });

  it('a real case exactly at its own real deadline is breached, not merely approaching', () => {
    expect(resolveQcSlaStatus(createdAt, slaDeadline, slaDeadline)).toBe('breached');
  });

  it('a real case past its own real deadline is breached', () => {
    expect(resolveQcSlaStatus(createdAt, slaDeadline, '2026-01-03T00:00:00.000Z')).toBe('breached');
  });
});
