// src/services/cytology/resolveCytologyScuWeight.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyScuWeight } from './resolveCytologyScuWeight';

describe('resolveCytologyScuWeight — real, per direct guidance\'s own CLIA weight table', () => {
  it('a real, standard full manual screen weighs 1.0 SCU', () => {
    expect(resolveCytologyScuWeight('primary_manual')).toBe(1.0);
  });

  it('a real liquid-based non-gyn prep weighs 0.5 SCU', () => {
    expect(resolveCytologyScuWeight('liquid_nongyn')).toBe(0.5);
  });

  it('a real FOV-assisted pass with no rescreen weighs 0.5 SCU', () => {
    expect(resolveCytologyScuWeight('fov_assisted')).toBe(0.5);
  });

  it('a real FOV pass escalated to full manual rescreen weighs the real, higher 1.5 SCU', () => {
    expect(resolveCytologyScuWeight('fov_manual_rescreen')).toBe(1.5);
  });

  it('a real pathologist confirmatory review weighs 0 — CLIA\'s own daily cap never governs pathologists', () => {
    expect(resolveCytologyScuWeight('pathologist_review')).toBe(0.0);
  });
});
