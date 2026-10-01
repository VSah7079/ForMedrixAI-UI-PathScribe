// src/services/cytology/resolveCytologyStructuredWorkflowAccess.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyStructuredWorkflowAccess } from './resolveCytologyStructuredWorkflowAccess';

describe('resolveCytologyStructuredWorkflowAccess — real, per direct guidance\'s own orchestrator-mode gate', () => {
  it('orchestrator mode has access to the real structured workflow', () => {
    expect(resolveCytologyStructuredWorkflowAccess('orchestrator')).toBe(true);
  });

  it('assist mode does NOT — an external LIS owns the report', () => {
    expect(resolveCytologyStructuredWorkflowAccess('assist')).toBe(false);
  });

  it('an undefined/missing reportingMode is never treated as access — the safe default', () => {
    expect(resolveCytologyStructuredWorkflowAccess(undefined)).toBe(false);
  });

  it('any other, unrecognized real value is never treated as access either', () => {
    expect(resolveCytologyStructuredWorkflowAccess('something-else')).toBe(false);
  });
});
