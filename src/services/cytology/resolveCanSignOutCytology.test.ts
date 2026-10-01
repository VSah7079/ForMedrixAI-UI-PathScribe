// src/services/cytology/resolveCanSignOutCytology.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCanSignOutCytology } from './resolveCanSignOutCytology';
import type { CytologySignOutGateResult } from './resolveCytologySignOutGate';

const ALLOWED: CytologySignOutGateResult = { allowed: true, blockedReasons: [] };
const BLOCKED: CytologySignOutGateResult = { allowed: false, blockedReasons: ['requires_pathologist_review'] };

describe('resolveCanSignOutCytology', () => {
  it('a Pathologist can always sign out, even when the CT gate itself is blocked', () => {
    expect(resolveCanSignOutCytology(true, BLOCKED)).toBe(true);
  });

  it('a Pathologist signing out an already-CT-eligible case is still allowed', () => {
    expect(resolveCanSignOutCytology(true, ALLOWED)).toBe(true);
  });

  it('a non-Pathologist can sign out only when the real CT gate itself allows it', () => {
    expect(resolveCanSignOutCytology(false, ALLOWED)).toBe(true);
    expect(resolveCanSignOutCytology(false, BLOCKED)).toBe(false);
  });
});
