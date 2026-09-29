// src/utils/toastPolicy.test.ts — Batch 349 (PS-100)
import { describe, it, expect } from 'vitest';
import { toastAutoCloseMs, LONG_MESSAGE_CHARS, MIN_TOAST_MS, MAX_TOAST_MS } from './toastPolicy';

describe('toastAutoCloseMs', () => {
  it('warnings and errors stay until closed', () => {
    expect(toastAutoCloseMs('Saved', 'warning')).toBeNull();
    expect(toastAutoCloseMs('Saved', 'error')).toBeNull();
  });
  it('a long message stays until closed, whatever its kind', () => {
    expect(toastAutoCloseMs('x'.repeat(LONG_MESSAGE_CHARS + 1), 'success')).toBeNull();
  });
  it('short confirmations fade after a time that grows with length, within limits', () => {
    expect(toastAutoCloseMs('Saved', 'success')).toBe(MIN_TOAST_MS);
    expect(toastAutoCloseMs('x'.repeat(100))).toBe(7_000);
    expect(toastAutoCloseMs('x'.repeat(LONG_MESSAGE_CHARS))).toBe(8_000);
    expect(toastAutoCloseMs('x'.repeat(LONG_MESSAGE_CHARS))).toBeLessThanOrEqual(MAX_TOAST_MS);
  });
});
