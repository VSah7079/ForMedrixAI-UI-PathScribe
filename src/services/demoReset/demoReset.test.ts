// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { resetAllDemoData, keptThroughReset } from './demoReset';

describe('resetAllDemoData (PS-356)', () => {
  it('refuses without config:demo-data:reset, and clears nothing', async () => {
    localStorage.setItem('pathscribe_mock_cases', '[1]');
    const checks: string[] = [];
    const res = await resetAllDemoData({ authorization: { enforce: async (c: string) => { checks.push(c); return { capability: c, allowed: false, grantedBy: [], missingRequirements: [], context: {} }; } } });
    expect(res).toEqual({ ok: false, reason: 'notPermitted' });
    expect(checks).toEqual(['config:demo-data:reset']);
    expect(localStorage.getItem('pathscribe_mock_cases')).toBe('[1]');
  });
  it('clears with it', async () => {
    localStorage.setItem('pathscribe_mock_cases', '[1]');
    const res = await resetAllDemoData({ authorization: { enforce: async (c: string) => ({ capability: c, allowed: true, grantedBy: [], missingRequirements: [], context: {} }) } });
    expect(res.ok).toBe(true);
    expect(localStorage.getItem('pathscribe_mock_cases')).toBeNull();
  });
  it('keeps the audit trails, which the mock services store under the mock prefix (Batch 372)', async () => {
    localStorage.setItem('pathscribe_mock_pathscribe_audit_logs', '[1]');
    localStorage.setItem('pathscribe_mock_pathscribe_support_audit', '{}');
    localStorage.setItem('pathscribe_mock_pathscribe_support_access_requests', '[1]');
    const res = await resetAllDemoData({ authorization: { enforce: async (c: string) => ({ capability: c, allowed: true, grantedBy: [], missingRequirements: [], context: {} }) } });
    expect(res.ok).toBe(true);
    expect(localStorage.getItem('pathscribe_mock_pathscribe_audit_logs')).toBe('[1]');
    expect(localStorage.getItem('pathscribe_mock_pathscribe_support_audit')).toBe('{}');
    expect(localStorage.getItem('pathscribe_mock_pathscribe_support_access_requests')).toBeNull();
    expect(keptThroughReset('ps_ai_audit_log_v1')).toBe(true);
    expect(keptThroughReset('pathscribe_mock_cases')).toBe(false);
  });
});
