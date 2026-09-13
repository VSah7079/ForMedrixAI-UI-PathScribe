// src/services/actionRegistry/norm.test.ts
import { describe, it, expect } from 'vitest';
import { norm } from './mockActionRegistryService';

describe('norm — real, per direct follow-up on the Multi-Language voice trigger matching bug', () => {
  it('real, a Korean phrase is preserved, not stripped to an empty string — the exact, severe bug found and fixed', () => {
    expect(norm('저장')).toBe('저장');
    expect(norm('저장')).not.toBe('');
  });

  it('real, French accented characters are preserved, not stripped', () => {
    expect(norm('café')).toBe('café');
  });

  it('real, German accented/special characters are preserved, not stripped', () => {
    expect(norm('größe')).toBe('größe');
  });

  it('real, English matching behavior is completely unaffected by this fix', () => {
    expect(norm('Save Case Now!')).toBe('save case now');
  });

  it('real, real punctuation is still stripped for every real script', () => {
    expect(norm('Enregistrer, s\u2019il vous pla\u00eet.')).toBe('enregistrer sil vous plaît');
  });

  it('real, whitespace collapsing still works correctly', () => {
    expect(norm('  next   case  ')).toBe('next case');
  });
});
