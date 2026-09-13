// src/services/molecular/resolveMolecularRunValidationGating.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMolecularRunValidationGating } from './resolveMolecularRunValidationGating';

describe('resolveMolecularRunValidationGating — real, per the given specification\'s own §5.2', () => {
  it('a real run with controls passed correctly resolves to AUTO_PASSED', () => {
    expect(resolveMolecularRunValidationGating(true)).toBe('AUTO_PASSED');
  });

  it('a real run with controls failed correctly resolves to BLOCKED, never auto-verified', () => {
    expect(resolveMolecularRunValidationGating(false)).toBe('BLOCKED');
  });
});
