import { describe, it, expect } from 'vitest';
import { resolvePreAnalyticDateGateConfig } from './resolvePreAnalyticDateGateConfig';

describe('resolvePreAnalyticDateGateConfig — real per-country compliance research', () => {
  it('US resolves CAP/CLIA § 493.1241 with its own designated override label', () => {
    const cfg = resolvePreAnalyticDateGateConfig('US');
    expect(cfg.standardReference).toContain('CAP / CLIA');
    expect(cfg.administrativeOverrideLabel).toBe('Unknown / Not Provided');
    expect(cfg.disclaimerText).toContain('collection or laboratory-receipt date/time');
  });

  it('UK resolves UKAS ISO 15189 / RCPath with "Date Not Provided"', () => {
    const cfg = resolvePreAnalyticDateGateConfig('UK');
    expect(cfg.standardReference).toContain('UKAS ISO 15189');
    expect(cfg.administrativeOverrideLabel).toBe('Date Not Provided');
    expect(cfg.systemNote).toContain('Datix');
  });

  it('EU resolves a single generic config, not per-member-state', () => {
    const cfg = resolvePreAnalyticDateGateConfig('EU');
    expect(cfg.standardReference).toContain('EU IVDR');
  });

  it('NZ, KR, AU each resolve a real, distinct config', () => {
    expect(resolvePreAnalyticDateGateConfig('NZ').administrativeOverrideLabel).toBe('Date/Time Not Stated');
    expect(resolvePreAnalyticDateGateConfig('KR').standardReference).toContain('KAZA');
    expect(resolvePreAnalyticDateGateConfig('AU').standardReference).toContain('NATA');
  });

  it('CA — genuinely absent from direct guidance\u2019s own research table — resolves an honestly-labeled placeholder, never a fabricated citation', () => {
    const cfg = resolvePreAnalyticDateGateConfig('CA');
    expect(cfg.standardReference).toContain('Not yet confirmed');
    expect(cfg.systemNote).toContain('placeholder');
  });

  it('an undefined/unresolvable country falls back to the same honest placeholder shape, never throws', () => {
    const cfg = resolvePreAnalyticDateGateConfig(undefined);
    expect(cfg.standardReference).toContain('Not yet confirmed');
    expect(cfg.administrativeOverrideLabel).toBe('Not Provided');
  });

  it('every real, confirmed jurisdiction returns a non-empty disclaimer and override label — never silently blank', () => {
    (['US', 'UK', 'EU', 'NZ', 'KR', 'AU'] as const).forEach(country => {
      const cfg = resolvePreAnalyticDateGateConfig(country);
      expect(cfg.disclaimerText.length).toBeGreaterThan(0);
      expect(cfg.administrativeOverrideLabel.length).toBeGreaterThan(0);
    });
  });
});
