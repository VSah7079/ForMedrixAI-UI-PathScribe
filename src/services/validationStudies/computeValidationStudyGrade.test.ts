// src/services/validationStudies/computeValidationStudyGrade.test.ts
import { describe, it, expect } from 'vitest';
import { computeValidationStudyGrade } from './computeValidationStudyGrade';

describe('computeValidationStudyGrade', () => {
  it('PASS: acceptance rate meets target AND edit ratio stays at or under its target ceiling', () => {
    const result = computeValidationStudyGrade(0.9, 0.85, 0.1, 0.15);
    expect(result.grade).toBe('PASS');
    expect(result.color).toBe('#10b981');
  });

  it('PASS: exact boundary values (acceptance rate == target, edit ratio == target ceiling) still pass', () => {
    const result = computeValidationStudyGrade(0.85, 0.85, 0.15, 0.15);
    expect(result.grade).toBe('PASS');
  });

  it('CONDITIONAL PASS: acceptance rate meets target but edit ratio exceeds its ceiling', () => {
    const result = computeValidationStudyGrade(0.9, 0.85, 0.2, 0.15);
    expect(result.grade).toBe('CONDITIONAL PASS');
    expect(result.color).toBe('#f59e0b');
  });

  it('CONDITIONAL PASS: acceptance rate is below target but still at least 85% of it', () => {
    // target 0.85 * 0.85 = 0.7225 — 0.73 clears that partial bar.
    const result = computeValidationStudyGrade(0.73, 0.85, 0.5, 0.15);
    expect(result.grade).toBe('CONDITIONAL PASS');
  });

  it('CONDITIONAL PASS: exact 85%-of-target boundary counts as partial', () => {
    const targetAcceptanceRate = 0.8;
    const result = computeValidationStudyGrade(targetAcceptanceRate * 0.85, targetAcceptanceRate, 0.5, 0.15);
    expect(result.grade).toBe('CONDITIONAL PASS');
  });

  it('FURTHER REVIEW: acceptance rate below 85% of target', () => {
    const result = computeValidationStudyGrade(0.5, 0.85, 0.1, 0.15);
    expect(result.grade).toBe('FURTHER REVIEW');
    expect(result.color).toBe('#ef4444');
  });

  it('FURTHER REVIEW takes priority display-wise only when neither PASS nor the 85% partial bar is met, even with a great edit ratio', () => {
    const result = computeValidationStudyGrade(0.1, 0.85, 0.0, 0.15);
    expect(result.grade).toBe('FURTHER REVIEW');
  });

  it('description text is stable, plain English — persisted/exported data, not on-screen UI copy', () => {
    expect(computeValidationStudyGrade(0.9, 0.85, 0.1, 0.15).description).toBe('Performance meets study targets');
    expect(computeValidationStudyGrade(0.9, 0.85, 0.2, 0.15).description).toBe('Performance approaches targets — extended study recommended');
    expect(computeValidationStudyGrade(0.1, 0.85, 0.0, 0.15).description).toBe('Performance below targets — review AI configuration');
  });
});
